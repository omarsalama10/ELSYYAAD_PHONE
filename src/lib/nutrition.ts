import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { allMeals, allWeights, getDay, getProfile, listFoods } from '../db/nutritionRepo'
import { estimateTdee, roundTo50, type TdeeEstimate } from '../domain/nutrition/adaptive'
import { sumMacros } from '../domain/nutrition/food'
import { weeklyReport, type Verdict } from '../domain/nutrition/report'
import { bmr, dailyTargets, GOAL_OFFSET, waterTarget, type BmrMethod, type Targets } from '../domain/nutrition/targets'
import type { DayLog, Food, Macros, MealEntry, NutritionProfile } from '../domain/nutrition/types'

const DAY = 86_400_000
const t = (iso: string) => new Date(`${iso}T12:00:00`).getTime()

export interface NutritionView {
  profile?: NutritionProfile
  weight?: number
  bmr?: { value: number; method: BmrMethod }
  targets?: Targets
  meals: MealEntry[]
  totals: Macros
  day: DayLog
  waterGoal: number
  foods: Food[]
  estimate?: TdeeEstimate
  verdict?: Verdict
  surplus?: number
  avgIntake7?: number
  /** A new calorie target worth adopting, with the reason. */
  suggestion?: { kcal: number; reason: string }
  spent: number
}

export function useNutrition(date: string): NutritionView | undefined {
  return useLiveQuery(async () => {
    const [profile, weights, inbodyAll, meals, day, foods, sessions] = await Promise.all([
      getProfile(), allWeights(), db.inbody.orderBy('date').toArray(), allMeals(), getDay(date), listFoods(), db.sessions.toArray(),
    ])
    const todays = meals.filter((m) => m.date === date).sort((a, b) => a.at - b.at)
    const totals = sumMacros(todays)
    const spent = Math.round(todays.reduce((a, m) => a + (m.price ?? 0), 0))
    const weight = [...weights].reverse().find((w) => w.id <= date)?.kg ?? weights.at(-1)?.kg
    const base: NutritionView = { profile, weight, meals: todays, totals, day, foods, waterGoal: 2500, spent }
    if (!profile || !weight) return base

    const inbody = [...inbodyAll].reverse().find((i) => i.date <= date)
    const b = bmr({ profile, weight, now: t(date), inbody })
    const formula = dailyTargets({ ...profile, kcalOverride: undefined }, weight, b.value)
    const targets = dailyTargets(profile, weight, b.value)
    const trainingDay = sessions.some((s) => s.finishedAt && new Date(s.startedAt).toDateString() === new Date(t(date)).toDateString())

    const byDay = new Map<string, number>()
    for (const m of meals) byDay.set(m.date, (byDay.get(m.date) ?? 0) + m.kcal)
    const intakes = [...byDay.entries()].map(([d, kcal]) => ({ date: d, kcal }))
    const estimate = estimateTdee({ intakes, weights, formulaTdee: formula.tdee, today: date })
    const last7 = intakes.filter((x) => t(x.date) > t(date) - 7 * DAY && t(x.date) <= t(date))
    const avgIntake7 = last7.length ? Math.round(last7.reduce((a, x) => a + x.kcal, 0) / last7.length) : undefined
    const report = weeklyReport({ avgIntake: avgIntake7, tdee: estimate.tdee, weeklyChangePct: estimate.weeklyChangePct, goal: profile.goal })

    let suggestion: NutritionView['suggestion']
    if (estimate.enoughData) {
      const kcal = roundTo50(estimate.tdee + GOAL_OFFSET[profile.goal])
      if (Math.abs(kcal - targets.kcal) >= 100) suggestion = { kcal, reason: estimate.reason }
    } else if (report.verdict.kcalDelta !== 0 && last7.length >= 5) {
      suggestion = { kcal: roundTo50(targets.kcal + report.verdict.kcalDelta), reason: report.verdict.text }
    }

    return {
      ...base, bmr: b, targets, estimate, verdict: report.verdict, surplus: report.surplus, avgIntake7, suggestion,
      waterGoal: waterTarget(profile, weight, trainingDay),
    }
  }, [date])
}
