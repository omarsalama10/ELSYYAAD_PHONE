import { FOODS } from '../data/foods'
import type { DayLog, Food, MealEntry, NutritionProfile, WeightLog } from '../domain/nutrition/types'
import { db } from './db'
import { uid } from './repo'

const PROFILE = 'nutritionProfile'

export async function getProfile(): Promise<NutritionProfile | undefined> {
  return (await db.settings.get(PROFILE))?.value as NutritionProfile | undefined
}
export async function saveProfile(p: NutritionProfile): Promise<void> {
  await db.settings.put({ key: PROFILE, value: p })
}

/** Catalog foods (with any saved price override) + custom foods. */
export async function listFoods(): Promise<Food[]> {
  const saved = new Map((await db.foods.toArray()).map((f) => [f.id, f]))
  const catalog = FOODS.map((f) => saved.get(f.id) ?? f)
  const custom = [...saved.values()].filter((f) => f.custom)
  return [...custom, ...catalog]
}
export async function saveFood(f: Food): Promise<void> { await db.foods.put(f) }
export async function deleteFood(id: string): Promise<void> { await db.foods.delete(id) }
export const newFoodId = () => `custom_${uid()}`

export async function addMeal(e: Omit<MealEntry, 'id' | 'at'>): Promise<MealEntry> {
  const entry: MealEntry = { ...e, id: uid(), at: Date.now() }
  await db.meals.add(entry)
  return entry
}
export const deleteMeal = (id: string) => db.meals.delete(id)
export const mealsOn = (date: string) => db.meals.where('date').equals(date).toArray()
export const allMeals = () => db.meals.toArray()

/** Most recently logged distinct foods. */
export async function recentFoodIds(limit = 8): Promise<string[]> {
  const meals = (await db.meals.toArray()).sort((a, b) => b.at - a.at)
  const ids: string[] = []
  for (const m of meals) if (m.foodId && !ids.includes(m.foodId)) { ids.push(m.foodId); if (ids.length >= limit) break }
  return ids
}

export async function getDay(date: string): Promise<DayLog> {
  return (await db.days.get(date)) ?? { id: date, waterMl: 0, supplements: [] }
}
export const saveDay = (d: DayLog) => db.days.put(d)

export async function logWeight(date: string, kg: number): Promise<void> {
  if (!(kg > 20 && kg < 400)) throw new Error('الوزن مش منطقي')
  await db.weights.put({ id: date, kg, at: Date.now() })
}

/** Daily weigh-ins merged with InBody weights (an explicit weigh-in wins on the same day). */
export async function allWeights(): Promise<WeightLog[]> {
  const [weights, inbody] = await Promise.all([db.weights.toArray(), db.inbody.toArray()])
  const byDay = new Map<string, WeightLog>()
  for (const ib of inbody) if (ib.weight) byDay.set(ib.date, { id: ib.date, kg: ib.weight, at: 0 })
  for (const w of weights) byDay.set(w.id, w)
  return [...byDay.values()].sort((a, b) => a.id.localeCompare(b.id))
}
