import { e1rm, setValue } from './progression'
import type { Exercise, SetLog } from './types'

export interface RecordEntry { value: number; at: number; reps?: number }
export interface Records { e1rm?: RecordEntry; weight?: RecordEntry; value?: RecordEntry }
export type RecordKind = keyof Records

const loaded = (e: Exercise, s: SetLog) => e.increment > 0 && !!s.weight

/** Best e1RM and heaviest weight for loaded work; best raw value (reps/sec/m) otherwise. */
export function personalRecords(e: Exercise, sessions: { at: number; sets: SetLog[] }[]): Records {
  const r: Records = {}
  for (const { at, sets } of sessions) {
    for (const s of sets) {
      if (!s.done) continue
      if (loaded(e, s)) {
        const est = e.metric === 'reps' ? e1rm(s.weight, s.reps) : undefined
        if (est !== undefined && (!r.e1rm || est > r.e1rm.value)) r.e1rm = { value: est, at, reps: s.reps }
        if (!r.weight || s.weight! > r.weight.value) r.weight = { value: s.weight!, at, reps: s.reps }
      } else {
        const v = setValue(e, s)
        if (v > 0 && (!r.value || v > r.value.value)) r.value = { value: v, at }
      }
    }
  }
  return r
}

/** A completed set that strictly beats every prior set. No celebration without prior history. */
export function isNewRecord(e: Exercise, prior: SetLog[], s: SetLog): { kind: RecordKind; value: number } | undefined {
  const done = prior.filter((p) => p.done && p.id !== s.id && (s.side ? p.side === s.side : true))
  if (done.length === 0 || !s.done || e.metric === 'cardio') return undefined
  const best = personalRecords(e, [{ at: 0, sets: done }])
  if (loaded(e, s)) {
    if (best.weight && s.weight! > best.weight.value) return { kind: 'weight', value: s.weight! }
    const est = e.metric === 'reps' ? e1rm(s.weight, s.reps) : undefined
    if (est !== undefined && best.e1rm && est > best.e1rm.value) return { kind: 'e1rm', value: est }
    return undefined
  }
  const v = setValue(e, s)
  if (best.value && v > best.value.value) return { kind: 'value', value: v }
  return undefined
}
