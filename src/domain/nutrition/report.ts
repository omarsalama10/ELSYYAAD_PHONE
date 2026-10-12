import type { Goal } from './types'

export interface Verdict { tone: 'ok' | 'warn'; text: string; kcalDelta: number }

const RANGES: Record<Goal, [number, number]> = {
  cut: [-1, -0.5],
  recomp: [-0.1, 0.1],
  leanbulk: [0.25, 0.5],
  bulk: [0.25, 0.75],
}

/** Judges the weekly bodyweight trend against the goal's ideal rate. */
export function weeklyReport(i: { avgIntake?: number; tdee: number; weeklyChangePct?: number; goal: Goal }): { surplus?: number; verdict: Verdict } {
  const surplus = i.avgIntake !== undefined ? i.avgIntake - i.tdee : undefined
  const r = i.weeklyChangePct
  if (r === undefined) return { surplus, verdict: { tone: 'warn', text: 'سجّل وزنك كل يوم الصبح (بعد الحمام وقبل الأكل) عشان نعرف اتجاهك.', kcalDelta: 0 } }
  const [lo, hi] = RANGES[i.goal]
  const bulkish = i.goal === 'leanbulk' || i.goal === 'bulk'
  const rate = `${r > 0 ? '+' : ''}${r}% من وزنك في الأسبوع`
  if (bulkish && r < 0.1) return { surplus, verdict: { tone: 'warn', text: `وزنك مش بيزيد (${rate}) — إنت مش في فائض كفاية للتضخيم. زوّد 150 سعرة.`, kcalDelta: 150 } }
  if (bulkish && r > 0.75) return { surplus, verdict: { tone: 'warn', text: `بتزيد بسرعة (${rate}) — ده هيبقى دهون أكتر من عضل. قلّل 150 سعرة.`, kcalDelta: -150 } }
  if (i.goal === 'cut' && r > -0.3) return { surplus, verdict: { tone: 'warn', text: `الوزن مش بينزل كفاية (${rate}). قلّل 150 سعرة.`, kcalDelta: -150 } }
  if (i.goal === 'cut' && r < -1.2) return { surplus, verdict: { tone: 'warn', text: `بتنزل بسرعة زيادة (${rate}) وده هيضيّع عضل. زوّد 150 سعرة.`, kcalDelta: 150 } }
  if (i.goal === 'recomp' && Math.abs(r) > 0.25) return { surplus, verdict: { tone: 'warn', text: `في الريكومب الوزن المفروض ثابت تقريبًا (${rate}).`, kcalDelta: r > 0 ? -100 : 100 } }
  const ideal = r >= lo && r <= hi
  return { surplus, verdict: { tone: 'ok', text: ideal ? `معدل مثالي لهدفك (${rate}) — كمّل كده.` : `قريب من المعدل المثالي (${rate}) — كمّل وراقب.`, kcalDelta: 0 } }
}
