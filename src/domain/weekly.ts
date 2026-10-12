import type { Exercise, Session, SetLog } from './types'

const DAY = 86_400_000

export interface WeekSummary {
  sessions: number
  minutes: number
  sets: number
  /** Σ weight × reps over loaded rep sets (kg). */
  volume: number
  cardioMinutes: number
  /** Done sets per day, index 0 = weekStart day. */
  perDay: number[]
}

/** Aggregates completed sessions that started in [weekStart, weekStart + 7d). */
export function summarizeWeek(
  weekStart: number,
  sessions: Session[],
  sets: SetLog[],
  exercises: Map<string, Exercise>,
): WeekSummary {
  const end = weekStart + 7 * DAY
  const inWeek = sessions.filter((s) => s.finishedAt && s.startedAt >= weekStart && s.startedAt < end)
  const ids = new Set(inWeek.map((s) => s.id))
  const startOf = new Map(inWeek.map((s) => [s.id, s.startedAt]))
  const out: WeekSummary = {
    sessions: inWeek.length,
    minutes: Math.round(inWeek.reduce((a, s) => a + (s.finishedAt! - s.startedAt), 0) / 60_000),
    sets: 0, volume: 0, cardioMinutes: 0, perDay: Array(7).fill(0),
  }
  for (const s of sets) {
    if (!s.done || !ids.has(s.sessionId)) continue
    const e = exercises.get(s.exerciseId)
    if (e?.metric === 'cardio') { out.cardioMinutes += Math.round((s.seconds ?? 0) / 60); continue }
    if (s.side === 'R') continue // a unilateral pair counts as one set
    out.sets++
    const day = Math.min(6, Math.max(0, Math.floor((startOf.get(s.sessionId)! - weekStart) / DAY)))
    out.perDay[day]!++
  }
  for (const s of sets) {
    if (s.done && ids.has(s.sessionId) && s.weight && s.reps) out.volume += s.weight * s.reps
  }
  out.volume = Math.round(out.volume)
  return out
}
