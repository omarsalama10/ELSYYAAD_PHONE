import { isOpen, openDependencies, blockingCounts } from './priority'
import type { PlanResult } from './scheduler'
import { addDays, dayKey, diffDays } from './time'
import type { DayKey, Goal, ID, LifeSettings, Milestone, Project, Task, TimeLog } from './types'

const live = (t: Task) => !t.deletedAt && !t.recurrence && t.status !== 'cancelled'
const pctOf = (t: Task) => (t.status === 'done' ? 100 : Math.min(100, Math.max(0, t.progress)))

export interface ProgressSummary {
  /** 0..100, or null when there is nothing to measure. */
  pct: number | null
  total: number
  done: number
  open: number
}

/** Progress of a set of tasks under a weighting rule. Cancelled tasks are excluded. */
export function weightedProgress(tasks: Task[], weighting: Project['weighting'], s: Pick<LifeSettings, 'defaultEstimateMin'>): ProgressSummary {
  const xs = tasks.filter(live)
  const weight = (t: Task) => (weighting === 'estimate' ? t.estimateMin ?? s.defaultEstimateMin : weighting === 'custom' ? t.weight ?? 1 : 1)
  const wsum = xs.reduce((a, t) => a + weight(t), 0)
  const pct = wsum > 0 ? xs.reduce((a, t) => a + weight(t) * pctOf(t), 0) / wsum : null
  return { pct: pct === null ? null : Math.round(pct), total: xs.length, done: xs.filter((t) => t.status === 'done').length, open: xs.filter(isOpen).length }
}

export function projectTasks(p: Project, tasks: Task[]): Task[] {
  return tasks.filter((t) => t.projectId === p.id)
}

export function projectProgress(p: Project, tasks: Task[], s: LifeSettings): ProgressSummary {
  return weightedProgress(projectTasks(p, tasks), p.weighting, s)
}

export interface ProjectForecast {
  /** Latest projected finish of the project's planned work (from the planner). */
  plannedEnd?: DayKey
  /** Some open work did not fit in the planning horizon. */
  beyondHorizon: boolean
  /** Average logged minutes per day on this project over the last 14 days (measured). */
  dailyRateMin: number
  remainingMin: number
  /** Rate-based projection when the planner can't place everything. */
  rateEnd?: DayKey
  /** Positive = projected after target. */
  slipDays?: number
}

export function projectForecast(p: Project, tasks: Task[], logs: TimeLog[], planRes: PlanResult | undefined, remaining: (t: Task) => number, now: number): ProjectForecast {
  const own = projectTasks(p, tasks).filter((t) => isOpen(t) && !t.recurrence)
  const ownIds = new Set(own.map((t) => t.id))
  const remainingMin = own.reduce((a, t) => a + remaining(t), 0)
  const since = now - 14 * 86_400_000
  const allIds = new Set(projectTasks(p, tasks).map((t) => t.id))
  const logged = logs
    .filter((l) => l.end && l.start >= since && (l.projectId === p.id || (l.taskId && allIds.has(l.taskId))))
    .reduce((a, l) => a + (l.end! - l.start) / 60_000, 0)
  const dailyRateMin = Math.round(logged / 14)
  let plannedEnd: DayKey | undefined
  let beyondHorizon = false
  if (planRes) {
    for (const id of ownIds) {
      const f = planRes.finishAt[id]
      if (f === undefined || planRes.unscheduled.some((u) => u.taskId === id)) beyondHorizon = true
      else { const d = dayKey(f); if (!plannedEnd || d > plannedEnd) plannedEnd = d }
    }
  }
  const today = dayKey(now)
  const rateEnd = remainingMin === 0 ? today : dailyRateMin > 0 ? addDays(today, Math.ceil(remainingMin / dailyRateMin)) : undefined
  const projected = beyondHorizon ? rateEnd : plannedEnd ?? (remainingMin === 0 ? today : undefined)
  const slipDays = p.targetDate && projected ? diffDays(p.targetDate, projected) : undefined
  return { plannedEnd, beyondHorizon, dailyRateMin, remainingMin, rateEnd, slipDays }
}

export interface Blockers {
  /** Open tasks waiting on unfinished dependencies. */
  waiting: { task: Task; on: Task[] }[]
  /** Open tasks that hold up the most other work. */
  bottlenecks: { task: Task; dependents: number }[]
  overdue: Task[]
}

