import { commitmentOccursOn } from './recurrence'
import { addDays, at, dayKey as dayOf, daysBetween, startOfWeek, subtractIntervals, totalMinutes, weekday, type Interval } from './time'
import type { Commitment, DayKey, DayLog, DayPlan, ID, LifeSettings, LowOutputReason, Project, Task, TaskEvent, TimeLog } from './types'

/**
 * Every metric carries its definition, the raw numerator/denominator and whether it is
 * measured (from logs/status) or subjective/estimated. No metric is reported without data:
 * an empty denominator yields `value: null`.
 */
export interface Metric {
  key: string
  label: string
  value: number | null
  num: number
  den: number
  unit: '%' | 'min' | 'count' | 'x'
  definition: string
  basis: 'measured' | 'estimated' | 'self-reported'
}

export interface Range { from: DayKey; to: DayKey } // [from, to)

const inRange = (t: number | undefined, r: Range) => t !== undefined && t >= at(r.from, 0) && t < at(r.to, 0)
const work = (t: Task) => !t.deletedAt && !t.recurrence
const median = (xs: number[]) => {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}
const ratio = (num: number, den: number) => (den > 0 ? num / den : null)
const logMin = (l: TimeLog, end: number) => Math.max(0, ((l.end ?? end) - l.start) / 60_000)

export interface AnalyticsInput {
  tasks: Task[]
  events: TaskEvent[]
  logs: TimeLog[]
  plans: DayPlan[]
  dayLogs: DayLog[]
  commitments: Commitment[]
  projects: Project[]
  settings: LifeSettings
  now: number
}

export function executionRate(tasks: Task[], r: Range, now: number): Metric {
  const due = tasks.filter((t) => work(t) && t.status !== 'cancelled' && inRange(t.dueAt, r) && t.dueAt! <= now)
  const done = due.filter((t) => t.status === 'done')
  return {
    key: 'execution', label: 'معدل التنفيذ', value: ratio(done.length, due.length), num: done.length, den: due.length, unit: '%', basis: 'measured',
    definition: 'المهام المكتملة ÷ المهام التي حلّ موعدها في الفترة. الملغاة مستبعدة.',
  }
}

export function deadlineReliability(tasks: Task[], r: Range, now: number): Metric {
  const due = tasks.filter((t) => work(t) && t.status !== 'cancelled' && inRange(t.dueAt, r) && t.dueAt! <= now)
  const onTime = due.filter((t) => t.status === 'done' && t.completedAt !== undefined && t.completedAt <= t.dueAt!)
  return {
    key: 'deadlines', label: 'الالتزام بالمواعيد', value: ratio(onTime.length, due.length), num: onTime.length, den: due.length, unit: '%', basis: 'measured',
    definition: 'المهام التي اكتملت قبل موعدها النهائي ÷ المهام التي حلّ موعدها في الفترة.',
  }
}

export function estimationAccuracy(tasks: Task[], r: Range): Metric & { bias: number | null } {
  const xs = tasks.filter((t) => work(t) && t.status === 'done' && inRange(t.completedAt, r) && (t.estimateMin ?? 0) > 0 && t.actualMin > 0)
  const err = median(xs.map((t) => Math.abs(t.actualMin - t.estimateMin!) / t.estimateMin!))
  const bias = median(xs.map((t) => t.actualMin / t.estimateMin!))
  return {
    key: 'estimation', label: 'دقة التقدير', value: xs.length ? Math.max(0, 1 - err) : null, num: xs.length, den: xs.length, unit: '%', basis: 'measured',
    bias: xs.length ? bias : null,
    definition: '1 − الوسيط لـ |الفعلي − المقدّر| ÷ المقدّر، للمهام المكتملة التي لها تقدير ووقت مسجّل بالمؤقت.',
  }
}

export function velocity(tasks: Task[], r: Range, weekStartsOn: number): Metric & { weeks: { week: DayKey; count: number; minutes: number }[] } {
  const done = tasks.filter((t) => work(t) && t.status === 'done' && inRange(t.completedAt, r))
  const weeks = new Map<DayKey, { count: number; minutes: number }>()
  for (let w = startOfWeek(r.from, weekStartsOn); w < r.to; w = addDays(w, 7)) weeks.set(w, { count: 0, minutes: 0 })
  for (const t of done) {
    const w = startOfWeek(dayOf(t.completedAt!), weekStartsOn)
    const x = weeks.get(w) ?? { count: 0, minutes: 0 }
    x.count++
    x.minutes += t.actualMin || t.estimateMin || 0
    weeks.set(w, x)
  }
  const list = [...weeks].sort(([a], [b]) => a.localeCompare(b)).map(([week, v]) => ({ week, ...v }))
  return {
    key: 'velocity', label: 'سرعة الإنجاز', value: list.length ? done.length / list.length : null, num: done.length, den: list.length, unit: 'count', basis: 'measured', weeks: list,
    definition: 'متوسط عدد المهام المكتملة أسبوعيًا خلال الفترة.',
  }
}

