import { roundTo, type Suggestion } from './progression'
import type { CheckIn, Exercise } from './types'

export type Adjust = 'push' | 'normal' | 'hold' | 'reduce'

function sleepHoursScore(h: number): number {
  if (h < 5) return 0
  if (h < 6) return 0.4
  if (h < 7) return 0.7
  if (h <= 9) return 1
  return 0.9
}
const inv = (v: number) => (5 - v) / 4
const pos = (v: number) => (v - 1) / 4

/** 0–100: 30% sleep hours, 15% sleep quality, 15% low stress, 20% low soreness, 20% low fatigue. */
export function readinessScore(c: CheckIn): number {
  const s = 0.3 * sleepHoursScore(c.sleepHours) + 0.15 * pos(c.sleepQuality) + 0.15 * inv(c.stress) + 0.2 * inv(c.soreness) + 0.2 * inv(c.fatigue)
  return Math.round(s * 100)
}

export interface Advice { adjust: Adjust; title: string; text: string }

export function readinessAdvice(score: number, pain: boolean): Advice {
  const painText = pain ? ' في ألم: متحمّلش على المكان ده خالص، ولو الألم حاد أو مستمر استشير دكتور.' : ''
  if (score >= 75) return { adjust: 'push', title: 'جاهزيتك عالية 💪', text: `يوم ممتاز — لو المجموعات خفيفة عليك متتردّدش تزوّد.${painText}` }
  if (score >= 50) return { adjust: 'normal', title: 'جاهزيتك كويسة', text: `امشي على الخطة عادي.${painText}` }
  if (score >= 35) return { adjust: 'hold', title: 'جاهزيتك متوسطة', text: `ثبّت الأوزان النهارده ومتزوّدش — المهم الأداء النضيف.${painText}` }
  return { adjust: 'reduce', title: 'جاهزيتك قليلة', text: `خفّف: أوزان أقل 10% أو خليه يوم كارديو خفيف ومرونة. النوم والأكل أهم من التمرين النهارده.${painText}` }
}

/** Applies today's readiness to a progression suggestion; first/bodyweight suggestions pass through. */
export function applyReadiness(s: Suggestion, adjust: Adjust, e: Exercise, lastWeight: number | undefined): Suggestion {
  if (s.reason === 'first' || s.weight === undefined || e.increment <= 0) return s
  if (adjust === 'hold' && s.reason === 'increase' && lastWeight) {
    return { ...s, weight: lastWeight, reason: 'hold', note: 'جاهزيتك متوسطة النهارده، فثبّتنا الوزن بدل الزيادة' }
  }
  if (adjust === 'reduce') {
    const w = Math.max(0, roundTo(s.weight * 0.9, e.increment))
    return { ...s, weight: w, reason: 'decrease', note: 'جاهزيتك قليلة النهارده، فخففنا الوزن حوالي 10%' }
  }
  return s
}
