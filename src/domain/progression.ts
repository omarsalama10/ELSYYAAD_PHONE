import type { Block, Exercise, SetLog, Side } from './types'

const WEEK = 7 * 86_400_000
const TIME_STEP_SEC = 5

export type Reason = 'first' | 'increase' | 'hold' | 'decrease'

export interface Suggestion {
  side?: Side
  weight?: number
  /** reps | seconds | meters | minutes, per exercise metric. */
  target: number
  reason: Reason
  /** Why the suggestion was adjusted (e.g. readiness), shown to the user. */
  note?: string
}

export interface SuggestInput {
  exercise: Exercise
  block: Block
  /** Logged sets of this exercise, grouped per session, newest session first. */
  history: SetLog[][]
}

export function trainingWeek(firstSessionAt: number, now: number): number {
  return Math.max(1, Math.floor((now - firstSessionAt) / WEEK) + 1)
}

export const isReturnPhase = (week: number) => week <= 2
export const isDeloadWeek = (week: number) => week % 7 === 0

export function effectiveSets(block: Block, week: number): number {
  if (block.section === 'warmup' || block.section === 'cardio') return block.sets
  if (isReturnPhase(week)) return Math.min(2, block.sets)
  if (isDeloadWeek(week)) return Math.max(1, Math.ceil(block.sets * 0.6))
  return block.sets
}

export function roundTo(x: number, step: number): number {
  if (step <= 0) return x
  return Number((Math.round(x / step) * step).toFixed(2))
}

/** Epley estimate; only meaningful for 1–12 reps with a load. */
export function e1rm(weight: number | undefined, reps: number | undefined): number | undefined {
  if (!weight || !reps || reps < 1 || reps > 12) return undefined
  if (reps === 1) return weight
  return Number((weight * (1 + reps / 30)).toFixed(1))
}

/** The value a set is measured by, per metric. Cardio is measured in minutes. */
export function setValue(exercise: Exercise, s: SetLog): number {
  switch (exercise.metric) {
    case 'reps': return s.reps ?? 0
    case 'time': return s.seconds ?? 0
    case 'distance': return s.meters ?? 0
    case 'cardio': return (s.seconds ?? 0) / 60
  }
}

function suggestOne(input: SuggestInput, side?: Side): Suggestion {
  const { exercise, block } = input
  const sessions = input.history
    .map((sets) => sets.filter((s) => s.done && (side ? s.side === side : true)))
    .filter((sets) => sets.length > 0)
  const withSide = side ? { side } : {}
  const last = sessions[0]
  if (!last) return { ...withSide, target: block.repMin, reason: 'first' }

  const lastWeight = Math.max(0, ...last.map((s) => s.weight ?? 0))
  const weighted = lastWeight > 0 ? { weight: lastWeight } : {}
  const values = (sets: SetLog[]) => sets.map((s) => setValue(exercise, s))

  if (exercise.metric === 'cardio') return { ...withSide, target: block.repMax, reason: 'hold' }

  const lastValues = values(last)
  if (lastValues.every((v) => v >= block.repMax)) {
    if (exercise.increment > 0 && lastWeight > 0)
      return { ...withSide, weight: roundTo(lastWeight + exercise.increment, exercise.increment), target: block.repMin, reason: 'increase' }
    // Every set has to reach the new target, so step up from the weakest one.
    const step = exercise.metric === 'time' ? TIME_STEP_SEC : 1
    return { ...withSide, ...weighted, target: Math.min(...lastValues) + step, reason: 'increase' }
  }

  const belowMin = (sets: SetLog[]) => values(sets).some((v) => v < block.repMin)
  const prev = sessions[1]
  if (prev && belowMin(last) && belowMin(prev) && exercise.increment > 0 && lastWeight > 0) {
    let w = roundTo(lastWeight * 0.9, exercise.increment)
    if (w >= lastWeight) w = lastWeight - exercise.increment
    return { ...withSide, weight: Math.max(0, roundTo(w, exercise.increment)), target: block.repMin, reason: 'decrease' }
  }

  const target = Math.min(block.repMax, Math.max(block.repMin, Math.min(...lastValues) + 1))
  return { ...withSide, ...weighted, target, reason: 'hold' }
}

export function suggest(input: SuggestInput): Suggestion[] {
  return input.exercise.unilateral
    ? [suggestOne(input, 'L'), suggestOne(input, 'R')]
    : [suggestOne(input)]
}
