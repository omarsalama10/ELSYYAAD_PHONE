import type { WeightLog } from './types'

const ALPHA = 0.15
const KCAL_PER_KG = 7700
const WINDOW_DAYS = 21
const MIN_SPAN_DAYS = 14
const MIN_LOGGED_DAYS = 10
const MIN_WEIGHINS = 6
const DAY = 86_400_000

const t = (iso: string) => new Date(`${iso}T12:00:00`).getTime()

/**
 * Time-aware exponential moving average over weigh-ins (sorted by date id): a daily smoothing
 * factor of 0.15, compounded over the gap, so sparse readings (e.g. biweekly InBody) don't lag.
 */
export function emaTrend(weights: WeightLog[]): { id: string; kg: number; trend: number }[] {
  const sorted = [...weights].sort((a, b) => a.id.localeCompare(b.id))
  let trend: number | undefined
  let prev: string | undefined
  return sorted.map((w) => {
    if (trend === undefined || prev === undefined) trend = w.kg
    else {
      const gapDays = Math.max(1, Math.round((t(w.id) - t(prev)) / DAY))
      const alpha = 1 - (1 - ALPHA) ** gapDays
      trend += alpha * (w.kg - trend)
    }
    prev = w.id
    return { id: w.id, kg: w.kg, trend: Number(trend.toFixed(2)) }
  })
}

export interface TdeeEstimate {
  tdee: number
  observed?: number
  confidence: number
  enoughData: boolean
  reason: string
  /** Trend change per week in % of bodyweight, when measurable. */
  weeklyChangePct?: number
  avgIntake?: number
}

/**
 * Energy balance: observed TDEE = mean intake − Δtrend·7700/days, over the last 21 days.
 * Blended with the formula by how many of those days were actually logged.
 */
export function estimateTdee(i: { intakes: { date: string; kcal: number }[]; weights: WeightLog[]; formulaTdee: number; today: string }): TdeeEstimate {
  const end = t(i.today)
  const start = end - (WINDOW_DAYS - 1) * DAY
  const intakes = i.intakes.filter((x) => x.kcal > 0 && t(x.date) >= start && t(x.date) <= end)
  const trend = emaTrend(i.weights.filter((w) => t(w.id) >= start - 14 * DAY && t(w.id) <= end))
  const inWindow = trend.filter((w) => t(w.id) >= start)
  const avgIntake = intakes.length ? Math.round(intakes.reduce((a, x) => a + x.kcal, 0) / intakes.length) : undefined

  const first = inWindow[0], last = inWindow.at(-1)
  const spanDays = first && last ? (t(last.id) - t(first.id)) / DAY : 0
  const weeklyChangePct = first && last && spanDays >= 7 ? Number((((last.trend - first.trend) / first.trend) * 100 * (7 / spanDays)).toFixed(2)) : undefined

  if (spanDays < MIN_SPAN_DAYS || intakes.length < MIN_LOGGED_DAYS || inWindow.length < MIN_WEIGHINS || avgIntake === undefined) {
    return {
      tdee: i.formulaTdee, confidence: 0, enoughData: false, weeklyChangePct, avgIntake,
      reason: `لسه بنتعلّم معدل حرقك: محتاج ${MIN_LOGGED_DAYS} أيام أكل متسجلة (عندك ${intakes.length}) و${MIN_WEIGHINS} مرات وزن (عندك ${inWindow.length}) على مدى أسبوعين.`,
    }
  }
  const observed = Math.round(avgIntake - ((last!.trend - first!.trend) * KCAL_PER_KG) / spanDays)
  const confidence = Math.min(1, intakes.length / WINDOW_DAYS)
  const tdee = Math.round(i.formulaTdee * (1 - confidence) + observed * confidence)
  return {
    tdee, observed, confidence, enoughData: true, weeklyChangePct, avgIntake,
    reason: `متوسط أكلك ${avgIntake} سعرة ووزنك اتغيّر ${(last!.trend - first!.trend).toFixed(1)} كجم في ${Math.round(spanDays)} يوم، فحرقك الفعلي حوالي ${observed} سعرة.`,
  }
}

export const roundTo50 = (v: number) => Math.round(v / 50) * 50