/** Share of planned tasks that were never moved or postponed in the period. */
export function scheduleStability(plans: DayPlan[], events: TaskEvent[], r: Range): Metric & { moves: number; revisions: number } {
  const planned = new Set<ID>()
  let revisions = 0
  for (const p of plans) {
    if (p.day < r.from || p.day >= r.to) continue
    if (p.revision > 1 && p.current) revisions += p.revision - 1
    for (const b of p.blocks) if (b.taskId) planned.add(b.taskId)
  }
  const movedEvents = events.filter((e) => (e.type === 'postponed' || e.type === 'rescheduled') && inRange(e.at, r))
  const moved = new Set(movedEvents.map((e) => e.taskId).filter((id) => planned.has(id)))
  return {
    key: 'stability', label: 'ثبات الخطة', value: ratio(planned.size - moved.size, planned.size), num: planned.size - moved.size, den: planned.size, unit: '%', basis: 'measured',
    moves: movedEvents.length, revisions,
    definition: 'المهام المخططة التي لم تُنقل أو تُؤجل ÷ كل المهام التي ظهرت في خطط معتمدة خلال الفترة.',
  }
}

/** Minutes the user could work on a day: planner window minus fixed commitments. */
export function availableMinutes(day: DayKey, commitments: Commitment[], s: LifeSettings): number {
  const window: Interval[] = [[s.dayStartMin, s.dayEndMin]]
  const busy = commitments.filter((c) => commitmentOccursOn(c, day)).map((c) => [c.startMin, c.endMin] as Interval)
  return s.restWeekdays.includes(weekday(day)) ? 0 : totalMinutes(subtractIntervals(window, busy))
}

export function workloadBalance(plans: DayPlan[], commitments: Commitment[], s: LifeSettings, r: Range): Metric & { days: { day: DayKey; planned: number; available: number }[] } {
  const current = new Map(plans.filter((p) => p.current).map((p) => [p.day, p]))
  const days = daysBetween(r.from, r.to).map((day) => ({
    day,
    planned: (current.get(day)?.blocks ?? []).filter((b) => b.kind !== 'commitment').reduce((a, b) => a + b.endMin - b.startMin, 0),
    available: availableMinutes(day, commitments, s),
  }))
  const withPlan = days.filter((d) => current.has(d.day))
  const planned = withPlan.reduce((a, d) => a + d.planned, 0)
  const available = withPlan.reduce((a, d) => a + d.available, 0)
  return {
    key: 'workload', label: 'توازن الحمل', value: ratio(planned, available), num: planned, den: available, unit: '%', basis: 'estimated', days,
    definition: 'الدقائق المخططة في الخطط المعتمدة ÷ الدقائق المتاحة (نافذة اليوم ناقص الالتزامات الثابتة). أعلى من 85% يعني ضغطًا بلا هامش.',
  }
}

export interface Breakdown { key: string; label: string; minutes: number }

export function timeBy(logs: TimeLog[], tasks: Task[], projects: Project[], r: Range, now: number, by: 'category' | 'project' | 'kind'): Breakdown[] {
  const taskById = new Map(tasks.map((t) => [t.id, t]))
  const projById = new Map(projects.map((p) => [p.id, p]))
  const kindLabel: Record<string, string> = { deep: 'تركيز عميق', routine: 'عمل روتيني', study: 'دراسة', other: 'أخرى' }
  const acc = new Map<string, Breakdown>()
  for (const l of logs) {
    if (!inRange(l.start, r)) continue
    const t = l.taskId ? taskById.get(l.taskId) : undefined
    let key: string, label: string
    if (by === 'kind') { key = l.kind; label = kindLabel[l.kind] ?? l.kind }
    else if (by === 'category') { key = t?.category ?? '—'; label = t?.category ?? 'بدون تصنيف' }
    else { const pid = l.projectId ?? t?.projectId; key = pid ?? '—'; label = (pid && projById.get(pid)?.name) || 'بدون مشروع' }
    const x = acc.get(key) ?? { key, label, minutes: 0 }
    x.minutes += logMin(l, now)
    acc.set(key, x)
  }
  return [...acc.values()].map((x) => ({ ...x, minutes: Math.round(x.minutes) })).sort((a, b) => b.minutes - a.minutes)
}

/** Logged minutes by hour of day — where focused work actually happens. */
export function hourProfile(logs: TimeLog[], r: Range, now: number): number[] {
  const hours = Array<number>(24).fill(0)
  for (const l of logs) {
    if (!inRange(l.start, r)) continue
    const end = l.end ?? now
    for (let t = l.start; t < end;) {
      const boundary = new Date(t)
      boundary.setMinutes(60, 0, 0)
      const next = Math.min(end, boundary.getTime())
      hours[new Date(t).getHours()]! += (next - t) / 60_000
      t = next
    }
  }
  return hours.map((m) => Math.round(m))
}

