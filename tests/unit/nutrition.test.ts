import { describe, expect, it } from 'vitest'
import { bmr, dailyTargets, GOAL_OFFSET } from '../../src/domain/nutrition/targets'
import { emaTrend, estimateTdee } from '../../src/domain/nutrition/adaptive'
import { weeklyReport } from '../../src/domain/nutrition/report'
import { cheapestProtein, suggestFill } from '../../src/domain/nutrition/budget'
import { entryFromFood, sumMacros } from '../../src/domain/nutrition/food'
import type { Food, NutritionProfile } from '../../src/domain/nutrition/types'

const profile: NutritionProfile = { sex: 'male', birthYear: 2005, heightCm: 178, activity: 1.4, goal: 'leanbulk', proteinPerKg: 2, fatPerKg: 0.8, supplements: [] }
const NOW = new Date(2026, 9, 13).getTime()

describe('targets', () => {
  it('prefers InBody BMR, then Katch-McArdle, then Mifflin', () => {
    expect(bmr({ profile, weight: 68, now: NOW, inbody: { bmr: 1600 } })).toEqual({ value: 1600, method: 'inbody' })
    expect(bmr({ profile, weight: 68, now: NOW, inbody: { bfm: 15 } })).toEqual({ value: Math.round(370 + 21.6 * 53), method: 'katch' })
    // 10*68 + 6.25*178 - 5*21 + 5
    expect(bmr({ profile, weight: 68, now: NOW })).toEqual({ value: Math.round(680 + 1112.5 - 105 + 5), method: 'mifflin' })
  })
  it('builds macros: protein by weight, fat floor, carbs remainder', () => {
    const t = dailyTargets(profile, 68, 1600)
    expect(t.tdee).toBe(2240)
    expect(t.kcal).toBe(2240 + GOAL_OFFSET.leanbulk)
    expect(t.p).toBe(136)
    expect(t.f).toBe(Math.round(Math.max(0.8 * 68, (t.kcal * 0.25) / 9)))
    expect(Math.abs(t.p * 4 + t.c * 4 + t.f * 9 - t.kcal)).toBeLessThan(10)
  })
  it('uses an adopted override', () => {
    expect(dailyTargets({ ...profile, kcalOverride: 2700 }, 68, 1600).kcal).toBe(2700)
  })
})

