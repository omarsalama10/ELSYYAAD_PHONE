import { useEffect, useState } from 'react'
import type { Exercise } from '../../domain/types'
import { UNIT } from '../../lib/format'
import { Icon } from '../../ui/icons'
import type { RowValues } from '../../lib/setValues'
import { NumberInput } from '../../ui/primitives'

interface Props {
  exercise: Exercise
  index: number
  sideLabel?: string
  log?: RowValues
  done: boolean
  prefill: RowValues
  onDone: (v: RowValues) => void
  onUndo: () => void
  onChange: (v: RowValues) => void
  rpe?: number
  /** Omit to hide RPE (warm-up, cardio). */
  onRpe?: (rpe: number) => void
}

const RPE_VALUES = [6, 7, 8, 9, 10]
const RPE_HINT: Record<number, string> = { 6: 'سهل', 7: 'كان فيه 3', 8: 'كان فيه 2', 9: 'كان فيه 1', 10: 'آخري' }

/** Count-up stopwatch for timed holds; writes elapsed seconds into the row. */
function useStopwatch(onStop: (sec: number) => void) {
  const [startAt, setStartAt] = useState<number>()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!startAt) return
    const t = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(t)
  }, [startAt])
  const elapsed = startAt ? Math.floor((now - startAt) / 1000) : 0
  const toggle = () => {
    if (startAt) {
      onStop(elapsed)
      setStartAt(undefined)
    } else {
      setNow(Date.now())
      setStartAt(Date.now())
    }
  }
  return { running: !!startAt, elapsed, toggle }
}

export function SetRow({ exercise: e, index, sideLabel, log, done, prefill, onDone, onUndo, onChange, rpe, onRpe }: Props) {
  const [pickRpe, setPickRpe] = useState(false)
  const [draft, setDraft] = useState<RowValues>()
  const shown: RowValues = draft ?? log ?? prefill
  const showWeight = e.increment > 0
  const set = (v: RowValues) => {
    setDraft(v)
    if (done) onChange(v)
  }
  const sw = useStopwatch((sec) => set({ ...shown, value: sec }))

  const showRpePicker = done && onRpe && (rpe === undefined || pickRpe)
  return (
    <div className={`rounded-xl ${done ? 'bg-accent/10' : 'bg-white/50'}`}>
    <div className="flex items-center gap-2 px-2 py-1.5" data-testid="set-row">
      <span className="w-6 text-center text-sm font-bold text-muted">{index + 1}</span>
      {sideLabel && <span className="w-9 text-xs text-muted">{sideLabel}</span>}
      {showWeight && (
        <>
          <NumberInput ariaLabel="الوزن" value={shown.weight} onChange={(w) => set({ ...shown, weight: w })} placeholder="كجم" className="min-w-0 flex-1 py-2" />
          <span className="text-xs text-muted">×</span>
        </>
      )}
      <div className="relative min-w-0 flex-1">
        <NumberInput
          ariaLabel={UNIT[e.metric]}
          step={e.metric === 'cardio' ? 'any' : '1'}
          value={sw.running ? sw.elapsed : shown.value}
          onChange={(v) => set({ ...shown, value: v })}
          placeholder={UNIT[e.metric]}
          className="py-2"
        />
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted">{UNIT[e.metric]}</span>
      </div>
      {e.metric === 'time' && !done && (
        <button type="button" aria-label="ساعة إيقاف" onClick={sw.toggle} className={`rounded-lg p-2 ${sw.running ? 'bg-warn text-onaccent' : 'bg-white/60 text-muted'}`}>
          <Icon.timer />
        </button>
      )}
      <button
        type="button"
        aria-label={done ? 'إلغاء المجموعة' : 'تمت المجموعة'}
        onClick={() => {
          if (done) {
            setDraft(undefined)
            onUndo()
          } else onDone(shown)
        }}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${done ? 'bg-accent text-onaccent' : 'border border-line text-muted'}`}
      >
        <Icon.check />
      </button>
      {done && onRpe && rpe !== undefined && !pickRpe && (
        <button type="button" onClick={() => setPickRpe(true)} className="rounded-lg bg-white/80 px-1.5 py-1 text-[10px] font-semibold text-muted" aria-label={`المجهود ${rpe}`}>RPE {rpe}</button>
      )}
    </div>
    {showRpePicker && (
      <div className="flex items-center gap-1 px-2 pb-2" role="radiogroup" aria-label="المجهود (RPE)">
        <span className="ml-1 text-[11px] text-muted">المجهود:</span>
        {RPE_VALUES.map((v) => (
          <button
            key={v} type="button" role="radio" aria-checked={rpe === v} aria-label={`RPE ${v}`} title={RPE_HINT[v]}
            onClick={() => { onRpe!(v); setPickRpe(false) }}
            className={`h-8 flex-1 rounded-lg text-xs font-semibold ${rpe === v ? 'bg-accent text-white' : 'bg-white/80 text-muted'}`}
          >{v}</button>
        ))}
      </div>
    )}
    </div>
  )
}
