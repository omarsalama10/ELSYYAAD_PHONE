import type { ExerciseReport } from './report'

export interface AiSummaryInput {
  generatedAt: string
  profile?: { age?: number; heightCm?: number; goal?: string; sex?: string }
  weightKg?: number
  weightRatePerWeek?: number
  inbody?: { date: string; pbf?: number; smm?: number; bfm?: number }
  inbodyFirst?: { date: string; pbf?: number; smm?: number }
  programName?: string
  sessionsLast28: number
  weeklySetsByMuscle: Record<string, number>
  exercises: ExerciseReport[]
  nutrition?: { avgKcal7?: number; avgProtein7?: number; targetKcal?: number; targetProtein?: number }
  avgReadiness7?: number
  notes?: string[]
}

const n = (v: number | undefined, d = 1) => (v === undefined ? '—' : String(Number(v.toFixed(d))))

/** Plain-text (Markdown) snapshot designed to be pasted into ChatGPT for a second opinion. */
export function buildAiSummary(i: AiSummaryInput): string {
  const lines: string[] = []
  lines.push('# ملخص تمريني وجسمي — للتحليل')
  lines.push(`تاريخ الملخص: ${i.generatedAt}`)
  lines.push('')
  lines.push('## عني')
  lines.push(`- السن: ${i.profile?.age ?? '—'} • الطول: ${i.profile?.heightCm ?? '—'} سم • الهدف: ${i.profile?.goal ?? '—'}`)
  lines.push(`- الوزن: ${n(i.weightKg)} كجم • معدل التغير: ${i.weightRatePerWeek !== undefined ? `${i.weightRatePerWeek > 0 ? '+' : ''}${n(i.weightRatePerWeek, 2)} كجم/أسبوع` : '—'}`)
  if (i.inbody) lines.push(`- آخر InBody (${i.inbody.date}): دهون ${n(i.inbody.pbf)}% • عضل SMM ${n(i.inbody.smm)} كجم • كتلة دهون ${n(i.inbody.bfm)} كجم`)
  if (i.inbodyFirst && i.inbody && i.inbodyFirst.date !== i.inbody.date) lines.push(`- أول InBody (${i.inbodyFirst.date}): دهون ${n(i.inbodyFirst.pbf)}% • عضل ${n(i.inbodyFirst.smm)} كجم`)
  lines.push('')
  lines.push('## التمرين')
  lines.push(`- البرنامج: ${i.programName ?? '—'} • عدد التمارين آخر 4 أسابيع: ${i.sessionsLast28}`)
  const muscles = Object.entries(i.weeklySetsByMuscle).sort((a, b) => b[1] - a[1])
  if (muscles.length) lines.push(`- مجموعات الأسبوع لكل عضلة: ${muscles.map(([m, v]) => `${m} ${v}`).join('، ')}`)
  if (i.avgReadiness7 !== undefined) lines.push(`- متوسط الجاهزية آخر 7 أيام: ${Math.round(i.avgReadiness7)}/100`)
  lines.push('')
  lines.push('| التمرين | الحصص | أفضل رقم | الحالة | السبب |')
  lines.push('|---|---|---|---|---|')
  const STATUS: Record<string, string> = { progressing: 'بيتقدّم', plateau: 'ثابت', regressing: 'بينزل', insufficient: 'بيانات قليلة' }
  for (const r of i.exercises.slice(0, 20)) {
    const best = r.records.e1rm ? `1RM ${n(r.records.e1rm.value)} كجم` : r.records.weight ? `${n(r.records.weight.value)} كجم` : r.records.value ? n(r.records.value.value) : '—'
    lines.push(`| ${r.exercise.name} | ${r.sessions} | ${best} | ${STATUS[r.analysis.status]} | ${r.analysis.why.replace(/\|/g, '/')} |`)
  }
  if (i.nutrition) {
    lines.push('')
    lines.push('## الأكل (متوسط آخر 7 أيام)')
    lines.push(`- سعرات: ${n(i.nutrition.avgKcal7, 0)} من هدف ${n(i.nutrition.targetKcal, 0)} • بروتين: ${n(i.nutrition.avgProtein7, 0)} من هدف ${n(i.nutrition.targetProtein, 0)} جم`)
  }
  if (i.notes?.length) {
    lines.push('')
    lines.push('## ملاحظات')
    for (const x of i.notes) lines.push(`- ${x}`)
  }
  lines.push('')
  lines.push('---')
  lines.push('حلّل تقدمي بناءً على الأرقام دي: إيه اللي ماشي كويس، إيه اللي محتاج تعديل في البرنامج أو الأكل، وإيه أهم 3 خطوات للأسابيع الـ 4 الجاية؟ خليك عملي ومحدد بالأرقام.')
  return lines.join('\n')
}
