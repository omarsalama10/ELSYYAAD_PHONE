import { addDays, diffDays, parseDay, weekday } from './time'
import type { Commitment, DayKey, Recurrence, Task } from './types'

/** Does a recurrence rule produce an occurrence on `day`? `anchor` is the series start. */
export function occursOn(rule: Recurrence, anchor: DayKey, day: DayKey): boolean {
  if (day < anchor) return false
  switch (rule.type) {
    case 'daily':
      return diffDays(anchor, day) % Math.max(1, rule.every) === 0
    case 'weekly':
      return rule.weekdays.includes(weekday(day))
    case 'monthly': {
      const d = parseDay(day)
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      return d.getDate() === Math.min(rule.day, last)
    }
  }
}

export function commitmentOccursOn(c: Commitment, day: DayKey): boolean {
  if (c.deletedAt) return false
  if (c.validFrom && day < c.validFrom) return false
  if (c.validUntil && day > c.validUntil) return false
  if (c.skipDays.includes(day)) return false
  switch (c.repeat.type) {
    case 'once': return c.repeat.day === day
    case 'daily': return true
    case 'weekly': return c.repeat.weekdays.includes(weekday(day))
  }
}

/**
 * Instances a recurring series should have in [from, from + days). Existing instances
 * (matched by seriesId + occurrence) are never duplicated, and occurrences that were
 * deleted stay deleted because their tombstone still exists.
 */
export function pendingOccurrences(series: Task, existing: Task[], from: DayKey, days: number): DayKey[] {
  if (!series.recurrence || series.deletedAt || series.status === 'cancelled') return []
  const anchor = series.startDate ?? from
  const have = new Set(existing.filter((t) => t.seriesId === series.id).map((t) => t.occurrence))
  const out: DayKey[] = []
  for (let i = 0; i < days; i++) {
    const day = addDays(from, i)
    if (occursOn(series.recurrence, anchor, day) && !have.has(day)) out.push(day)
  }
  return out
}

export function describeRecurrence(r: Recurrence): string {
  const names = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
  switch (r.type) {
    case 'daily': return r.every <= 1 ? 'يوميًا' : `كل ${r.every} أيام`
    case 'weekly': return `أسبوعيًا: ${[...r.weekdays].sort().map((d) => names[d]).join('، ')}`
    case 'monthly': return `شهريًا يوم ${r.day}`
  }
}
