import { e1rm, setValue } from './progression'
import type { Exercise, SetLog } from './types'

export interface Point { x: number; y: number }

/** Done sets per primary muscle; a unilateral L+R pair counts as one set. */
export function weeklySetsByMuscle(sets: SetLog[], exercises: Map<string, Exercise>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of sets) {
    if (!s.done || s.side === 'R') continue
    const e = exercises.get(s.exerciseId)
    const m = e?.muscles[0]
    if (!e || !m || e.metric === 'cardio') continue
    out[m] = (out[m] ?? 0) + 1
  }
  return out
}

function volume(exercise: Exercise, s: SetLog): number {
  const v = setValue(exercise, s)
  return s.weight ? s.weight * v : v
}

export function sideTotals(exercise: Exercise, sets: SetLog[]): { L: number; R: number } {
  const t = { L: 0, R: 0 }
  for (const s of sets) if (s.done && s.side) t[s.side] += volume(exercise, s)
  return t
}

export function asymmetryPct(a: number, b: number): number {
  const hi = Math.max(a, b)
  return hi === 0 ? 0 : Math.round((Math.abs(a - b) / hi) * 100)
}

/** One point per session: best e1RM for loaded rep work, best raw value otherwise. */
export function bestPerSession(exercise: Exercise, sessions: { at: number; sets: SetLog[] }[]): Point[] {
  const pts: Point[] = []
  for (const { at, sets } of sessions) {
    const done = sets.filter((s) => s.done)
    if (done.length === 0) continue
    const est = exercise.metric === 'reps' ? done.map((s) => e1rm(s.weight, s.reps)).filter((v): v is number => v !== undefined) : []
    const y = est.length > 0 ? Math.max(...est) : Math.max(...done.map((s) => setValue(exercise, s)))
    pts.push({ x: at, y })
  }
  return pts
}
