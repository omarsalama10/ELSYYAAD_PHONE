import type { Point } from './stats'

export type ProgressStatus = 'insufficient' | 'progressing' | 'plateau' | 'regressing'

export interface ProgressAnalysis {
  status: ProgressStatus
  /** Plain-language reason, citing the numbers. */
  why: string
  recommendation: string
}

export interface AnalyzeInput {
  /** One best value per session, chronological. */
  points: Point[]
  /** Mean RPE of the last 3 sessions, if logged. */
  avgRpe?: number
  /** Mean readiness of check-ins over the same period, if any. */
  avgReadiness?: number
  /** Alternative exercise names for the same primary muscle. */
  alternatives?: string[]
}

const MIN_SESSIONS = 4
const PLATEAU_SESSIONS = 3

export function analyzeProgress({ points, avgRpe, avgReadiness, alternatives = [] }: AnalyzeInput): ProgressAnalysis {
  const ys = points.map((p) => p.y)
  const n = ys.length
  if (n < MIN_SESSIONS)
    return { status: 'insufficient', why: `محتاج ${MIN_SESSIONS} حصص على الأقل للتحليل (عندك ${n}).`, recommendation: 'كمّل على الخطة.' }

  let best = -Infinity
  let lastBestIdx = 0
  ys.forEach((y, i) => { if (y > best) { best = y; lastBestIdx = i } })
  const last = ys[n - 1]!
  const since = n - 1 - lastBestIdx
  const dropping = ys[n - 1]! < ys[n - 2]! && ys[n - 2]! < ys[n - 3]!

  const cause = (): string => {
    if (avgRpe !== undefined && avgRpe >= 9)
      return `المجهود عالي جدًا (متوسط RPE ${avgRpe.toFixed(1)}): خفّض الأوزان 10% لمدة أسبوع (Deload) وبعدين ارجع تبني.`
    if (avgReadiness !== undefined && avgReadiness < 50)
      return `جاهزيتك قليلة (متوسط ${Math.round(avgReadiness)}/100): المشكلة غالبًا في الاستشفاء — نوم 7-9 ساعات وأكل كفاية قبل ما تغيّر البرنامج.`
    const alt = alternatives.slice(0, 2).join(' أو ')
    return `غيّر نطاق العدات (مثلًا 6-8 بدل 8-10) لمدة 3 أسابيع${alt ? `، أو بدّل لتمرين بديل: ${alt}` : ''}.`
  }

  if (dropping && last < best * 0.95)
    return { status: 'regressing', why: `آخر حصتين الأداء نازل، وآخر رقم ${round(last)} أقل من أفضل رقم ${round(best)} بـ ${pct(best - last, best)}%.`, recommendation: cause() }
  if (since >= PLATEAU_SESSIONS)
    return { status: 'plateau', why: `مفيش رقم جديد بقالك ${since} حصص (أفضل رقم ${round(best)}).`, recommendation: cause() }

  const base = ys[Math.max(0, n - 4)]!
  const gain = base > 0 ? pct(last - base, base) : 0
  return { status: 'progressing', why: `ماشي كويس: ${gain >= 0 ? '+' : ''}${gain}% في آخر ${Math.min(4, n)} حصص.`, recommendation: 'كمّل على نفس الخطة والتدرّج.' }
}

const round = (v: number) => Number(v.toFixed(1))
const pct = (d: number, b: number) => Math.round((d / b) * 100)
