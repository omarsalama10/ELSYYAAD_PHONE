import { useRef, useState } from 'react'
import { minuteOfDay } from '../domain/time'
import { fmtTime, fmtTimeRange } from './format'
import type { DayKey, PlanBlock } from '../domain/types'
import type { BlockState } from '../state'
import { LI } from './icons'

const PX = 1.15 // pixels per minute
const SNAP = 15

const STYLE: Record<BlockState, string> = {
  commitment: 'bg-ink/[0.06] border-ink/10 text-ink/70',
  done: 'bg-accent/10 border-accent/25 text-muted line-through',
  running: 'bg-accent2/15 border-accent2/50 text-ink ring-2 ring-accent2/40',
  now: 'bg-accent/15 border-accent/50 text-ink',
  missed: 'bg-danger/[0.07] border-danger/30 text-ink',
  upcoming: 'bg-white/75 border-white text-ink',
}

/** Lays overlapping blocks side by side (greedy lanes). */
function lanes(blocks: PlanBlock[]): Map<string, { lane: number; of: number }> {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
  const out = new Map<string, { lane: number; of: number }>()
  let group: PlanBlock[] = []
  let groupEnd = -1
  const flush = () => {
    const ends: number[] = []
    const assigned: [PlanBlock, number][] = []
    for (const b of group) {
      let lane = ends.findIndex((e) => e <= b.startMin)
      if (lane < 0) { lane = ends.length; ends.push(b.endMin) } else ends[lane] = b.endMin
      assigned.push([b, lane])
    }
    for (const [b, lane] of assigned) out.set(b.id, { lane, of: ends.length })
    group = []
  }
  for (const b of sorted) {
    if (b.startMin >= groupEnd && group.length) flush()
    group.push(b)
    groupEnd = Math.max(groupEnd, b.endMin)
  }
  if (group.length) flush()
  return out
}

/**
 * Scaled day timeline. Task blocks have a drag handle: drag vertically to move the
 * block (snaps to 15 minutes); the caller pins the task to the new time.
 */
export function DayTimeline({ day, blocks, stateOf, startMin, endMin, now, isToday, onTap, onMove }: {
  day: DayKey
  blocks: PlanBlock[]
  stateOf: (b: PlanBlock) => BlockState
  startMin: number
  endMin: number
  now: number
  isToday: boolean
  onTap: (b: PlanBlock) => void
  onMove?: (b: PlanBlock, startMin: number) => void
}) {
  const from = Math.max(0, Math.floor(Math.min(startMin, ...blocks.map((b) => b.startMin)) / 60) * 60)
  const to = Math.min(1440, Math.ceil(Math.max(endMin, ...blocks.map((b) => b.endMin)) / 60) * 60)
  const height = (to - from) * PX
  const lane = lanes(blocks)
  const [drag, setDrag] = useState<{ id: string; dy: number } | null>(null)
  const startY = useRef(0)
  const nowMin = minuteOfDay(now)

  const hours: number[] = []
  for (let h = from; h <= to; h += 60) hours.push(h)

  return (
    <div className="glass relative overflow-hidden p-0" data-testid={`timeline-${day}`}>
      <div className="relative" style={{ height }}>
        {hours.map((h) => (
          <div key={h} className="absolute inset-x-0 flex items-start" style={{ top: (h - from) * PX }}>
            <span className="ltr w-12 shrink-0 -translate-y-1/2 pr-2 text-left text-[10px] text-muted num">{h < 1440 ? fmtTime(h, true) : ''}</span>
            <div className="h-px flex-1 bg-ink/[0.06]" />
          </div>
        ))}
        {isToday && nowMin >= from && nowMin <= to && (
          <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: (nowMin - from) * PX }} aria-hidden>
            <span className="mr-10 h-2 w-2 rounded-full bg-danger" />
            <div className="h-0.5 flex-1 bg-danger/70" />
          </div>
        )}
        <div className="absolute inset-y-0 left-2 right-14">
          {blocks.map((b) => {
            const st = stateOf(b)
            const l = lane.get(b.id) ?? { lane: 0, of: 1 }
            const dy = drag?.id === b.id ? drag.dy : 0
            const top = (b.startMin - from) * PX + dy
            const h = Math.max(22, (b.endMin - b.startMin) * PX - 2)
            const movable = !!onMove && b.kind !== 'commitment' && st !== 'done'
            const previewStart = Math.round((b.startMin + dy / PX) / SNAP) * SNAP
            return (
              <div
                key={b.id}
                className={`absolute overflow-hidden rounded-2xl border px-2.5 py-1 text-right shadow-sm backdrop-blur ${STYLE[st]} ${drag?.id === b.id ? 'z-30 opacity-90 shadow-glass' : 'z-10'}`}
                style={{ top, height: h, right: `${(l.lane / l.of) * 100}%`, width: `calc(${100 / l.of}% - 4px)` }}
              >
                <button type="button" className="block h-full w-full text-right" onClick={() => onTap(b)} aria-label={`${b.title} ${fmtTime(b.startMin)}`}>
                  <div className="flex items-center gap-1 text-[13px] font-semibold leading-tight">
                    {b.kind === 'commitment' && LI.lock('h-3 w-3 shrink-0')}
                    {b.kind === 'pinned' && LI.clock('h-3 w-3 shrink-0')}
                    <span className="truncate">{b.title}</span>
                  </div>
                  {h > 34 && (
                    <div className="ltr text-right text-[10.5px] text-muted num">
                      {fmtTimeRange(drag?.id === b.id ? previewStart : b.startMin, (drag?.id === b.id ? previewStart : b.startMin) + b.endMin - b.startMin)}
                      {b.parts && b.parts > 1 ? ` · ${b.part}/${b.parts}` : ''}
                      {b.confidence === 'rough' ? ' · ~' : ''}
                    </div>
                  )}
                </button>
                {movable && (
                  <span
                    role="slider"
                    aria-label={`اسحب لنقل ${b.title}`}
                    aria-valuenow={b.startMin}
                    tabIndex={0}
                    className="absolute left-0 top-0 flex h-full w-8 cursor-grab touch-none items-center justify-center text-muted"
                    onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); startY.current = e.clientY; setDrag({ id: b.id, dy: 0 }) }}
                    onPointerMove={(e) => { if (drag?.id === b.id) setDrag({ id: b.id, dy: e.clientY - startY.current }) }}
                    onPointerUp={() => {
                      if (drag?.id !== b.id) return
                      const next = Math.max(0, Math.min(1440 - (b.endMin - b.startMin), previewStart))
                      setDrag(null)
                      if (next !== b.startMin) onMove!(b, next)
                    }}
                    onPointerCancel={() => setDrag(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp') { e.preventDefault(); onMove!(b, Math.max(0, b.startMin - SNAP)) }
                      if (e.key === 'ArrowDown') { e.preventDefault(); onMove!(b, Math.min(1440 - (b.endMin - b.startMin), b.startMin + SNAP)) }
                    }}
                  >
                    {LI.move('h-4 w-4')}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
