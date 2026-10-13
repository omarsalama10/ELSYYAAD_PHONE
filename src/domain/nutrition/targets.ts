import type { Goal, Macros, NutritionProfile } from './types'

export const GOAL_OFFSET: Record<Goal, number> = { cut: -400, recomp: 0, leanbulk: 250, bulk: 450 }

export const GOAL_AR: Record<Goal, string> = {
  cut: 'تنشيف', recomp: 'ريكومب (عضل ودهون مع بعض)', leanbulk: 'تضخيم نضيف', bulk: 'تضخيم',
}

export type BmrMethod = 'inbody' | 'katch' | 'mifflin'

/** Latest InBody BMR, else Katch-McArdle from fat mass, else Mifflin-St Jeor. */
export function bmr(i: { profile: NutritionProfile; weight: number; now: number; inbody?: { bmr?: number; bfm?: number } }): { value: number; method: BmrMethod } {
  if (i.inbody?.bmr) return { value: Math.round(i.inbody.bmr), method: 'inbody' }
  if (i.inbody?.bfm && i.inbody.bfm < i.weight) return { value: Math.round(370 + 21.6 * (i.weight - i.inbody.bfm)), method: 'katch' }
  const age = new Date(i.now).getFullYear() - i.profile.birthYear
  const sex = i.profile.sex === 'male' ? 5 : -161
  return { value: Math.round(10 * i.weight + 6.25 * i.profile.heightCm - 5 * age + sex), method: 'mifflin' }
}

export interface Targets extends Macros { tdee: number }

export function macrosFor(kcal: number, profile: NutritionProfile, weight: number): Macros {
  const p = Math.round(profile.proteinPerKg * weight)
  const f = Math.round(Math.max(profile.fatPerKg * weight, (kcal * 0.25) / 9))
  const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4))
  return { kcal, p, c, f }
}

export function dailyTargets(profile: NutritionProfile, weight: number, bmrValue: number): Targets {
  const tdee = Math.round(bmrValue * profile.activity)
  const kcal = profile.kcalOverride ?? tdee + GOAL_OFFSET[profile.goal]
  return { ...macrosFor(kcal, profile, weight), tdee }
}

export function waterTarget(profile: NutritionProfile, weight: number, trainingDay: boolean): number {
  if (profile.waterMl) return profile.waterMl
  return Math.round((weight * 35 + (trainingDay ? 500 : 0)) / 250) * 250
}