export function projectBlockers(p: Project, tasks: Task[], now: number): Blockers {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const own = projectTasks(p, tasks).filter((t) => isOpen(t) && !t.recurrence)
  const counts = blockingCounts(tasks)
  return {
    waiting: own.map((task) => ({ task, on: openDependencies(task, byId) })).filter((x) => x.on.length > 0),
    bottlenecks: own.map((task) => ({ task, dependents: counts.get(task.id) ?? 0 })).filter((x) => x.dependents > 0).sort((a, b) => b.dependents - a.dependents),
    overdue: own.filter((t) => t.dueAt !== undefined && t.dueAt < now),
  }
}

export function milestoneProgress(m: Milestone, tasks: Task[], s: LifeSettings): ProgressSummary {
  if (m.status === 'done') return { pct: 100, total: 0, done: 0, open: 0 }
  return weightedProgress(tasks.filter((t) => t.milestoneId === m.id), 'equal', s)
}

// ---------- goals ----------

export type GoalTrack = 'achieved' | 'ahead' | 'on_track' | 'behind' | 'no_data'

export interface GoalStatusReport {
  pct: number | null
  /** Share of the time window elapsed, 0..100. */
  expectedPct: number
  /** pct − expectedPct. */
  deviation: number | null
  track: GoalTrack
  /** Linear projection from progress so far. */
  projectedDate?: DayKey
  daysLeft: number
  suggestion?: 'reduce_scope_or_extend' | 'add_tasks' | 'define_metric'
}

export function goalProgress(g: Goal, tasks: Task[], projects: Project[], milestones: Milestone[], s: LifeSettings): number | null {
  switch (g.metric.type) {
    case 'numeric': {
      const { start, target, current } = g.metric
      if (target === start) return current >= target ? 100 : 0
      return Math.round(Math.min(100, Math.max(0, ((current - start) / (target - start)) * 100)))
    }
    case 'milestones': {
      const ms = milestones.filter((m) => m.goalId === g.id)
      return ms.length ? Math.round((ms.filter((m) => m.status === 'done').length / ms.length) * 100) : null
    }
    case 'tasks': {
      const projIds = new Set(projects.filter((p) => p.goalId === g.id && !p.deletedAt).map((p) => p.id))
      const linked = tasks.filter((t) => t.goalId === g.id || (t.projectId && projIds.has(t.projectId)))
      return weightedProgress(linked, 'equal', s).pct
    }
  }
}

export function goalStatus(g: Goal, pct: number | null, now: number): GoalStatusReport {
  const today = dayKey(now)
  const total = Math.max(1, diffDays(g.startDate, g.targetDate))
  const elapsed = Math.min(total, Math.max(0, diffDays(g.startDate, today)))
  const expectedPct = Math.round((elapsed / total) * 100)
  const daysLeft = diffDays(today, g.targetDate)
  if (g.status === 'achieved' || pct === 100) return { pct: pct ?? 100, expectedPct, deviation: (pct ?? 100) - expectedPct, track: 'achieved', daysLeft }
  if (pct === null) return { pct, expectedPct, deviation: null, track: 'no_data', daysLeft, suggestion: g.metric.type === 'tasks' ? 'add_tasks' : 'define_metric' }
  const deviation = pct - expectedPct
  let projectedDate: DayKey | undefined
  if (pct > 0 && elapsed > 0) projectedDate = addDays(g.startDate, Math.ceil((elapsed * 100) / pct))
  const track: GoalTrack = deviation >= 10 ? 'ahead' : deviation <= -10 ? 'behind' : 'on_track'
  const late = projectedDate ? projectedDate > g.targetDate : elapsed > 0
  return { pct, expectedPct, deviation, track, projectedDate, daysLeft, suggestion: track === 'behind' && late ? 'reduce_scope_or_extend' : undefined }
}

/** Goal ids → open tasks needing a date, to help "distribute over available days". */
export function unscheduledGoalTasks(goalId: ID, tasks: Task[], projects: Project[]): Task[] {
  const projIds = new Set(projects.filter((p) => p.goalId === goalId).map((p) => p.id))
  return tasks.filter((t) => isOpen(t) && !t.recurrence && (t.goalId === goalId || (t.projectId && projIds.has(t.projectId))) && t.estimateMin === undefined)
}
