import { commitmentOccursOn } from './recurrence'
import { isOpen, isWorkItem, openDependencies, priorityScores, remainingMinutes, type PriorityBreakdown } from './priority'
import { addDays, at, ceilTo, dayKey, minuteOfDay, subtractIntervals, totalMinutes, weekday, type Interval } from './time'
import type { Commitment, DayKey, ID, LifeSettings, PlanBlock, Task } from './types'

/**
 * Deterministic local planner. No randomness, no clock reads: the same input always
 * yields the same plan, so plans can be diffed, explained and tested.
 *
 * Pipeline per call:
 *  1. Build each day's working window, remove commitments and pinned tasks → free time.
 *  2. Keep `bufferPct` of free time unplanned (contingency) → daily budget.
 *  3. Repeatedly take the highest-priority task whose dependencies are closed or already
 *     placed, and fill the earliest free slots after its earliest start, splitting it into
 *     sessions ≤ maxSessionMin with `gapMin` between blocks.
 *  4. Report what didn't fit and which deadlines are at risk.
 */

export interface ExtraBusy { day: DayKey; startMin: number; endMin: number; title: string }

export interface PlanInput {
  tasks: Task[]
  commitments: Commitment[]
  settings: LifeSettings
  now: number
  days?: number
  /** Explicit rest days (from day logs) on top of `restWeekdays`. */
  restDays?: DayKey[]
  extraBusy?: ExtraBusy[]
}

export interface DayCapacity {
  day: DayKey
  rest: boolean
  windowMin: number
  commitmentMin: number
  pinnedMin: number
  freeMin: number
  /** Free time minus the contingency buffer: the most the planner will fill. */
  budgetMin: number
  plannedMin: number
  deepMin: number
}

export type UnscheduledReason = 'no_capacity' | 'dependency_unscheduled' | 'starts_after_horizon'

export interface Unscheduled { taskId: ID; reason: UnscheduledReason; remainingMin: number; placedMin: number; blockedBy?: ID[] }

export interface AtRisk {
  taskId: ID
  dueAt: number
  kind: 'late' | 'unscheduled' | 'tight'
  projectedEnd?: number
  /** Positive = minutes after the deadline. */
  lateMin?: number
}

export interface Overload { day: DayKey; demandMin: number; capacityMin: number }

export interface PlanResult {
  from: DayKey
  days: DayKey[]
  blocks: PlanBlock[]
  capacity: DayCapacity[]
  unscheduled: Unscheduled[]
  atRisk: AtRisk[]
  /** First day where work due by that day exceeds the cumulative budget. */
  overload?: Overload
  /** Projected end instant of every placed task. */
  finishAt: Record<ID, number>
  scores: Record<ID, PriorityBreakdown>
}

const STEP = 5

export const isRestDay = (day: DayKey, s: LifeSettings, rest: Set<DayKey>) => rest.has(day) || s.restWeekdays.includes(weekday(day))

