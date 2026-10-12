import type { Exercise, SetLog } from '../domain/types'

/** What a set row edits: optional load plus the metric value (reps/seconds/meters/minutes). */
export interface RowValues { weight?: number; value?: number }

export function toLog(e: Exercise, v: RowValues): Pick<SetLog, 'weight' | 'reps' | 'seconds' | 'meters'> {
  const weight = e.increment > 0 ? v.weight : undefined
  switch (e.metric) {
    case 'reps': return { weight, reps: v.value }
    case 'time': return { weight, seconds: v.value }
    case 'distance': return { weight, meters: v.value }
    case 'cardio': return { seconds: v.value !== undefined ? Math.round(v.value * 60) : undefined }
  }
}

export function fromLog(e: Exercise, s: SetLog): RowValues {
  const value = e.metric === 'reps' ? s.reps : e.metric === 'time' ? s.seconds : e.metric === 'distance' ? s.meters : s.seconds !== undefined ? s.seconds / 60 : undefined
  return { weight: s.weight, value }
}
