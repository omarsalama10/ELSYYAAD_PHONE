import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { loadAll } from './db/repo'
import type { LifeData } from './domain/data'
import { isOpen } from './domain/priority'
import { commitmentOccursOn } from './domain/recurrence'
import { plan, type PlanResult } from './domain/scheduler'
import { addDays, at, dayKey, minuteOfDay } from './domain/time'
import type { DayKey, DayPlan, PlanBlock, Task } from './domain/types'

/**
 * One live snapshot of Life OS data + the derived plan, shared by every screen so the
 * planner runs once per change (or once a minute for the clock), not per component.
 */

export type BlockState = 'done' | 'running' | 'missed' | 'now' | 'upcoming' | 'commitment'

export interface LifeState {
  data: LifeData
  now: number
  today: DayKey
  /** Live proposal from the planner. */
  proposal: PlanResult
  /** Current approved plan per day (if any). */
  approved: Map<DayKey, DayPlan>
  /** What the user should follow: approved plan where it exists, proposal elsewhere. */
  blocksFor: (day: DayKey) => PlanBlock[]
  isApproved: (day: DayKey) => boolean
  taskById: Map<string, Task>
  runningTaskId?: string
  blockState: (b: PlanBlock) => BlockState
}

const Ctx = createContext<LifeState | null>(null)

function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const schedule = () => { t = setTimeout(() => { setNow(Date.now()); schedule() }, 60_000 - (Date.now() % 60_000) + 50) }
    schedule()
    const onVis = () => { if (document.visibilityState === 'visible') setNow(Date.now()) }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', onVis) }
  }, [])
  return now
}

export function LifeProvider({ children }: { children: ReactNode }) {
  const data = useLiveQuery(() => loadAll(), [])
  const now = useMinuteClock()
  const value = useMemo<LifeState | null>(() => {
    if (!data) return null
    const today = dayKey(now)
    const restDays = data.dayLogs.filter((d) => d.restDay).map((d) => d.day)
    const proposal = plan({ tasks: data.tasks, commitments: data.commitments, settings: data.settings, now, restDays })
    const approved = new Map(data.plans.filter((p) => p.current === 1 && p.day >= addDays(today, -1)).map((p) => [p.day, p]))
    const taskById = new Map(data.tasks.map((t) => [t.id, t]))
    const running = data.logs.find((l) => l.end === undefined)
    const blocksFor = (day: DayKey): PlanBlock[] => {
      const ap = approved.get(day)
      if (!ap) return proposal.blocks.filter((b) => b.day === day)
      // Commitments always come live (a skipped gym session disappears immediately).
      const fixed: PlanBlock[] = data.commitments.filter((c) => commitmentOccursOn(c, day))
        .map((c) => ({ id: `c:${c.id}:${day}`, day, startMin: c.startMin, endMin: c.endMin, kind: 'commitment', title: c.title, commitmentId: c.id }))
      const work = ap.blocks.filter((b) => b.kind !== 'commitment' && (!b.taskId || (taskById.has(b.taskId) && !taskById.get(b.taskId)!.deletedAt)))
        .map((b) => (b.taskId ? { ...b, title: taskById.get(b.taskId)!.title } : b))
      return [...fixed, ...work].sort((a, b) => a.startMin - b.startMin)
    }
    const nowMin = minuteOfDay(now)
    const blockState = (b: PlanBlock): BlockState => {
      if (b.kind === 'commitment') return 'commitment'
      const t = b.taskId ? taskById.get(b.taskId) : undefined
      if (t && !isOpen(t)) return 'done'
      if (t && running?.taskId === t.id) return 'running'
      const end = at(b.day, b.endMin)
      if (end <= now) return 'missed'
      if (b.day === today && b.startMin <= nowMin) return 'now'
      return 'upcoming'
    }
    return { data, now, today, proposal, approved, blocksFor, isApproved: (d) => approved.has(d), taskById, runningTaskId: running?.taskId, blockState }
  }, [data, now])
  if (!value) return <div className="flex h-screen items-center justify-center text-muted">...</div>
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLife(): LifeState {
  const v = useContext(Ctx)
  if (!v) throw new Error('LifeProvider missing')
  return v
}