export function plan(input: PlanInput): PlanResult {
  const { settings: s, now } = input
  const horizon = Math.max(1, input.days ?? s.planHorizonDays)
  const from = dayKey(now)
  const days = Array.from({ length: horizon }, (_, i) => addDays(from, i))
  const last = days[days.length - 1]!
  const rest = new Set(input.restDays ?? [])
  const work = input.tasks.filter(isWorkItem)
  const byId = new Map(work.map((t) => [t.id, t]))
  const scoreMap = priorityScores(work.filter(isOpen), s, now)
  const scores = Object.fromEntries(scoreMap)
  const blocks: PlanBlock[] = []
  const finishAt: Record<ID, number> = {}
  const free = new Map<DayKey, Interval[]>()
  const budgetLeft = new Map<DayKey, number>()
  const deepLeft = new Map<DayKey, number>()
  const capacity: DayCapacity[] = []

  // 1–2. Windows, fixed blocks, budgets.
  for (const day of days) {
    const startMin = day === from ? Math.max(s.dayStartMin, ceilTo(minuteOfDay(now), STEP)) : s.dayStartMin
    const window: Interval[] = startMin < s.dayEndMin ? [[startMin, s.dayEndMin]] : []
    const busy: Interval[] = []
    let commitmentMin = 0
    for (const c of input.commitments) {
      if (!commitmentOccursOn(c, day)) continue
      blocks.push({ id: `c:${c.id}:${day}`, day, startMin: c.startMin, endMin: c.endMin, kind: 'commitment', title: c.title, commitmentId: c.id })
      busy.push([c.startMin, c.endMin])
      commitmentMin += totalMinutes(subtractIntervals([[c.startMin, c.endMin]], subtractIntervals([[0, 1440]], window)))
    }
    for (const x of input.extraBusy ?? []) if (x.day === day) busy.push([x.startMin, x.endMin])
    let pinnedMin = 0
    for (const t of work) {
      if (!isOpen(t) || t.pinned?.day !== day) continue
      const len = Math.max(15, remainingMinutes(t, s) || 15)
      const end = Math.min(1440, t.pinned.startMin + len)
      blocks.push({ id: `p:${t.id}:${day}`, day, startMin: t.pinned.startMin, endMin: end, kind: 'pinned', title: t.title, taskId: t.id, confidence: t.confidence })
      busy.push([t.pinned.startMin, end])
      pinnedMin += end - t.pinned.startMin
      finishAt[t.id] = at(day, end)
    }
    const isRest = isRestDay(day, s, rest)
    const dayFree = isRest ? [] : subtractIntervals(window, busy)
    const freeMin = totalMinutes(dayFree)
    const budgetMin = Math.floor((freeMin * (1 - Math.min(0.5, Math.max(0, s.bufferPct)))) / STEP) * STEP
    free.set(day, dayFree)
    budgetLeft.set(day, budgetMin)
    deepLeft.set(day, s.maxDeepMinPerDay)
    capacity.push({ day, rest: isRest, windowMin: totalMinutes(window), commitmentMin, pinnedMin, freeMin, budgetMin, plannedMin: 0, deepMin: 0 })
  }
  const capByDay = new Map(capacity.map((c) => [c.day, c]))

  // 3. Priority-ordered, dependency-aware placement.
  const pinnedIds = new Set(work.filter((t) => isOpen(t) && t.pinned && days.includes(t.pinned.day)).map((t) => t.id))
  const pending = work.filter((t) => isOpen(t) && !pinnedIds.has(t.id) && remainingMinutes(t, s) > 0)
  const unscheduled: Unscheduled[] = []
  const failed = new Set<ID>()
  const rank = (t: Task) => scoreMap.get(t.id)?.score ?? 0
  const order = (a: Task, b: Task) =>
    rank(b) - rank(a) || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.createdAt - b.createdAt || a.id.localeCompare(b.id)

  while (pending.length) {
    pending.sort(order)
    const idx = pending.findIndex((t) => openDependencies(t, byId).every((d) => finishAt[d.id] !== undefined && !failed.has(d.id)))
    if (idx < 0) {
      for (const t of pending) {
        const blockedBy = openDependencies(t, byId).filter((d) => finishAt[d.id] === undefined || failed.has(d.id)).map((d) => d.id)
        unscheduled.push({ taskId: t.id, reason: 'dependency_unscheduled', remainingMin: remainingMinutes(t, s), placedMin: 0, blockedBy })
        failed.add(t.id)
      }
      break
    }
    const t = pending.splice(idx, 1)[0]!
    const need = remainingMinutes(t, s)
    let earliest = Math.max(now, t.startDate ? at(t.startDate, 0) : 0)
    for (const d of openDependencies(t, byId)) earliest = Math.max(earliest, finishAt[d.id]!)
    if (t.startDate && t.startDate > last) {
      unscheduled.push({ taskId: t.id, reason: 'starts_after_horizon', remainingMin: need, placedMin: 0 })
      failed.add(t.id)
      continue
    }
    const session = Math.max(s.minChunkMin, t.maxSessionMin ?? s.defaultSessionMin)
    const isDeep = t.energy === 'deep'
    let left = need
    const placed: PlanBlock[] = []
    for (const day of days) {
      if (left <= 0) break
      if (at(day, 1440) <= earliest) continue
      const minStart = day === dayKey(earliest) ? ceilTo(minuteOfDay(earliest), STEP) : 0
      let slots = free.get(day)!
      for (;;) {
        if (left <= 0) break
        const budget = budgetLeft.get(day)!
        const deep = isDeep ? deepLeft.get(day)! : Infinity
        const cap = Math.min(budget, deep)
        // First slot that yields a valid piece: the whole remainder, or a piece ≥ minChunk that
        // also leaves ≥ minChunk behind (no 5-minute leftovers).
        let pick: { slot: Interval; start: number; chunk: number } | undefined
        for (const slot of slots) {
          const start = Math.max(slot[0], minStart)
          const len = Math.min(left, session, slot[1] - start, cap)
          if (len <= 0) continue
          let chunk = len >= left ? left : Math.floor(len / STEP) * STEP
          if (chunk < left && left - chunk < s.minChunkMin) chunk = Math.floor((left - s.minChunkMin) / STEP) * STEP
          if (chunk <= 0 || (chunk < left && chunk < s.minChunkMin)) continue
          pick = { slot, start, chunk }
          break
        }
        if (!pick) break
        const { slot, start, chunk } = pick
        placed.push({ id: `t:${t.id}:${day}:${start}`, day, startMin: start, endMin: start + chunk, kind: 'task', title: t.title, taskId: t.id, confidence: t.confidence })
        slots = subtractIntervals(slots, [[start, Math.min(slot[1], start + chunk + s.gapMin)]])
        free.set(day, slots)
        budgetLeft.set(day, budget - chunk)
        if (isDeep) deepLeft.set(day, deepLeft.get(day)! - chunk)
        const c = capByDay.get(day)!
        c.plannedMin += chunk
        if (isDeep) c.deepMin += chunk
        left -= chunk
      }
    }
    placed.forEach((b, i) => { b.part = i + 1; b.parts = placed.length })
    blocks.push(...placed)
    if (left > 0) {
      unscheduled.push({ taskId: t.id, reason: 'no_capacity', remainingMin: need, placedMin: need - left })
      failed.add(t.id)
    }
    if (placed.length) finishAt[t.id] = Math.max(...placed.map((b) => at(b.day, b.endMin)))
  }

  // 4. Deadline risk.
  const horizonEnd = at(addDays(last, 1), 0)
  const atRisk: AtRisk[] = []
  for (const t of work) {
    if (!isOpen(t) || t.dueAt === undefined) continue
    const end = failed.has(t.id) ? undefined : finishAt[t.id]
    if (end === undefined) {
      if (t.dueAt < horizonEnd || failed.has(t.id)) atRisk.push({ taskId: t.id, dueAt: t.dueAt, kind: 'unscheduled' })
      continue
    }
    const lateMin = Math.round((end - t.dueAt) / 60_000)
    if (lateMin > 0) atRisk.push({ taskId: t.id, dueAt: t.dueAt, kind: 'late', projectedEnd: end, lateMin })
    else if (t.dueAt - end < 4 * 3_600_000) atRisk.push({ taskId: t.id, dueAt: t.dueAt, kind: 'tight', projectedEnd: end, lateMin })
  }
  atRisk.sort((a, b) => a.dueAt - b.dueAt)

  // Overload: cumulative due demand vs cumulative budget.
  let overload: Overload | undefined
  let cumCap = 0
  for (const c of capacity) {
    cumCap += c.budgetMin + c.pinnedMin
    const dayEnd = at(addDays(c.day, 1), 0)
    const demand = work.filter((t) => isOpen(t) && t.dueAt !== undefined && t.dueAt <= dayEnd).reduce((x, t) => x + remainingMinutes(t, s), 0)
    if (demand > cumCap) { overload = { day: c.day, demandMin: demand, capacityMin: cumCap }; break }
  }

  blocks.sort((a, b) => a.day.localeCompare(b.day) || a.startMin - b.startMin || a.id.localeCompare(b.id))
  return { from, days, blocks, capacity, unscheduled, atRisk, overload, finishAt, scores }
}

