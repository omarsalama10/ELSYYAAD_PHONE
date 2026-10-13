import { addDays, dayKey, diffDays, hhmm, minuteOfDay, parseDay } from '../domain/time'
import type { CommitmentKind, DayKey, Energy, GoalKind, NoteKind, TaskStatus } from '../domain/types'

const LOCALE = 'ar-EG-u-nu-latn'

export const WEEKDAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
export const WEEKDAY_SHORT = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س']

export function dayLabel(day: DayKey, today: DayKey): string {
  const d = diffDays(today, day)
  if (d === 0) return 'اليوم'
  if (d === 1) return 'بكرة'
  if (d === -1) return 'امبارح'
  return parseDay(day).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'short' })
}

export const fmtDayLong = (day: DayKey) => parseDay(day).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })
export const fmtDayShort = (day: DayKey) => parseDay(day).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })

/** "اليوم 14:00" / "بكرة" / "الخميس 5 نوفمبر 09:30". End-of-day deadlines omit the time. */
export function fmtWhen(t: number, today: DayKey): string {
  const m = minuteOfDay(t)
  const time = m >= 23 * 60 + 59 ? '' : ` ${hhmm(m)}`
  return `${dayLabel(dayKey(t), today)}${time}`
}

export function dueTone(t: number | undefined, now: number): 'danger' | 'warn' | 'muted' {
  if (t === undefined) return 'muted'
  if (t < now) return 'danger'
  if (dayKey(t) <= addDays(dayKey(now), 1)) return 'warn'
  return 'muted'
}

export const STATUS_LABEL: Record<TaskStatus, string> = { new: 'جديدة', planned: 'مخططة', in_progress: 'جارية', paused: 'متوقفة', done: 'مكتملة', cancelled: 'ملغاة' }
export const ENERGY_LABEL: Record<Energy, string> = { deep: 'تركيز عميق', routine: 'روتيني', study: 'دراسة', light: 'خفيف' }
export const KIND_LABEL: Record<CommitmentKind, string> = { work: 'شغل', class: 'محاضرة', appointment: 'موعد', sleep: 'نوم', meal: 'أكل', gym: 'جيم', prayer: 'صلاة', other: 'أخرى' }
export const GOAL_KIND_LABEL: Record<GoalKind, string> = { project: 'مشروع', learning: 'تعلّم', work: 'عمل', habit: 'عادة', personal: 'شخصي' }
export const NOTE_KIND_LABEL: Record<NoteKind, string> = { note: 'ملاحظة', idea: 'فكرة', decision: 'قرار', risk: 'خطر', issue: 'مشكلة' }

export const STATUS_TONE: Record<TaskStatus, 'muted' | 'accent' | 'warn' | 'danger' | 'coral'> = {
  new: 'muted', planned: 'accent', in_progress: 'coral', paused: 'warn', done: 'accent', cancelled: 'muted',
}

export function greeting(now: number): string {
  const h = new Date(now).getHours()
  return h < 5 ? 'سهران؟' : h < 12 ? 'صباح الخير' : h < 18 ? 'أهلًا بيك' : 'مساء الخير'
}

export const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v)}%`)

/** <input type="date"> value ↔ DayKey are identical strings; time inputs ↔ minutes. */
export const toTimeInput = (min: number) => hhmm(min)
export const fromTimeInput = (s: string) => {
  const [h, m] = s.split(':').map(Number)
  return h! * 60 + m!
}
