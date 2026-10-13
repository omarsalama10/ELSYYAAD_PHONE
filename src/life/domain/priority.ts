import { DAY_MS, ceilTo } from './time'
import type { ID, LifeSettings, Task } from './types'
import { OPEN_STATUSES } from './types'

export const isOpen = (t: Task) => !t.deletedAt && OPEN_STATUSES.includes(t.status)
/** Recurring series are templates, not work items. */
export const isWorkItem = (t: Task) => !t.deletedAt && !t.recurrence

/**
 * Minutes still needed. Progress scales the estimate; rough estimates are inflated by
 * `roughFactor` so the plan keeps an honest margin.
 */
export function remainingMinutes(t: Task, s: Pick<LifeSettings, 'defaultEstimateMin' | 'roughFactor'>): number {
  if (!isOpen(t)) return 0
  const est = t.estimateMin ?? s.defaultEstimateMin
  const factor = t.confidence === 'rough' || t.estimateMin === undefined ? s.roughFactor : 1
  const left = est * factor * (1 - Math.min(100, Math.max(0, t.progress)) / 100)
  return left <= 0 ? 0 : Math.max(5, ceilTo(left, 5))
}

/** A dependency blocks only while it is open; deleted or cancelled ones are ignored. */
export function openDependencies(t: Task, byId: Map<ID, Task>): Task[] {
  return t.dependsOn.map((id) => byId.get(id)).filter((d): d is Task => !!d && isOpen(d))
}

/** True when adding `from → dependsOn → to` would close a cycle. */
export function wouldCreateCycle(tasks: Task[], from: ID, to: ID): boolean {
  if (from === to) return true
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const seen = new Set<ID>()
  const stack = [to]
  while (stack.length) {
    const id = stack.pop()!
    if (id === from) return true
    if (seen.has(id)) continue
    seen.add(id)
    for (const d of byId.get(id)?.dependsOn ?? []) stack.push(d)
  }
  return false
}

/** For each task: how many open tasks wait on it, directly or transitively. */
export function blockingCounts(tasks: Task[]): Map<ID, number> {
  const dependents = new Map<ID, ID[]>()
  for (const t of tasks) if (isOpen(t)) for (const d of t.dependsOn) dependents.set(d, [...(dependents.get(d) ?? []), t.id])
  const out = new Map<ID, number>()
  for (const t of tasks) {
    const seen = new Set<ID>()
    const stack = [...(dependents.get(t.id) ?? [])]
    while (stack.length) {
      const id = stack.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      stack.push(...(dependents.get(id) ?? []))
    }
    out.set(t.id, seen.size)
  }
  return out
}

export interface PriorityBreakdown {
  /** 0..100 */
  score: number
  importance: number
  urgency: number
  blocking: number
  delay: number
  overridden: boolean
  /** Days until the deadline (negative = overdue). */
  daysLeft?: number
}

/**
 * Priority = weighted mean of four normalized factors (0..1), scaled to 0..100:
 *  - importance: (importance − 1) / 4
 *  - urgency: 1 when overdue; otherwise 1 − slack/14 where slack = days left − days of
 *    work remaining (at `maxDeepMinPerDay` per day); 0.1 without a deadline
 *  - blocking: open tasks waiting on this one, capped at 5
 *  - delay: times it has been postponed, capped at 5
 * A manual override replaces the score but the factors are still reported.
 */
export function priorityScores(tasks: Task[], s: LifeSettings, now: number): Map<ID, PriorityBreakdown> {
  const blocks = blockingCounts(tasks)
  const w = s.weights
  const wsum = w.importance + w.urgency + w.blocking + w.delay || 1
  const perDay = Math.max(60, s.maxDeepMinPerDay)
  const out = new Map<ID, PriorityBreakdown>()
  for (const t of tasks) {
    const importance = (Math.min(5, Math.max(1, t.importance)) - 1) / 4
    let urgency = 0.1
    let daysLeft: number | undefined
    if (t.dueAt !== undefined) {
      daysLeft = (t.dueAt - now) / DAY_MS
      const slack = daysLeft - remainingMinutes(t, s) / perDay
      urgency = daysLeft <= 0 ? 1 : Math.min(1, Math.max(0, 1 - slack / 14))
    }
    const blocking = Math.min(5, blocks.get(t.id) ?? 0) / 5
    const delay = Math.min(5, t.postponeCount) / 5
    const computed = (100 * (w.importance * importance + w.urgency * urgency + w.blocking * blocking + w.delay * delay)) / wsum
    const overridden = t.priorityOverride !== undefined
    out.set(t.id, {
      score: Math.round(overridden ? t.priorityOverride! : computed),
      importance, urgency, blocking, delay, overridden, daysLeft,
    })
  }
  return out
}

export function priorityLabel(score: number): { label: string; tone: 'danger' | 'warn' | 'accent' | 'muted' } {
  if (score >= 75) return { label: 'حرجة', tone: 'danger' }
  if (score >= 55) return { label: 'عالية', tone: 'warn' }
  if (score >= 35) return { label: 'متوسطة', tone: 'accent' }
  return { label: 'منخفضة', tone: 'muted' }
}