// ---------- plan comparison ----------

export interface BlockChange {
  taskId: ID
  title: string
  type: 'added' | 'removed' | 'moved' | 'resized'
  from?: { day: DayKey; startMin: number; minutes: number }
  to?: { day: DayKey; startMin: number; minutes: number }
}

function firstByTask(blocks: PlanBlock[]): Map<ID, { day: DayKey; startMin: number; minutes: number; title: string }> {
  const m = new Map<ID, { day: DayKey; startMin: number; minutes: number; title: string }>()
  for (const b of blocks) {
    if (!b.taskId) continue
    const cur = m.get(b.taskId)
    const minutes = b.endMin - b.startMin
    if (!cur) m.set(b.taskId, { day: b.day, startMin: b.startMin, minutes, title: b.title })
    else {
      cur.minutes += minutes
      if (b.day < cur.day || (b.day === cur.day && b.startMin < cur.startMin)) { cur.day = b.day; cur.startMin = b.startMin }
    }
  }
  return m
}

/** Task-level changes between two plans (first session start + total planned minutes). */
export function diffPlans(before: PlanBlock[], after: PlanBlock[]): BlockChange[] {
  const a = firstByTask(before)
  const b = firstByTask(after)
  const out: BlockChange[] = []
  for (const [id, x] of a) {
    const y = b.get(id)
    const from = { day: x.day, startMin: x.startMin, minutes: x.minutes }
    if (!y) out.push({ taskId: id, title: x.title, type: 'removed', from })
    else if (y.day !== x.day || y.startMin !== x.startMin) out.push({ taskId: id, title: x.title, type: 'moved', from, to: { day: y.day, startMin: y.startMin, minutes: y.minutes } })
    else if (y.minutes !== x.minutes) out.push({ taskId: id, title: x.title, type: 'resized', from, to: { day: y.day, startMin: y.startMin, minutes: y.minutes } })
  }
  for (const [id, y] of b) if (!a.has(id)) out.push({ taskId: id, title: y.title, type: 'added', to: { day: y.day, startMin: y.startMin, minutes: y.minutes } })
  return out.sort((p, q) => (p.to?.day ?? p.from!.day).localeCompare(q.to?.day ?? q.from!.day) || p.title.localeCompare(q.title))
}