export function postponeReasons(events: TaskEvent[], r: Range): { reason: string; count: number }[] {
  const acc = new Map<string, number>()
  for (const e of events) if (e.type === 'postponed' && inRange(e.at, r)) acc.set(e.reason?.trim() || 'بدون سبب', (acc.get(e.reason?.trim() || 'بدون سبب') ?? 0) + 1)
  return [...acc].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)
}

export const LOW_OUTPUT_LABEL: Record<LowOutputReason, string> = {
  not_enough_time: 'وقت غير كافٍ', bigger_than_expected: 'مهمة أكبر من المتوقع', commitments_changed: 'تغيّر الالتزامات',
  low_energy: 'طاقة منخفضة', interruptions: 'مقاطعات', other: 'أخرى',
}

export function lowOutputReasons(dayLogs: DayLog[], r: Range): { reason: string; count: number }[] {
  const acc = new Map<string, number>()
  for (const d of dayLogs) if (d.day >= r.from && d.day < r.to && d.lowOutputReason) acc.set(LOW_OUTPUT_LABEL[d.lowOutputReason], (acc.get(LOW_OUTPUT_LABEL[d.lowOutputReason]) ?? 0) + 1)
  return [...acc].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)
}

/** Tasks whose logged time most exceeds their estimate. */
export function overruns(tasks: Task[], limit = 5): { task: Task; overMin: number; ratio: number }[] {
  return tasks
    .filter((t) => work(t) && (t.estimateMin ?? 0) > 0 && t.actualMin > t.estimateMin!)
    .map((task) => ({ task, overMin: task.actualMin - task.estimateMin!, ratio: task.actualMin / task.estimateMin! }))
    .sort((a, b) => b.overMin - a.overMin)
    .slice(0, limit)
}

/** Per day: planned task minutes (approved plan) vs logged minutes. */
export function planVsActual(plans: DayPlan[], logs: TimeLog[], r: Range, now: number): { day: DayKey; planned: number; actual: number }[] {
  const current = new Map(plans.filter((p) => p.current).map((p) => [p.day, p]))
  return daysBetween(r.from, r.to).map((day) => ({
    day,
    planned: (current.get(day)?.blocks ?? []).filter((b) => b.kind !== 'commitment').reduce((a, b) => a + b.endMin - b.startMin, 0),
    actual: Math.round(logs.filter((l) => dayOf(l.start) === day).reduce((a, l) => a + logMin(l, now), 0)),
  }))
}

export interface Report {
  range: Range
  metrics: Metric[]
  estimationBias: number | null
  velocityWeeks: { week: DayKey; count: number; minutes: number }[]
  byCategory: Breakdown[]
  byProject: Breakdown[]
  byKind: Breakdown[]
  hours: number[]
  postpone: { reason: string; count: number }[]
  lowOutput: { reason: string; count: number }[]
  overruns: { task: Task; overMin: number; ratio: number }[]
  planVsActual: { day: DayKey; planned: number; actual: number }[]
  workload: { day: DayKey; planned: number; available: number }[]
  focusMin: number
  interruptions: number
  avgEnergy: number | null
}

export function buildReport(x: AnalyticsInput, r: Range): Report {
  const est = estimationAccuracy(x.tasks, r)
  const vel = velocity(x.tasks, r, x.settings.weekStartsOn)
  const stab = scheduleStability(x.plans, x.events, r)
  const load = workloadBalance(x.plans, x.commitments, x.settings, r)
  const ranged = x.logs.filter((l) => inRange(l.start, r))
  const energies = x.dayLogs.filter((d) => d.day >= r.from && d.day < r.to && d.energy).map((d) => d.energy!)
  return {
    range: r,
    metrics: [executionRate(x.tasks, r, x.now), deadlineReliability(x.tasks, r, x.now), est, vel, stab, load],
    estimationBias: est.bias,
    velocityWeeks: vel.weeks,
    byCategory: timeBy(x.logs, x.tasks, x.projects, r, x.now, 'category'),
    byProject: timeBy(x.logs, x.tasks, x.projects, r, x.now, 'project'),
    byKind: timeBy(x.logs, x.tasks, x.projects, r, x.now, 'kind'),
    hours: hourProfile(x.logs, r, x.now),
    postpone: postponeReasons(x.events, r),
    lowOutput: lowOutputReasons(x.dayLogs, r),
    overruns: overruns(x.tasks),
    planVsActual: planVsActual(x.plans, x.logs, r, x.now),
    workload: load.days,
    focusMin: Math.round(ranged.reduce((a, l) => a + logMin(l, x.now), 0)),
    interruptions: ranged.reduce((a, l) => a + l.interruptions, 0),
    avgEnergy: energies.length ? energies.reduce((a, b) => a + b, 0) / energies.length : null,
  }
}

export function fmtMetric(m: Pick<Metric, 'value' | 'unit'>): string {
  if (m.value === null) return '—'
  if (m.unit === '%') return `${Math.round(m.value * 100)}%`
  if (m.unit === 'x') return `${m.value.toFixed(2)}×`
  return String(Math.round(m.value * 10) / 10)
}
