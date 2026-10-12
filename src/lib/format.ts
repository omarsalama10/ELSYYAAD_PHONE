import type { Metric } from '../domain/types'

const LOCALE = 'ar-EG-u-nu-latn'

export const fmtDate = (t: number | string) =>
  new Date(t).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })

export const fmtDateLong = (t: number | string) =>
  new Date(t).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' })

export const fmtNum = (n: number | undefined, digits = 1) =>
  n === undefined || Number.isNaN(n) ? '—' : String(Number(n.toFixed(digits)))

export function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export const UNIT: Record<Metric, string> = { reps: 'عدة', time: 'ث', distance: 'م', cardio: 'د' }

export const todayISO = (now = Date.now()) => {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Start of the current training week (Saturday 00:00 local, Egyptian week). */
export function weekStart(now = Date.now()): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const sinceSat = (d.getDay() + 1) % 7
  d.setDate(d.getDate() - sinceSat)
  return d.getTime()
}
