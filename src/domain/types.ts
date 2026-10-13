export type Side = 'L' | 'R'
export type Metric = 'reps' | 'time' | 'distance' | 'cardio'
export type Section = 'warmup' | 'main' | 'finisher' | 'cardio'

export interface Exercise {
  id: string
  name: string
  nameAr: string
  muscles: string[]
  equipment: string
  metric: Metric
  unilateral: boolean
  images: string[]
  cuesAr: string[]
  instructions: string[]
  custom: boolean
  /** kg added when progressing; 0 = bodyweight (progress by reps/seconds). */
  increment: number
}

/**
 * repMin/repMax meaning depends on the exercise metric:
 * reps → repetitions, time → seconds, distance → meters, cardio → minutes.
 */
export interface Block {
  id: string
  exerciseId: string
  sets: number
  repMin: number
  repMax: number
  restSec: number
  /** Blocks sharing a group key are performed as a superset. */
  group?: string
  section: Section
  note?: string
}

export interface ProgramDay {
  id: string
  name: string
  blocks: Block[]
}

export interface Program {
  id: string
  name: string
  active: 0 | 1
  days: ProgramDay[]
  createdAt: number
}

export interface Session {
  id: string
  programId: string
  dayId: string
  startedAt: number
  finishedAt?: number
  note?: string
}

export interface SetLog {
  id: string
  sessionId: string
  exerciseId: string
  blockId: string
  setIndex: number
  side?: Side
  weight?: number
  reps?: number
  seconds?: number
  meters?: number
  /** Rate of perceived exertion, 6–10. */
  rpe?: number
  done: boolean
  at: number
}

export interface Segments {
  la?: number
  ra?: number
  trunk?: number
  ll?: number
  rl?: number
}

export interface InBody {
  id: string
  /** YYYY-MM-DD */
  date: string
  weight: number
  smm?: number
  bfm?: number
  pbf?: number
  bmi?: number
  visceral?: number
  bmr?: number
  tbw?: number
  ecwRatio?: number
  protein?: number
  minerals?: number
  score?: number
  lean: Segments
  fat: Segments
  note?: string
}

export const TAPE_FIELDS = [
  'neck', 'shoulders', 'chest', 'waist', 'hips',
  'armL', 'armR', 'forearmL', 'forearmR',
  'thighL', 'thighR', 'calfL', 'calfR',
] as const
export type TapeField = (typeof TAPE_FIELDS)[number]

export type Tape = { id: string; date: string } & Partial<Record<TapeField, number>>

export interface Media {
  id: string
  exerciseId: string
  blob: Blob
  mime: string
  createdAt: number
}

export interface Setting {
  key: string
  value: unknown
}

export type Scale5 = 1 | 2 | 3 | 4 | 5

/** One readiness check-in per day; id is the local date YYYY-MM-DD. */
export interface CheckIn {
  id: string
  sleepHours: number
  sleepQuality: Scale5
  stress: Scale5
  soreness: Scale5
  fatigue: Scale5
  pain: boolean
  painNote?: string
  at: number
}

export type Pose = 'front' | 'side' | 'back'

export interface ProgressPhoto {
  id: string
  /** YYYY-MM-DD */
  date: string
  pose: Pose
  blob: Blob
  mime: string
  at: number
}

/** Optional targets the body screen projects toward. */
export interface BodyGoals { weight?: number; pbf?: number; waist?: number }
