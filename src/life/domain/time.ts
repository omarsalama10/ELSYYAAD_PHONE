import type { DayKey } from './types'

export const MIN = 60_000
export const DAY_MS = 86_400_000

const pad = (n: number) => String(n).padStart(2, '0')

export function dayKey(t: number | Date): DayKey {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function isDayKey(s: unknown): s is DayKey {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  return dayKey(parseDay(s)) === s
}

/** Local midnight of the day. */
export function parseDay(k: DayKey): Date {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

export function addDays(k: DayKey, n: number): DayKey {
  const d = parseDay(k)
  d.setDate(d.getDate() + n)
  return dayKey(d)
}

/** Whole days from a to b (b - a), DST-safe. */
export function diffDays(a: DayKey, b: DayKey): number {
  const utc = (k: DayKey) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y!, m! - 1, d!) }
  return Math.round((utc(b) - utc(a)) / DAY_MS)
}

export const weekday = (k: DayKey) => parseDay(k).getDay()

export function at(k: DayKey, minutes: number): number {
  const d = parseDay(k)
  d.setMinutes(minutes)
  return d.getTime()
}

export function minuteOfDay(t: number): number {
  const d = new Date(t)
  return d.getHours() * 60 + d.getMinutes()
}

export function startOfWeek(k: DayKey, weekStartsOn: number): DayKey {
  return addDays(k, -((weekday(k) - weekStartsOn + 7) % 7))
}

export function daysBetween(from: DayKey, toExclusive: DayKey): DayKey[] {
  const out: DayKey[] = []
  for (let k = from; k < toExclusive; k = addDays(k, 1)) out.push(k)
  return out
}

export function hhmm(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

export type ClockFormat = '12h' | '24h'

/**
 * Time of day for display. '12h' → "2:30 م" / "11:00 ص" (1440 = midnight shows as 12:00 ص);
 * '24h' → "14:30". `compact` drops ":00" ("2 م") for axis labels. Data and plan files stay HH:mm.
 */
export function fmtClock(min: number, clock: ClockFormat = '12h', compact = false): string {
  if (clock === '24h') return compact && min % 60 === 0 ? hhmm(min).slice(0, 2) : hhmm(min)
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${h % 12 || 12}${compact && mm === 0 ? '' : `:${pad(mm)}`} ${h < 12 ? 'ص' : 'م'}`
}

/** "2:00–5:30 م" when both ends share the period, else "10:30 م–12:00 ص". */
export function fmtClockRange(from: number, to: number, clock: ClockFormat = '12h'): string {
  const a = fmtClock(from, clock), b = fmtClock(to, clock)
  if (clock === '24h') return `${a}–${b}`
  return a.slice(-1) === b.slice(-1) ? `${a.slice(0, -2)}–${b}` : `${a}–${b}`
}

export function parseHHMM(s: string): number | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return undefined
  const h = Number(m[1]), mm = Number(m[2])
  if (h > 24 || mm > 59 || (h === 24 && mm > 0)) return undefined
  return h * 60 + mm
}

export function fmtMinutes(min: number): string {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${r} د`
  return r === 0 ? `${h} س` : `${h} س ${r} د`
}

export const ceilTo = (min: number, step: number) => Math.ceil(min / step) * step

/** Interval arithmetic on [start, end) minute ranges. Inputs need not be sorted. */
export type Interval = [number, number]

export function subtractIntervals(base: Interval[], cut: Interval[]): Interval[] {
  let out = base.filter(([a, b]) => b > a).map(([a, b]) => [a, b] as Interval)
  for (const [ca, cb] of cut) {
    if (cb <= ca) continue
    const next: Interval[] = []
    for (const [a, b] of out) {
      if (cb <= a || ca >= b) { next.push([a, b]); continue }
      if (ca > a) next.push([a, ca])
      if (cb < b) next.push([cb, b])
    }
    out = next
  }
  return out.sort((x, y) => x[0] - y[0])
}

export const totalMinutes = (xs: Interval[]) => xs.reduce((s, [a, b]) => s + Math.max(0, b - a), 0)
