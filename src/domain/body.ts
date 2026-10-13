const DAY = 86_400_000
const WEEK = 7 * DAY
const t = (iso: string) => new Date(`${iso}T12:00:00`).getTime()

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100
  return Number((weightKg / (m * m)).toFixed(1))
}

export function bmiCategory(v: number): string {
  if (v < 18.5) return 'نحافة'
  if (v < 25) return 'طبيعي'
  if (v < 30) return 'وزن زايد'
  return 'سمنة'
}

/** Fat-free mass from InBody fat mass, else from body-fat %. */
export function fatFreeMass(weightKg: number, i: { bfm?: number; pbf?: number }): number | undefined {
  if (i.bfm !== undefined) return Number((weightKg - i.bfm).toFixed(1))
  if (i.pbf !== undefined) return Number((weightKg * (1 - i.pbf / 100)).toFixed(1))
  return undefined
}

export interface Dated { date: string; value: number }

/** Least-squares slope in units per week; undefined with <3 points or <14 days of span. */
export function weeklySlope(points: Dated[]): number | undefined {
  if (points.length < 3) return undefined
  const xs = points.map((p) => t(p.date) / WEEK)
  const ys = points.map((p) => p.value)
  const span = (Math.max(...xs) - Math.min(...xs)) * 7
  if (span < 14) return undefined
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = ys.reduce((a, b) => a + b, 0) / ys.length
  let num = 0, den = 0
  xs.forEach((x, i) => { num += (x - mx) * (ys[i]! - my); den += (x - mx) ** 2 })
  return den === 0 ? undefined : num / den
}

export type ProjectionStatus = 'reached' | 'on-track' | 'wrong-way' | 'flat' | 'insufficient'

export interface Projection {
  status: ProjectionStatus
  /** Weeks to target at the current rate. */
  weeks?: number
  eta?: number
  ratePerWeek?: number
  text: string
}

const MAX_WEEKS = 156

/** Linear projection from the recent trend (last 8 weeks of points). Re-evaluated whenever data changes. */
export function projectGoal(points: Dated[], target: number, now: number, unit: string): Projection {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  const current = sorted.at(-1)?.value
  if (current === undefined) return { status: 'insufficient', text: 'مفيش قياسات لسه.' }
  const gap = target - current
  // Direction comes from where you started, so overshooting the target still counts as reached.
  const dir = Math.sign(target - sorted[0]!.value) || Math.sign(gap)
  const tol = Math.max(0.15, Math.abs(target) * 0.005)
  if (gap * dir <= tol) return { status: 'reached', text: 'وصلت لهدفك 🎉' }
  const recent = sorted.filter((p) => t(p.date) >= t(sorted.at(-1)!.date) - 8 * WEEK)
  const rate = weeklySlope(recent)
  if (rate === undefined) return { status: 'insufficient', text: 'محتاج 3 قياسات على الأقل على مدى أسبوعين عشان نتوقّع.' }
  const r = Number(rate.toFixed(2))
  if (Math.abs(rate) < 0.02) return { status: 'flat', ratePerWeek: r, text: `ثابت تقريبًا — بالمعدل ده مش هتوصل. محتاج تغيّر حاجة (أكل أو تمرين).` }
  if (Math.sign(rate) !== Math.sign(gap)) return { status: 'wrong-way', ratePerWeek: r, text: `ماشي عكس الهدف (${r > 0 ? '+' : ''}${r} ${unit} في الأسبوع).` }
  const weeks = gap / rate
  if (weeks > MAX_WEEKS) return { status: 'flat', ratePerWeek: r, text: 'المعدل بطيء جدًا — أكتر من 3 سنين.' }
  const eta = now + weeks * WEEK
  return { status: 'on-track', weeks: Math.ceil(weeks), eta, ratePerWeek: r, text: `بمعدلك الحالي (${r > 0 ? '+' : ''}${r} ${unit}/أسبوع) هتوصل بعد حوالي ${Math.ceil(weeks)} أسبوع.` }
}
