import { macrosForGrams } from './food'
import type { Food } from './types'

export interface Ranked { food: Food; proteinPerServing: number; proteinPerEgp: number }

/** Priced foods by grams of protein per pound, best first. */
export function cheapestProtein(foods: Food[]): Ranked[] {
  return foods
    .filter((f) => f.price && f.price > 0)
    .map((food) => {
      const p = macrosForGrams(food, food.serving.grams).p
      return { food, proteinPerServing: p, proteinPerEgp: p / food.price! }
    })
    .filter((x) => x.proteinPerServing >= 3)
    .sort((a, b) => b.proteinPerEgp - a.proteinPerEgp)
}

export interface FillItem { food: Food; servings: number; p: number; price: number }

const MAX_SERVINGS = 3

/** Greedy: cheapest protein first, at most 3 servings each, never over budget. */
export function suggestFill(proteinLeft: number, budgetLeft: number, foods: Food[]): FillItem[] {
  const plan: FillItem[] = []
  let p = proteinLeft, money = budgetLeft
  for (const r of cheapestProtein(foods)) {
    let n = 0
    while (p > 0 && n < MAX_SERVINGS && r.food.price! <= money) {
      n++
      p -= r.proteinPerServing
      money -= r.food.price!
    }
    if (n) plan.push({ food: r.food, servings: n, p: Number((n * r.proteinPerServing).toFixed(1)), price: n * r.food.price! })
    if (p <= 0) break
  }
  return plan
}