// ---------- what-if ----------

export type Scenario =
  | { type: 'lost_time'; minutes: number }
  | { type: 'skip_commitment'; commitmentId: ID; day: DayKey }
  | { type: 'reserve_project'; projectId: ID; minutes: number; label: string }
  | { type: 'change_estimate'; taskId: ID; minutes: number }
  | { type: 'block_time'; day: DayKey; startMin: number; endMin: number; title: string }

export const RESERVE_ID = 'what-if:reserve'

export function applyScenario(input: PlanInput, sc: Scenario): PlanInput {
  switch (sc.type) {
    case 'lost_time':
      return { ...input, now: input.now + sc.minutes * 60_000 }
    case 'skip_commitment':
      return { ...input, commitments: input.commitments.map((c) => (c.id === sc.commitmentId ? { ...c, skipDays: [...c.skipDays, sc.day] } : c)) }
    case 'change_estimate':
      return { ...input, tasks: input.tasks.map((t) => (t.id === sc.taskId ? { ...t, estimateMin: sc.minutes, confidence: 'firm' as const, progress: 0 } : t)) }
    case 'block_time':
      return { ...input, extraBusy: [...(input.extraBusy ?? []), { day: sc.day, startMin: sc.startMin, endMin: sc.endMin, title: sc.title }] }
    case 'reserve_project': {
      const reserve: Task = {
        id: RESERVE_ID, title: sc.label, links: [], tags: [], projectId: sc.projectId, importance: 5, priorityOverride: 100,
        status: 'planned', progress: 0, estimateMin: sc.minutes, confidence: 'firm', energy: 'deep', dependsOn: [], checklist: [],
        postponeCount: 0, actualMin: 0, createdAt: 0, updatedAt: 0, maxSessionMin: 120,
      }
      return { ...input, tasks: [...input.tasks, reserve] }
    }
  }
}

export interface WhatIfRow {
  taskId: ID
  baseFinish?: number
  altFinish?: number
  /** Minutes later (+) or earlier (−) in the scenario; undefined if not placed in one of them. */
  deltaMin?: number
  baseRisk?: AtRisk['kind']
  altRisk?: AtRisk['kind']
}

export interface WhatIfResult { base: PlanResult; alt: PlanResult; rows: WhatIfRow[]; newlyAtRisk: ID[]; resolvedRisks: ID[] }

export function whatIf(input: PlanInput, sc: Scenario): WhatIfResult {
  const base = plan(input)
  const alt = plan(applyScenario(input, sc))
  const riskA = new Map(base.atRisk.map((r) => [r.taskId, r.kind]))
  const riskB = new Map(alt.atRisk.map((r) => [r.taskId, r.kind]))
  const ids = new Set([...Object.keys(base.finishAt), ...Object.keys(alt.finishAt), ...riskA.keys(), ...riskB.keys()])
  ids.delete(RESERVE_ID)
  const rows: WhatIfRow[] = []
  for (const id of ids) {
    const a = base.finishAt[id], b = alt.finishAt[id]
    const deltaMin = a !== undefined && b !== undefined ? Math.round((b - a) / 60_000) : undefined
    const row: WhatIfRow = { taskId: id, baseFinish: a, altFinish: b, deltaMin, baseRisk: riskA.get(id), altRisk: riskB.get(id) }
    if (deltaMin !== 0 || row.baseRisk !== row.altRisk) rows.push(row)
  }
  rows.sort((x, y) => Math.abs(y.deltaMin ?? 1e9) - Math.abs(x.deltaMin ?? 1e9))
  const serious = (k?: AtRisk['kind']) => k === 'late' || k === 'unscheduled'
  return {
    base, alt, rows,
    newlyAtRisk: [...ids].filter((id) => serious(riskB.get(id)) && !serious(riskA.get(id))),
    resolvedRisks: [...ids].filter((id) => serious(riskA.get(id)) && !serious(riskB.get(id))),
  }
}

// ---------- current / next ----------

export function currentAndNext(blocks: PlanBlock[], now: number): { current?: PlanBlock; next?: PlanBlock } {
  const today = dayKey(now)
  const m = minuteOfDay(now)
  const todays = blocks.filter((b) => b.day === today).sort((a, b) => a.startMin - b.startMin)
  return {
    current: todays.find((b) => b.startMin <= m && m < b.endMin),
    next: todays.find((b) => b.startMin > m) ?? blocks.find((b) => b.day > today),
  }
}
