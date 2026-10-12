import { useMemo, useState } from 'react'
import { MUSCLE_AR } from '../data/catalog'
import type { Exercise } from '../domain/types'
import { Icon } from './icons'

function matches(e: Exercise, q: string): boolean {
  if (!q) return true
  const hay = [e.name, e.nameAr, ...e.muscles, ...e.muscles.map((m) => MUSCLE_AR[m] ?? '')].join(' ').toLowerCase()
  return q.toLowerCase().split(/\s+/).every((t) => hay.includes(t))
}

/** Searchable exercise list shared by the library screen and the program picker. */
export function ExerciseList({ exercises, onPick }: { exercises: Exercise[]; onPick: (e: Exercise) => void }) {
  const [q, setQ] = useState('')
  const list = useMemo(
    () => exercises.filter((e) => matches(e, q.trim())).sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar')),
    [exercises, q],
  )
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 glass-strong rounded-2xl px-3">
        <Icon.search />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="دوّر بالاسم أو العضلة (صدر، ساعد...)"
          className="w-full border-0 bg-transparent px-0 focus:border-0"
        />
      </label>
      <ul className="glass divide-y divide-white/70 overflow-hidden">
        {list.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => onPick(e)} className="flex w-full items-center gap-3 p-3 text-right active:bg-white/60">
              {e.images[0] ? (
                <img src={e.images[0]} alt="" loading="lazy" className="h-12 w-16 shrink-0 rounded-xl bg-white object-cover" />
              ) : (
                <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg bg-white/60 text-muted"><Icon.video /></span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{e.nameAr}</span>
                <span className="ltr block truncate text-right text-xs text-muted">{e.name}</span>
              </span>
              <span className="text-xs text-muted">{MUSCLE_AR[e.muscles[0] ?? ''] ?? ''}</span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="p-6 text-center text-sm text-muted">مفيش نتايج</li>}
      </ul>
    </div>
  )
}
