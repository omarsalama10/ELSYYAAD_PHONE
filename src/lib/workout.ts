import { effectiveSets, type Suggestion } from '../domain/progression'
import type { Exercise, ProgramDay, Section } from '../domain/types'
import { UNIT } from './format'

export const SECTION_AR: Record<Section, string> = {
  warmup: 'إحماء وتعديل الوضع',
  main: 'التمرين الأساسي',
  finisher: 'ساعد • قبضة • بطن',
  cardio: 'كارديو',
}

const WORK_SEC = 40

/** Rough session length in minutes: work + rest per set, cardio minutes as-is. */
export function estimateMinutes(day: ProgramDay, exercises: Map<string, Exercise>, week: number): number {
  let sec = 0
  for (const b of day.blocks) {
    const e = exercises.get(b.exerciseId)
    if (!e) continue
    if (e.metric === 'cardio') { sec += b.repMax * 60; continue }
    const sides = e.unilateral ? 2 : 1
    sec += effectiveSets(b, week) * (WORK_SEC * sides + b.restSec)
  }
  return Math.round(sec / 60 / 5) * 5
}

export function suggestionText(s: Suggestion, e: Exercise): string {
  const u = UNIT[e.metric]
  const w = s.weight !== undefined ? `${s.weight} كجم` : ''
  switch (s.reason) {
    case 'first':
      return e.increment > 0 ? `أول مرة: اختار وزن تعمل بيه ${s.target} ${u} بسهولة` : `أول مرة: هدفك ${s.target} ${u}`
    case 'increase':
      return w ? `🔥 زوّد لـ ${w} — هدفك ${s.target} ${u}` : `🔥 هدفك ${s.target} ${u}`
    case 'hold':
      return w ? `نفس الوزن ${w} — هدفك ${s.target} ${u} في كل مجموعة` : `هدفك ${s.target} ${u}`
    case 'decrease':
      return `⬇️ خفّض لـ ${w} وركّز على الأداء — ${s.target} ${u}`
  }
}
