export type Sex = 'male' | 'female'
export type Goal = 'cut' | 'recomp' | 'leanbulk' | 'bulk'
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface Macros { kcal: number; p: number; c: number; f: number }

export interface NutritionProfile {
  sex: Sex
  birthYear: number
  heightCm: number
  /** TDEE multiplier on BMR. */
  activity: number
  goal: Goal
  proteinPerKg: number
  fatPerKg: number
  /** Daily food budget in EGP. */
  budget?: number
  supplements: string[]
  waterMl?: number
  /** Adopted adaptive target; replaces the formula target when set. */
  kcalOverride?: number
}

export interface Food {
  id: string
  name: string
  per100: Macros
  serving: { label: string; grams: number }
  custom: boolean
  /** EGP per serving. */
  price?: number
}

/** Macros are snapshotted at log time so later food edits never rewrite history. */
export interface MealEntry extends Macros {
  id: string
  date: string
  meal: MealSlot
  foodId?: string
  name: string
  grams?: number
  price?: number
  at: number
}

export interface DayLog { id: string; waterMl: number; supplements: string[] }
export interface WeightLog { id: string; kg: number; at: number }
