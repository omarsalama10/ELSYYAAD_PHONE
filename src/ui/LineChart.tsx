import { useId, useMemo, useRef, useState } from 'react'
import type { Point } from '../domain/stats'
import { fmtDate, fmtNum } from '../lib/format'

/**
 * Validated on the white glass surface: lightness band, chroma, CVD ΔE 17.8, contrast ≥ 3:1.
 * Two-series charts are always left (teal) vs right (violet); single series uses coral.
 */
export const SERIES_COLORS = ['#1f8f76', '#7c5cd6'] as const
export const SINGLE_COLOR = '#e2654f'

export interface Series { name: string; points: Point[] }

const W = 340
const H = 170
const PAD = { top: 22, right: 14, bottom: 22, left: 8 }
const GRID = 'rgba(24,37,46,0.08)'
const AXIS_TEXT = '#687884'

function niceTicks(min: number, max: number, count = 3): number[] {
  if (min === max) return [min]
  const step = (max - min) / (count - 1)
  return Array.from({ length: count }, (_, i) => min + step * i)
}

/** Catmull-Rom → cubic Bézier, clamped so the curve never overshoots between points. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return ''
  if (pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  let d = `M${pts[0]!.x.toFixed(1)},${pts[0]!.y.toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[i + 2] ?? p2
    const t = 0.18
    const lo = Math.min(p1.y, p2.y), hi = Math.max(p1.y, p2.y)
    const c1y = Math.min(Math.max(p1.y + (p2.y - p0.y) * t, lo), hi)
    const c2y = Math.min(Math.max(p2.y - (p3.y - p1.y) * t, lo), hi)
    const c1x = p1.x + (p2.x - p0.x) * t
    const c2x = p2.x - (p3.x - p1.x) * t
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
  }
  return d
}

export function LineChart({ series, unit = '', title, subtitle }: { series: Series[]; unit?: string; title: string; subtitle?: string }) {
  const gradId = useId().replace(/:/g, '')
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverX, setHoverX] = useState<number>()
  const all = series.flatMap((s) => s.points)
  const single = series.length === 1

  const geo = useMemo(() => {
    if (all.length === 0) return undefined
    const xs = all.map((p) => p.x)
    const ys = all.map((p) => p.y)
    const x0 = Math.min(...xs), x1 = Math.max(...xs)
    let y0 = Math.min(...ys), y1 = Math.max(...ys)
    const padY = (y1 - y0) * 0.18 || Math.max(1, Math.abs(y1) * 0.05)
    y0 -= padY
    y1 += padY
    const sx = (x: number) => (x1 === x0 ? (PAD.left + W - PAD.right) / 2 : PAD.left + ((x - x0) / (x1 - x0)) * (W - PAD.left - PAD.right))
    const sy = (y: number) => PAD.top + (1 - (y - y0) / (y1 - y0)) * (H - PAD.top - PAD.bottom)
    return { x0, x1, y0, y1, sx, sy, xs: [...new Set(xs)].sort((a, b) => a - b) }
  }, [all])

  const header = (
    <figcaption className="mb-2 flex items-start justify-between gap-2">
      <span>
        <span className="block text-[15px] font-semibold">{title}</span>
        {subtitle && <span className="block text-xs text-muted">{subtitle}</span>}
      </span>
      {series.length > 1 && (
        <span className="flex gap-3 pt-1 text-xs text-muted">
          {series.map((s, i) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SERIES_COLORS[i] }} />
              {s.name}
            </span>
          ))}
        </span>
      )}
    </figcaption>
  )

  if (!geo)
    return (
      <figure className="glass p-4">
        {header}
        <div className="flex h-24 items-center justify-center text-sm text-muted">مفيش بيانات لسه</div>
      </figure>
    )

  const { sx, sy } = geo
  const nearestX = (clientX: number) => {
    const svg = svgRef.current
    if (!svg) return undefined
    const r = svg.getBoundingClientRect()
    const vx = ((clientX - r.left) / r.width) * W
    let best = geo.xs[0]!
    for (const x of geo.xs) if (Math.abs(sx(x) - vx) < Math.abs(sx(best) - vx)) best = x
    return best
  }
  const hovered = hoverX !== undefined ? series.map((s) => ({ s, p: s.points.find((p) => p.x === hoverX) })) : []
  const baseY = H - PAD.bottom

  return (
    <figure className="glass p-4" data-testid="chart">
      {header}
      <div className="relative ltr">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none select-none overflow-visible"
          role="img"
          aria-label={title}
          onPointerMove={(e) => setHoverX(nearestX(e.clientX))}
          onPointerDown={(e) => setHoverX(nearestX(e.clientX))}
          onPointerLeave={() => setHoverX(undefined)}
        >
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={SINGLE_COLOR} stopOpacity={0.28} />
              <stop offset="100%" stopColor={SINGLE_COLOR} stopOpacity={0} />
            </linearGradient>
          </defs>
          {niceTicks(geo.y0, geo.y1).map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={sy(t)} y2={sy(t)} stroke={GRID} strokeWidth={1} strokeDasharray="2 4" />
              <text x={PAD.left} y={sy(t) - 4} fontSize={10} fill={AXIS_TEXT}>{fmtNum(t)}</text>
            </g>
          ))}
          <text x={PAD.left} y={H - 5} fontSize={10} fill={AXIS_TEXT}>{fmtDate(geo.x0)}</text>
          {geo.x1 !== geo.x0 && <text x={W - PAD.right} y={H - 5} fontSize={10} fill={AXIS_TEXT} textAnchor="end">{fmtDate(geo.x1)}</text>}
          {hoverX !== undefined && <line x1={sx(hoverX)} x2={sx(hoverX)} y1={PAD.top - 6} y2={baseY} stroke={AXIS_TEXT} strokeOpacity={0.5} strokeDasharray="3 3" />}
          {series.map((s, i) => {
            const pts = [...s.points].sort((a, b) => a.x - b.x)
            const color = single ? SINGLE_COLOR : SERIES_COLORS[i % SERIES_COLORS.length]!
            const xy = pts.map((p) => ({ x: sx(p.x), y: sy(p.y) }))
            const line = smoothPath(xy)
            const lastP = pts.at(-1)
            return (
              <g key={s.name}>
                {single && xy.length > 1 && (
                  <path d={`${line} L${xy.at(-1)!.x.toFixed(1)},${baseY} L${xy[0]!.x.toFixed(1)},${baseY} Z`} fill={`url(#${gradId})`} />
                )}
                <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                {pts.map((p) => (
                  <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r={p.x === hoverX ? 5.5 : 4} fill={color} stroke="#ffffff" strokeWidth={2} />
                ))}
                {lastP && hoverX === undefined && (
                  <text x={sx(lastP.x)} y={sy(lastP.y) - 10} fontSize={11} fill="#18252e" textAnchor={pts.length > 1 ? 'end' : 'middle'} fontWeight={700}>{fmtNum(lastP.y)}</text>
                )}
              </g>
            )
          })}
        </svg>
        {hoverX !== undefined && (
          <div className="pointer-events-none absolute left-2 top-0 rounded-xl bg-ink px-2.5 py-1.5 text-xs text-white shadow-glass" dir="rtl">
            <div className="opacity-70">{fmtDate(hoverX)}</div>
            {hovered.map(({ s, p }) => p && (
              <div key={s.name}>{series.length > 1 ? `${s.name}: ` : ''}<b>{fmtNum(p.y)}</b> {unit}</div>
            ))}
          </div>
        )}
      </div>
    </figure>
  )
}
