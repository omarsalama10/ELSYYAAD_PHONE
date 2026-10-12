import { useState } from 'react'
import { MUSCLE_AR } from '../data/catalog'

/** Single-hue sequential scale (teal), light → dark with weekly sets. */
const STEPS = [
  { min: 15, color: '#156b57', label: '15+' },
  { min: 10, color: '#1f8f76', label: '10-14' },
  { min: 6, color: '#5dbca0', label: '6-9' },
  { min: 1, color: '#a8dccb', label: '1-5' },
  { min: 0, color: 'rgba(24,37,46,0.08)', label: '0' },
]
const colorFor = (v: number) => STEPS.find((s) => v >= s.min)!.color

type Shape = { muscle: string; d?: string; ellipse?: [number, number, number, number]; rect?: [number, number, number, number, number] }

// Stylized silhouettes, viewBox 0 0 120 250. Mirrored pairs share a muscle key.
const FRONT: Shape[] = [
  { muscle: 'neck', rect: [52, 30, 16, 10, 4] },
  { muscle: 'shoulders', ellipse: [36, 50, 11, 9] }, { muscle: 'shoulders', ellipse: [84, 50, 11, 9] },
  { muscle: 'chest', rect: [44, 44, 15, 20, 6] }, { muscle: 'chest', rect: [61, 44, 15, 20, 6] },
  { muscle: 'biceps', ellipse: [30, 72, 6, 13] }, { muscle: 'biceps', ellipse: [90, 72, 6, 13] },
  { muscle: 'forearms', ellipse: [26, 102, 5, 14] }, { muscle: 'forearms', ellipse: [94, 102, 5, 14] },
  { muscle: 'abdominals', rect: [49, 67, 22, 40, 6] },
  { muscle: 'adductors', d: 'M54 120 L60 120 L60 152 L55 150 Z' }, { muscle: 'adductors', d: 'M66 120 L60 120 L60 152 L65 150 Z' },
  { muscle: 'quadriceps', ellipse: [48, 140, 9, 25] }, { muscle: 'quadriceps', ellipse: [72, 140, 9, 25] },
  { muscle: 'calves', ellipse: [48, 196, 6, 19] }, { muscle: 'calves', ellipse: [72, 196, 6, 19] },
]
const BACK: Shape[] = [
  { muscle: 'traps', d: 'M48 34 L72 34 L80 48 L60 58 L40 48 Z' },
  { muscle: 'shoulders', ellipse: [35, 50, 10, 8] }, { muscle: 'shoulders', ellipse: [85, 50, 10, 8] },
  { muscle: 'lats', d: 'M42 58 L52 62 L54 92 L44 86 Z' }, { muscle: 'lats', d: 'M78 58 L68 62 L66 92 L76 86 Z' },
  { muscle: 'middle back', rect: [54, 58, 12, 24, 4] },
  { muscle: 'lower back', rect: [50, 86, 20, 18, 5] },
  { muscle: 'triceps', ellipse: [30, 72, 6, 13] }, { muscle: 'triceps', ellipse: [90, 72, 6, 13] },
  { muscle: 'forearms', ellipse: [26, 102, 5, 14] }, { muscle: 'forearms', ellipse: [94, 102, 5, 14] },
  { muscle: 'glutes', ellipse: [51, 116, 10, 10] }, { muscle: 'glutes', ellipse: [69, 116, 10, 10] },
  { muscle: 'hamstrings', ellipse: [48, 150, 9, 22] }, { muscle: 'hamstrings', ellipse: [72, 150, 9, 22] },
  { muscle: 'calves', ellipse: [48, 198, 7, 18] }, { muscle: 'calves', ellipse: [72, 198, 7, 18] },
]

function Silhouette() {
  return (
    <g fill="rgba(255,255,255,0.75)" stroke="rgba(24,37,46,0.12)" strokeWidth={1}>
      <circle cx={60} cy={16} r={12} />
      <path d="M40 40 Q60 30 80 40 L96 56 L100 118 L92 120 L86 66 L80 110 L84 232 L66 234 L60 150 L54 234 L36 232 L40 110 L34 66 L28 120 L20 118 L24 56 Z" />
    </g>
  )
}

function Figure({ shapes, sets, onPick, picked, label }: { shapes: Shape[]; sets: Record<string, number>; onPick: (m: string) => void; picked?: string; label: string }) {
  return (
    <figure className="flex-1 text-center">
      <svg viewBox="0 0 120 250" className="mx-auto h-64 w-auto" role="img" aria-label={label}>
        <Silhouette />
        {shapes.map((s, i) => {
          const fill = colorFor(sets[s.muscle] ?? 0)
          const common = {
            fill,
            stroke: picked === s.muscle ? '#18252e' : '#ffffff',
            strokeWidth: picked === s.muscle ? 1.5 : 1,
            onClick: () => onPick(s.muscle),
            className: 'cursor-pointer transition-[fill] duration-500',
          }
          if (s.ellipse) return <ellipse key={i} cx={s.ellipse[0]} cy={s.ellipse[1]} rx={s.ellipse[2]} ry={s.ellipse[3]} {...common} />
          if (s.rect) return <rect key={i} x={s.rect[0]} y={s.rect[1]} width={s.rect[2]} height={s.rect[3]} rx={s.rect[4]} {...common} />
          return <path key={i} d={s.d} {...common} />
        })}
      </svg>
      <figcaption className="text-xs text-muted">{label}</figcaption>
    </figure>
  )
}

/** Front/back body shaded by weekly sets per muscle; tap a region to read its number. */
export function MuscleMap({ sets }: { sets: Record<string, number> }) {
  const [picked, setPicked] = useState<string>()
  return (
    <div>
      <div className="flex gap-2 ltr">
        <Figure shapes={FRONT} sets={sets} onPick={setPicked} picked={picked} label="أمام" />
        <Figure shapes={BACK} sets={sets} onPick={setPicked} picked={picked} label="خلف" />
      </div>
      <div className="mt-2 min-h-6 text-center text-sm" aria-live="polite">
        {picked ? <span><b>{MUSCLE_AR[picked] ?? picked}</b>: {sets[picked] ?? 0} مجموعة الأسبوع ده</span> : <span className="text-xs text-muted">دوس على أي عضلة تعرف عدد مجموعاتها</span>}
      </div>
      <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-muted ltr" aria-label="مفتاح الألوان">
        {[...STEPS].reverse().map((s) => (
          <span key={s.label} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded" style={{ background: s.color }} />{s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
