import { at, dayKey, hhmm, minuteOfDay } from './time'
import type { AccountabilityLevel, Commitment, DayKey, LifeSettings, PlanBlock, ReminderKind, Task } from './types'
import type { PlanResult } from './scheduler'

/**
 * Pure reminder schedule for one day. The runtime engine decides delivery (system
 * notification while the app is alive, otherwise the in-app inbox) and re-checks
 * conditions (e.g. task still open) at fire time.
 */

export interface Reminder {
  key: string
  kind: ReminderKind
  at: number
  title: string
  body: string
  taskId?: string
  /** Fire only if the task is still open at that moment. */
  requiresOpenTask?: boolean
}

const LEVEL_KINDS: Record<AccountabilityLevel, ReminderKind[]> = {
  calm: ['start', 'commitment', 'morning', 'evening', 'deadline'],
  balanced: ['before_start', 'start', 'commitment', 'followup', 'morning', 'evening', 'overload', 'deadline'],
  firm: ['before_start', 'start', 'commitment', 'followup', 'overdue', 'morning', 'evening', 'overload', 'deadline'],
}

export function inQuietHours(min: number, s: Pick<LifeSettings, 'quietStartMin' | 'quietEndMin'>): boolean {
  const { quietStartMin: a, quietEndMin: b } = s
  if (a === b) return false
  return a < b ? min >= a && min < b : min >= a || min < b
}

export interface ReminderInput {
  day: DayKey
  blocks: PlanBlock[]
  tasks: Task[]
  commitments: Commitment[]
  settings: LifeSettings
  planRes?: Pick<PlanResult, 'overload' | 'atRisk'>
}

export function dayReminders(x: ReminderInput): Reminder[] {
  const s = x.settings
  const allowed = new Set(LEVEL_KINDS[s.accountability].filter((k) => !s.disabledReminderKinds.includes(k)))
  const taskById = new Map(x.tasks.map((t) => [t.id, t]))
  const muted = (taskId?: string) => {
    const c = taskId ? taskById.get(taskId)?.category : undefined
    return !!c && s.mutedCategories.includes(c)
  }
  const out: Reminder[] = []
  const add = (r: Reminder) => { if (allowed.has(r.kind) && !muted(r.taskId)) out.push(r) }
  const today = x.blocks.filter((b) => b.day === x.day).sort((a, b) => a.startMin - b.startMin)
  const taskBlocks = today.filter((b) => b.taskId)

  for (const b of today) {
    if (b.kind === 'commitment') {
      const c = x.commitments.find((c) => c.id === b.commitmentId)
      const lead = c?.remindBeforeMin ?? s.remindBeforeMin
      add({ key: `commitment:${b.id}`, kind: 'commitment', at: at(x.day, b.startMin - lead), title: b.title, body: `يبدأ ${hhmm(b.startMin)} (بعد ${lead} دقيقة)` })
      continue
    }
    const part = b.parts && b.parts > 1 ? ` (جلسة ${b.part}/${b.parts})` : ''
    add({ key: `before:${b.id}`, kind: 'before_start', at: at(x.day, b.startMin - s.remindBeforeMin), title: `بعد ${s.remindBeforeMin} دقيقة: ${b.title}`, body: `${hhmm(b.startMin)}–${hhmm(b.endMin)}${part}`, taskId: b.taskId, requiresOpenTask: true })
    add({ key: `start:${b.id}`, kind: 'start', at: at(x.day, b.startMin), title: `ابدأ الآن: ${b.title}`, body: `حتى ${hhmm(b.endMin)}${part}`, taskId: b.taskId, requiresOpenTask: true })
    add({ key: `followup:${b.id}`, kind: 'followup', at: at(x.day, b.endMin), title: `انتهى وقت: ${b.title}`, body: 'اكتملت؟ جزئيًا؟ ولا تتأجل؟', taskId: b.taskId, requiresOpenTask: true })
    add({ key: `overdue:${b.id}`, kind: 'overdue', at: at(x.day, b.endMin + 15), title: `متأخرة: ${b.title}`, body: 'الجلسة عدّت ولسه المهمة مفتوحة. حدّث حالتها أو أعد الجدولة.', taskId: b.taskId, requiresOpenTask: true })
  }

  const first = taskBlocks[0]
  const plannedMin = taskBlocks.reduce((a, b) => a + b.endMin - b.startMin, 0)
  add({
    key: `morning:${x.day}`, kind: 'morning', at: at(x.day, s.morningSummaryMin), title: 'ملخص اليوم',
    body: taskBlocks.length
      ? `${new Set(taskBlocks.map((b) => b.taskId)).size} مهام مخططة (${Math.round(plannedMin / 6) / 10} ساعة). أولها «${first!.title}» ${hhmm(first!.startMin)}.`
      : 'مفيش مهام مخططة النهارده. افتح التطبيق واعتمد خطة.',
  })
  add({ key: `evening:${x.day}`, kind: 'evening', at: at(x.day, s.eveningReviewMin), title: 'مراجعة المساء', body: 'إيه اللي خلص النهارده؟ وإيه اللي محتاج يتنقل لبكرة؟' })

  if (x.planRes?.overload && x.planRes.overload.day <= x.day)
    add({ key: `overload:${x.day}`, kind: 'overload', at: at(x.day, s.morningSummaryMin + 1), title: 'حمل زائد', body: `المطلوب قبل ${x.planRes.overload.day} أكبر من وقتك المتاح بـ ${Math.round((x.planRes.overload.demandMin - x.planRes.overload.capacityMin) / 60)} ساعة تقريبًا.` })

  for (const t of x.tasks) {
    if (t.deletedAt || t.dueAt === undefined || !['new', 'planned', 'in_progress', 'paused'].includes(t.status)) continue
    for (const lead of [24 * 60, 120]) {
      const when = t.dueAt - lead * 60_000
      if (dayKey(when) !== x.day) continue
      add({ key: `deadline:${t.id}:${lead}`, kind: 'deadline', at: when, title: `موعد نهائي قريب: ${t.title}`, body: lead >= 1440 ? 'باقي يوم على الموعد.' : 'باقي ساعتين على الموعد.', taskId: t.id, requiresOpenTask: true })
    }
  }

  return out
    .filter((r) => dayKey(r.at) === x.day && (r.kind === 'commitment' || !inQuietHours(minuteOfDay(r.at), s)))
    .sort((a, b) => a.at - b.at || a.key.localeCompare(b.key))
}
