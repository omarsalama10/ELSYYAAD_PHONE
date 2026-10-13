import { addDays, at, dayKey, parseHHMM } from './time'
import type { DayKey, Project, Task } from './types'

/** Folds Arabic spelling variants and diacritics so search is forgiving. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '') // tashkeel + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\s+/g, ' ')
    .trim()
}

/** All query words must appear somewhere in the haystack fields. */
export function matches(query: string, ...fields: (string | undefined)[]): boolean {
  const words = normalize(query).split(' ').filter(Boolean)
  if (!words.length) return true
  const hay = normalize(fields.filter(Boolean).join(' '))
  return words.every((w) => hay.includes(w))
}

export interface QuickAdd {
  title: string
  estimateMin?: number
  importance?: number
  projectId?: string
  dueAt?: number
  startDate?: DayKey
  pinned?: { day: DayKey; startMin: number }
}

/**
 * One-line capture: «مراجعة الكود 45د !4 #البرنامج @بكرة 14:00»
 *  - `45د` `45m` `1.5س` `2h` → estimate
 *  - `!1`..`!5` → importance
 *  - `#name` → project (prefix match on name, spaces as `_`)
 *  - `@اليوم` `@today` `@بكرة` `@tomorrow` `@YYYY-MM-DD` → due end of that day
 *  - `HH:MM` together with a day → pins the task to that time
 */
export function parseQuickAdd(input: string, projects: Project[], now: number): QuickAdd {
  const out: QuickAdd = { title: '' }
  const rest: string[] = []
  let day: DayKey | undefined
  let time: number | undefined
  for (const raw of input.trim().split(/\s+/)) {
    const tok = raw.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    let m: RegExpExecArray | null
    if ((m = /^(\d+(?:\.\d+)?)(د|m|min|دقيقة)$/i.exec(tok))) out.estimateMin = Math.round(Number(m[1]))
    else if ((m = /^(\d+(?:\.\d+)?)(س|h|hr|ساعة)$/i.exec(tok))) out.estimateMin = Math.round(Number(m[1]) * 60)
    else if ((m = /^!([1-5])$/.exec(tok))) out.importance = Number(m[1])
    else if (tok.startsWith('#') && tok.length > 1) {
      const q = normalize(tok.slice(1).replace(/_/g, ' '))
      const p = projects.find((x) => !x.deletedAt && normalize(x.name).startsWith(q)) ?? projects.find((x) => !x.deletedAt && normalize(x.name).includes(q))
      if (p) out.projectId = p.id
      else rest.push(raw)
    } else if (tok.startsWith('@')) {
      const v = normalize(tok.slice(1))
      const today = dayKey(now)
      if (['اليوم', 'today', 'النهارده'].includes(v)) day = today
      else if (['بكره', 'بكرا', 'tomorrow', 'غدا'].includes(v)) day = addDays(today, 1)
      else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) day = v
      else rest.push(raw)
    } else if (parseHHMM(tok) !== undefined && /^\d{1,2}:\d{2}$/.test(tok)) time = parseHHMM(tok)
    else rest.push(raw)
  }
  out.title = rest.join(' ')
  if (day) {
    out.dueAt = at(day, 23 * 60 + 59)
    if (time !== undefined) out.pinned = { day, startMin: time }
  } else if (time !== undefined) {
    out.pinned = { day: dayKey(now), startMin: time }
  }
  return out
}

/** Similar finished tasks → median actual minutes. Purely historical, never invented. */
export function suggestEstimate(draft: Pick<Task, 'title' | 'projectId' | 'category'>, history: Task[]): { minutes: number; basis: number } | undefined {
  const words = new Set(normalize(draft.title).split(' ').filter((w) => w.length > 2))
  const done = history.filter((t) => t.status === 'done' && t.actualMin > 0 && !t.deletedAt)
  const scored = done
    .map((t) => {
      const tw = normalize(t.title).split(' ')
      const overlap = tw.filter((w) => words.has(w)).length
      const score = overlap * 2 + (draft.projectId && t.projectId === draft.projectId ? 1 : 0) + (draft.category && t.category === draft.category ? 1 : 0)
      return { t, score, overlap }
    })
    .filter((x) => x.overlap > 0 || x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 7)
  if (scored.length < 2) return undefined
  const xs = scored.map((x) => x.t.actualMin).sort((a, b) => a - b)
  const m = Math.floor(xs.length / 2)
  const med = xs.length % 2 ? xs[m]! : (xs[m - 1]! + xs[m]!) / 2
  return { minutes: Math.max(5, Math.round(med / 5) * 5), basis: scored.length }
}

// ---------- CSV ----------

export function toCSV<T>(rows: T[], cols: { key: string; label: string; get: (r: T) => unknown }[]): string {
  const esc = (v: unknown) => {
    const s = v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [cols.map((c) => esc(c.label)).join(','), ...rows.map((r) => cols.map((c) => esc(c.get(r))).join(','))]
  // BOM so Excel/Numbers read Arabic as UTF-8.
  return '﻿' + lines.join('\r\n')
}