describe('adaptive TDEE', () => {
  const days = (n: number) => Array.from({ length: n }, (_, i) => {
    const d = new Date(2026, 8, 20 + i)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  it('smooths daily weights with an EMA', () => {
    const t = emaTrend([{ id: '2026-10-01', kg: 70, at: 0 }, { id: '2026-10-02', kg: 72, at: 1 }])
    expect(t[1]!.trend).toBeCloseTo(70.3, 1)
  })
  it('compounds the factor over gaps so sparse readings do not lag', () => {
    const t = emaTrend([{ id: '2026-09-01', kg: 70, at: 0 }, { id: '2026-09-15', kg: 72, at: 1 }])
    expect(t[1]!.trend).toBeGreaterThan(71.7)
  })
  it('falls back to the formula without enough data', () => {
    const r = estimateTdee({ intakes: [], weights: [], formulaTdee: 2300, today: '2026-10-13' })
    expect(r).toMatchObject({ tdee: 2300, enoughData: false })
  })
  it('learns a higher TDEE when weight is stable on more food', () => {
    const ds = days(21)
    const intakes = ds.map((date) => ({ date, kcal: 2800 }))
    const weights = ds.filter((_, i) => i % 2 === 0).map((id, i) => ({ id, kg: 70, at: i }))
    const r = estimateTdee({ intakes, weights, formulaTdee: 2300, today: ds.at(-1)! })
    expect(r.enoughData).toBe(true)
    expect(r.observed).toBeCloseTo(2800, -1)
    expect(r.tdee).toBeGreaterThan(2700)
  })
})

describe('weekly report', () => {
  it('flags a bulk that gains too slowly', () => {
    const r = weeklyReport({ avgIntake: 2500, tdee: 2450, weeklyChangePct: 0.02, goal: 'leanbulk' })
    expect(r.verdict.tone).toBe('warn')
    expect(r.verdict.kcalDelta).toBe(150)
  })
  it('approves the ideal rate', () => {
    expect(weeklyReport({ avgIntake: 2700, tdee: 2450, weeklyChangePct: 0.35, goal: 'leanbulk' }).verdict.tone).toBe('ok')
  })
  it('warns when gaining too fast', () => {
    expect(weeklyReport({ avgIntake: 3200, tdee: 2450, weeklyChangePct: 0.9, goal: 'bulk' }).verdict.kcalDelta).toBe(-150)
  })
  it('handles recomp and cut', () => {
    expect(weeklyReport({ avgIntake: 2400, tdee: 2400, weeklyChangePct: 0.05, goal: 'recomp' }).verdict.tone).toBe('ok')
    expect(weeklyReport({ avgIntake: 2000, tdee: 2400, weeklyChangePct: -0.7, goal: 'cut' }).verdict.tone).toBe('ok')
  })
})

describe('food & budget', () => {
  const egg: Food = { id: 'egg', name: 'بيض', per100: { kcal: 143, p: 12.6, c: 0.7, f: 9.5 }, serving: { label: 'بيضة', grams: 50 }, custom: false, price: 6 }
  const fool: Food = { id: 'fool', name: 'فول', per100: { kcal: 110, p: 7.6, c: 19.7, f: 0.4 }, serving: { label: 'طبق', grams: 200 }, custom: false, price: 10 }
  const tuna: Food = { id: 'tuna', name: 'تونة', per100: { kcal: 116, p: 26, c: 0, f: 1 }, serving: { label: 'علبة', grams: 120 }, custom: false, price: 60 }
  it('scales macros by grams and prices by servings', () => {
    const e = entryFromFood(egg, 100)
    expect(e).toMatchObject({ kcal: 143, p: 12.6, price: 12, grams: 100, name: 'بيض' })
    expect(sumMacros([e, entryFromFood(fool, 200)])).toEqual({ kcal: 363, p: 27.8, c: 40.1, f: 10.3 })
  })
  it('ignores cheap foods that are not protein sources', () => {
    const bread: Food = { id: 'bread', name: 'عيش', per100: { kcal: 250, p: 9, c: 51, f: 1.2 }, serving: { label: 'رغيف', grams: 90 }, custom: false, price: 1 }
    expect(cheapestProtein([bread, egg]).map((x) => x.food.id)).toEqual(['egg'])
  })
  it('ranks protein per pound', () => {
    expect(cheapestProtein([tuna, egg, fool]).map((x) => x.food.id)).toEqual(['fool', 'egg', 'tuna'])
  })
  it('fills remaining protein within budget', () => {
    const plan = suggestFill(40, 30, [tuna, egg, fool])
    const spent = plan.reduce((a, x) => a + x.price, 0)
    expect(spent).toBeLessThanOrEqual(30)
    expect(plan.reduce((a, x) => a + x.p, 0)).toBeGreaterThanOrEqual(25)
    expect(plan.some((x) => x.food.id === 'tuna')).toBe(false)
  })
})

describe('food catalog', () => {
  it('has unique ids and consistent energy (4/4/9 within 20%)', async () => {
    const { FOODS } = await import('../../src/data/foods')
    expect(new Set(FOODS.map((f) => f.id)).size).toBe(FOODS.length)
    for (const f of FOODS) {
      const est = f.per100.p * 4 + f.per100.c * 4 + f.per100.f * 9
      const diff = Math.abs(est - f.per100.kcal)
      expect(diff < 15 || diff / f.per100.kcal < 0.2, `${f.id}: ${f.per100.kcal} vs ${est.toFixed(0)}`).toBe(true)
      expect(f.serving.grams, f.id).toBeGreaterThan(0)
    }
  })
})
