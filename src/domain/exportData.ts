import type { MealEntry, WeightLog } from './nutrition/types'
import type { CheckIn, Exercise, InBody, Program, Session, SetLog, Tape } from './types'
import { TAPE_FIELDS } from './types'

export interface ExportInput {
  exercises: Map<string, Exercise>
  programs: Program[]
  sessions: Session[]
  sets: SetLog[]
  inbody: InBody[]
  tape: Tape[]
  checkins: CheckIn[]
  meals: MealEntry[]
  weights: WeightLog[]
}

type Cell = string | number | boolean | undefined | null

/** RFC 4180 CSV with a UTF-8 BOM so Excel shows Arabic correctly. */
export function toCsv(header: string[], rows: Cell[][]): string {
  const esc = (v: Cell) => {
    if (v === undefined || v === null) return ''
    const s = String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n'
}

const iso = (t?: number) => (t ? new Date(t).toISOString() : '')
const dayName = (programs: Program[]) => new Map(programs.flatMap((p) => p.days.map((d) => [d.id, d.name] as const)))

export function buildCsvFiles(d: ExportInput): Record<string, string> {
  const days = dayName(d.programs)
  const sessionById = new Map(d.sessions.map((s) => [s.id, s]))
  return {
    'sessions.csv': toCsv(
      ['session_id', 'day', 'started_at', 'finished_at', 'minutes'],
      d.sessions.filter((s) => s.finishedAt).map((s) => [s.id, days.get(s.dayId) ?? s.dayId, iso(s.startedAt), iso(s.finishedAt), Math.round((s.finishedAt! - s.startedAt) / 60000)]),
    ),
    'sets.csv': toCsv(
      ['session_id', 'date', 'exercise_id', 'exercise', 'set', 'side', 'weight_kg', 'reps', 'seconds', 'meters', 'rpe'],
      d.sets.filter((s) => s.done && sessionById.get(s.sessionId)?.finishedAt).map((s) => [
        s.sessionId, iso(sessionById.get(s.sessionId)!.startedAt).slice(0, 10), s.exerciseId, d.exercises.get(s.exerciseId)?.name ?? s.exerciseId,
        s.setIndex + 1, s.side, s.weight, s.reps, s.seconds, s.meters, s.rpe,
      ]),
    ),
    'inbody.csv': toCsv(
      ['date', 'weight', 'smm', 'bfm', 'pbf', 'bmi', 'visceral', 'bmr', 'tbw', 'ecw_ratio', 'lean_left_arm', 'lean_right_arm', 'lean_trunk', 'lean_left_leg', 'lean_right_leg'],
      d.inbody.map((i) => [i.date, i.weight, i.smm, i.bfm, i.pbf, i.bmi, i.visceral, i.bmr, i.tbw, i.ecwRatio, i.lean.la, i.lean.ra, i.lean.trunk, i.lean.ll, i.lean.rl]),
    ),
    'measurements.csv': toCsv(['date', ...TAPE_FIELDS], d.tape.map((x) => [x.date, ...TAPE_FIELDS.map((f) => x[f])])),
    'weights.csv': toCsv(['date', 'kg'], d.weights.map((w) => [w.id, w.kg])),
    'meals.csv': toCsv(['date', 'meal', 'food', 'grams', 'kcal', 'protein', 'carbs', 'fat', 'price_egp'], d.meals.map((m) => [m.date, m.meal, m.name, m.grams, m.kcal, m.p, m.c, m.f, m.price])),
    'readiness.csv': toCsv(['date', 'sleep_hours', 'sleep_quality', 'stress', 'soreness', 'fatigue', 'pain', 'pain_note'], d.checkins.map((c) => [c.id, c.sleepHours, c.sleepQuality, c.stress, c.soreness, c.fatigue, c.pain, c.painNote])),
  }
}
