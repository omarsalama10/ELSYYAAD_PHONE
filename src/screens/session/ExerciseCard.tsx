import { useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteSet, upsertSet, uid, type SessionSets } from '../../db/repo'
import { effectiveSets, suggest, type Suggestion } from '../../domain/progression'
import type { Block, Exercise, SetLog, Side } from '../../domain/types'
import { fmtNum, UNIT } from '../../lib/format'
import { suggestionText } from '../../lib/workout'
import { MUSCLE_AR } from '../../data/catalog'
import { ExerciseDemo } from '../../ui/ExerciseDemo'
import { Icon } from '../../ui/icons'
import { useRest } from '../../ui/RestTimer'
import { useSafe } from '../../ui/Toast'
import { fromLog, toLog, type RowValues } from '../../lib/setValues'
import { SetRow } from './SetRow'

const SIDE_AR: Record<Side, string> = { L: 'شمال', R: 'يمين' }

interface Props {
  sessionId: string
  block: Block
  exercise: Exercise
  week: number
  sets: SetLog[]
  history: SessionSets[]
  open: boolean
  onToggle: () => void
  /** False for the first exercise(s) of a superset: go straight to the partner. */
  restAfter: boolean
}

function lastTimeSummary(e: Exercise, h: SessionSets | undefined): string | undefined {
  if (!h) return undefined
  const fmt = (s: SetLog) => {
    const v = fromLog(e, s).value
    return s.weight ? `${fmtNum(s.weight)}×${fmtNum(v)}` : `${fmtNum(v)}${UNIT[e.metric]}`
  }
  if (!e.unilateral) return h.sets.map(fmt).join('، ')
  return (['L', 'R'] as const)
    .map((side) => `${SIDE_AR[side]}: ${h.sets.filter((s) => s.side === side).map(fmt).join('، ')}`)
    .join(' | ')
}

export function ExerciseCard({ sessionId, block, exercise: e, week, sets, history, open, onToggle, restAfter }: Props) {
  const rest = useRest()
  const safe = useSafe()
  const [extra, setExtra] = useState(0)
  const planned = effectiveSets(block, week)
  const maxLogged = Math.max(-1, ...sets.map((s) => s.setIndex))
  const rows = Math.max(planned + extra, maxLogged + 1)
  const sides: (Side | undefined)[] = e.unilateral ? ['L', 'R'] : [undefined]
  const suggestions = suggest({ exercise: e, block, history: history.map((h) => h.sets) })
  const sugFor = (side?: Side): Suggestion | undefined => suggestions.find((s) => s.side === side)
  const doneCount = sets.filter((s) => s.done).length
  const need = planned * sides.length
  const complete = doneCount >= need
  const range = block.repMin === block.repMax ? `${block.repMin}` : `${block.repMin}-${block.repMax}`
  const last = lastTimeSummary(e, history[0])

  const find = (i: number, side?: Side) => sets.find((s) => s.setIndex === i && s.side === side)

  /** Default for an empty row: previous done row of the same side, else the suggestion. */
  const prefill = (i: number, side?: Side): RowValues => {
    for (let j = i - 1; j >= 0; j--) {
      const p = find(j, side)
      if (p?.done) return fromLog(e, p)
    }
    const s = sugFor(side)
    return { weight: s?.weight, value: s?.target }
  }

  const complete_ = (i: number, side: Side | undefined, v: RowValues) =>
    safe(async () => {
      const existing = find(i, side)
      await upsertSet({
        id: existing?.id ?? uid(), sessionId, exerciseId: e.id, blockId: block.id, setIndex: i,
        ...(side ? { side } : {}), ...toLog(e, v), done: true, at: Date.now(),
      })
      const lastSide = !side || side === 'R'
      if (restAfter && lastSide) rest.start(block.restSec)
    })

  const update = (i: number, side: Side | undefined, v: RowValues) =>
    safe(async () => {
      const existing = find(i, side)
      if (existing) await upsertSet({ ...existing, ...toLog(e, v) })
    })

  const undo = (i: number, side?: Side) =>
    safe(async () => {
      const existing = find(i, side)
      if (existing) await deleteSet(existing.id)
    })

  return (
    <div className={`rounded-2xl border bg-surface ${complete ? 'border-accent/50' : 'border-line'}`} data-testid={`card-${block.id}`}>
      <button type="button" className="flex w-full items-center gap-3 p-3 text-right" onClick={onToggle} aria-expanded={open}>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${complete ? 'bg-accent text-bg' : 'bg-surface2 text-muted'}`}>
          {complete ? <Icon.check /> : `${doneCount}/${need}`}
        </span>
        <span className="flex-1">
          <span className="block font-bold leading-tight">{e.nameAr}</span>
          <span className="ltr block text-right text-xs text-muted">{e.name}</span>
        </span>
        <span className="text-sm text-muted ltr">{planned}×{range}{UNIT[e.metric] === 'عدة' ? '' : UNIT[e.metric]}</span>
        <Icon.chevron open={open} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-line p-3">
          <ExerciseDemo exercise={e} compact />
          <div className="flex flex-wrap gap-1.5 text-xs">
            {e.muscles.slice(0, 3).map((m) => (
              <span key={m} className="rounded-full bg-surface2 px-2 py-0.5 text-muted">{MUSCLE_AR[m] ?? m}</span>
            ))}
            <Link to={`/exercises/${encodeURIComponent(e.id)}`} className="rounded-full bg-surface2 px-2 py-0.5 text-accent2">تفاصيل وفيديو</Link>
          </div>
          <ul className="list-disc space-y-0.5 pr-5 text-sm leading-relaxed text-ink/90">
            {e.cuesAr.map((c) => <li key={c}>{c}</li>)}
          </ul>
          {block.note && <div className="text-sm text-warn">📌 {block.note}</div>}
          {last && <div className="text-xs text-muted">آخر مرة: <span className="ltr">{last}</span></div>}
          {e.metric !== 'cardio' && block.section !== 'warmup' &&
            sides.map((side) => {
              const s = sugFor(side)
              return s ? (
                <div key={side ?? 'x'} className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent" data-testid="suggestion">
                  {side ? `${SIDE_AR[side]}: ` : ''}{suggestionText(s, e)}
                </div>
              ) : null
            })}

          <div className="space-y-1.5">
            {Array.from({ length: rows }, (_, i) =>
              sides.map((side) => {
                const log = find(i, side)
                return (
                  <SetRow
                    key={`${i}-${side ?? ''}`}
                    exercise={e}
                    index={i}
                    sideLabel={side ? SIDE_AR[side] : undefined}
                    log={log ? fromLog(e, log) : undefined}
                    done={!!log?.done}
                    prefill={prefill(i, side)}
                    onDone={(v) => complete_(i, side, v)}
                    onUndo={() => undo(i, side)}
                    onChange={(v) => update(i, side, v)}
                  />
                )
              }),
            )}
          </div>
          <button type="button" className="flex items-center gap-1 text-sm text-accent2" onClick={() => setExtra((x) => x + 1)}>
            <Icon.plus /> مجموعة زيادة
          </button>
        </div>
      )}
    </div>
  )
}
