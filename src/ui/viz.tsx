import type { ReactNode } from 'react'

/** Single-value progress ring (0–1). Text lives in the center, never in the ring color. */
export function ProgressRing({ value, size = 112, stroke = 11, color = '#1f8f76', children, label }: {
  value: number
  size?: number
  stroke?: number
  color?: string
  children?: ReactNode
  label: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(31,143,118,0.12)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

/** Concentric rings for up to three goals; each ring paired with a labeled legend row by the caller. */
export function Rings({ rings, size = 120 }: { rings: { value: number; color: string }[]; size?: number }) {
  const stroke = 10
  const gap = 4
  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0" aria-hidden>
      {rings.map((ring, i) => {
        const r = size / 2 - stroke / 2 - i * (stroke + gap)
        const c = 2 * Math.PI * r
        const v = Math.max(0, Math.min(1, ring.value))
        return (
          <g key={i}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ring.color} strokeOpacity={0.14} strokeWidth={stroke} />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ring.color} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(.2,.8,.2,1)' }} />
          </g>
        )
      })}
    </svg>
  )
}

/** Seven vertical pill bars; the highlighted day is solid, others are soft. */
export function WeekBars({ values, labels, highlight, unit }: { values: number[]; labels: string[]; highlight: number; unit: string }) {
  const max = Math.max(1, ...values)
  return (
    <div className="flex h-36 items-end justify-between gap-2" role="img" aria-label={`نشاط الأسبوع: ${values.map((v, i) => `${labels[i]} ${v} ${unit}`).join('، ')}`}>
      {values.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-2">
          <div className="relative flex h-28 w-full max-w-[22px] items-end">
            {i === highlight && v > 0 && (
              <span className="absolute -top-6 left-1/2 -translate-x-1/2 rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-white num">{v}</span>
            )}
            <div
              className={`w-full rounded-full transition-[height] duration-700 ${i === highlight ? 'bg-accent shadow-lift' : v > 0 ? 'bg-accent/35' : 'bg-ink/[0.07]'}`}
              style={{ height: `${Math.max(14, (v / max) * 100)}%` }}
            />
          </div>
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${i === highlight ? 'bg-accent font-semibold text-white' : 'text-muted'}`}>{labels[i]}</span>
        </div>
      ))}
    </div>
  )
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-2xl border border-white/80 bg-white/50 p-1 backdrop-blur" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-xl py-2 text-sm transition ${o.value === value ? 'bg-accent font-semibold text-white shadow-lift' : 'text-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Soft rounded icon well used in tiles and list rows. */
export function IconWell({ children, tone = 'accent' }: { children: ReactNode; tone?: 'accent' | 'coral' | 'violet' | 'amber' }) {
  const c = { accent: 'bg-accent/15 text-accent', coral: 'bg-accent2/15 text-accent2', violet: 'bg-[#7c5cd6]/15 text-[#7c5cd6]', amber: 'bg-warn/15 text-warn' }[tone]
  return <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${c}`}>{children}</span>
}
