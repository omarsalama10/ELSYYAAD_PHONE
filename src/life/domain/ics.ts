import type { DayKey, PlanBlock } from './types'

/**
 * iCalendar export. iOS PWAs can't schedule local notifications while closed, but Apple
 * Calendar can: importing the plan as events with VALARMs gives real offline alerts.
 * Times are "floating" (no TZID) so they stay at the same wall-clock time on the device.
 */

const pad = (n: number) => String(n).padStart(2, '0')
const stamp = (t: number) => {
  const d = new Date(t)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}
const local = (day: DayKey, min: number) => {
  const dayShift = Math.floor(min / 1440)
  const d = new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + dayShift)
  const m = min - dayShift * 1440
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(Math.floor(m / 60))}${pad(m % 60)}00`
}
export const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** RFC 5545 line folding at 75 octets, never splitting a UTF-8 sequence. */
export function fold(line: string): string {
  const enc = new TextEncoder()
  const parts: string[] = []
  let cur = ''
  let size = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (size + n > (parts.length ? 74 : 75)) { parts.push(cur); cur = ''; size = 0 }
    cur += ch
    size += n
  }
  parts.push(cur)
  return parts.join('\r\n ')
}

export interface IcsOptions { now: number; alarmMin?: number; calendarName?: string }

export function buildICS(blocks: PlanBlock[], opt: IcsOptions): string {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ELSYYAAD//Life OS//AR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(opt.calendarName ?? 'ELSYYAAD Life OS')}`,
  ]
  for (const b of blocks) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${b.id.replace(/[^A-Za-z0-9:.-]/g, '-')}@elsyyaad-life-os`,
      `DTSTAMP:${stamp(opt.now)}`,
      `DTSTART:${local(b.day, b.startMin)}`,
      `DTEND:${local(b.day, b.endMin)}`,
      `SUMMARY:${escapeText(b.parts && b.parts > 1 ? `${b.title} (${b.part}/${b.parts})` : b.title)}`,
      `CATEGORIES:${b.kind === 'commitment' ? 'COMMITMENT' : 'TASK'}`,
    )
    if (opt.alarmMin !== undefined && opt.alarmMin >= 0)
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(b.title)}`, `TRIGGER:-PT${Math.round(opt.alarmMin)}M`, 'END:VALARM')
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
