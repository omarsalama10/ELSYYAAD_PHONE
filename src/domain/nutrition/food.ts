import type { Food, Macros, MealEntry, MealSlot } from './types'

const r1 = (v: number) => Number(v.toFixed(1))

export function macrosForGrams(food: Food, grams: number): Macros {
  const k = grams / 100
  return { kcal: Math.round(food.per100.kcal * k), p: r1(food.per100.p * k), c: r1(food.per100.c * k), f: r1(food.per100.f * k) }
}

export function entryFromFood(food: Food, grams: number, meal: MealSlot = 'snack', date = ''): Omit<MealEntry, 'id' | 'at'> {
  const price = food.price !== undefined ? r1((food.price * grams) / food.serving.grams) : undefined
  return { date, meal, foodId: food.id, name: food.name, grams, ...macrosForGrams(food, grams), ...(price !== undefined ? { price } : {}) }
}

export function sumMacros(list: Macros[]): Macros {
  const s = list.reduce((a, m) => ({ kcal: a.kcal + m.kcal, p: a.p + m.p, c: a.c + m.c, f: a.f + m.f }), { kcal: 0, p: 0, c: 0, f: 0 })
  return { kcal: Math.round(s.kcal), p: r1(s.p), c: r1(s.c), f: r1(s.f) }
}
