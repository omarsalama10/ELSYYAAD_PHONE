import { addDays, dayKey, startOfWeek, weekday } from './time'
import type { DayKey, Habit, HabitLog } from './types'

export function isScheduled(h: Habit, day: DayKey): boolean {
  switch (h.schedule.type) {
    case 'daily': return true
    case 'weekly': return h.schedule.weekdays.includes(weekday(day))
    case 'timesPerWeek': return true
  }
}

export interface HabitStats {
  /** Units: days, or weeks for "N times per week" habits. */
  unit: 'day' | 'week'
  current: number
  best: number
  /** done / (scheduled − skipped) over the last 30 days; null if nothing was due. */
  rate30: number | null
  totalDone: number
  todayMark?: HabitLog['mark']
  /** For timesPerWeek: completions in the current week. */
  weekDone?: number
}

/**
 * Streaks follow a "never miss twice" rule: one missed scheduled day pauses the streak
 * (doesn't add) but doesn't reset it; two consecutive misses do. Skipped (excused) days are
 * neutral. Today only counts once it's marked, so an unfinished today never breaks anything.
 */
export function habitStats(h: Habit, logs: HabitLog[], today: DayKey, weekStartsOn: number): HabitStats {
  const marks = new Map(logs.filter((l) => l.habitId === h.id).map((l) => [l.day, l.mark]))
  const first = [dayKey(h.createdAt), ...marks.keys()].sort()[0]!
  const totalDone = [...marks.values()].filter((m) => m === 'done').length

  let due = 0, done = 0
  for (let i = 0; i < 30; i++) {
    const d = addDays(today, -i)
    if (d < first || !isScheduled(h, d)) continue
    const m = marks.get(d)
    if (m === 'skipped') continue
    if (d === today && !m) continue
    if (h.schedule.type === 'timesPerWeek') continue
    due++
    if (m === 'done') done++
  }

  if (h.schedule.type === 'timesPerWeek') {
    const target = Math.max(1, h.schedule.times)
    const weekCount = (ws: DayKey) => Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter((d) => marks.get(d) === 'done').length
    const thisWeek = startOfWeek(today, weekStartsOn)
    const weekDone = weekCount(thisWeek)
    // Oldest → newest; the in-progress week only adds once met, never resets.
    let run = 0, best = 0
    for (let ws = startOfWeek(first, weekStartsOn); ws <= thisWeek; ws = addDays(ws, 7)) {
      if (weekCount(ws) >= target) run++
      else if (ws !== thisWeek) run = 0
      best = Math.max(best, run)
    }
    const weeks = [1, 2, 3, 4].map((i) => addDays(thisWeek, -7 * i)).filter((w) => addDays(w, 6) >= first)
    const rate30 = weeks.length ? weeks.filter((w) => weekCount(w) >= target).length / weeks.length : null
    return { unit: 'week', current: run, best, rate30, totalDone, todayMark: marks.get(today), weekDone }
  }

  // Walk forward from the first day to compute best and current with the miss tolerance.
  let run = 0, best = 0, misses = 0
  for (let d = first; d <= today; d = addDays(d, 1)) {
    if (!isScheduled(h, d)) continue
    const m = marks.get(d)
    if (m === 'done') { run++; misses = 0 } else if (m === 'skipped' || d === today) { /* neutral */ } else {
      misses++
      if (misses >= 2) run = 0
    }
    best = Math.max(best, run)
  }
  return { unit: 'day', current: run, best, rate30: due ? done / due : null, totalDone, todayMark: marks.get(today) }
}
