import { useMemo, useRef, useState } from 'react'
import type { Point } from '../domain/stats'
import { fmtDate, fmtNum } from '../lib/format'

/** Validated for the dark surface #141a22 (lightness band, CVD ΔE ≥ 24, contrast ≥ 3:1). */
export const SERIES_COLORS = ['#2f8fd8', '#d06f10'] as const

export interface Series { name: string; points: Point[] }

const W = 340
const H = 170
const PAD = { top: 18, right: 14, bottom: 22, left: 8 }

function niceTicks(min: number, max: number, count = 3): number[] {
  if (min === max) return [min]
  const step = (max - min) / (count - 1)
  return Array.from({ length: count }, (_, i) => min + step * i)
}

export function LineChart({ series, unit = '', title }: { series: Series[]; unit?: string; title: string }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverX, setHoverX] = useState<number>()
  const all = series.flatMap((s) => s.points)

  const geo = useMemo(() => {
    if (all.length === 0) return undefined
    const xs = all.map((p) => p.x)
    const ys = all.map((p) => p.y)
    const x0 = Math.min(...xs), x1 = Math.max(...xs)
    let y0 = Math.min(...ys), y1 = Math.max(...ys)
    const padY = (y1 - y0) * 0.15 || Math.max(1, Math.abs(y1) * 0.05)
    y0 -= padY
    y1 += padY
    const sx = (x: number) => (x1 === x0 ? (PAD.left + W - PAD.right) / 2 : PAD.left + ((x - x0) / (x1 - x0)) * (W - PAD.left - PAD.right))
    const sy = (y: number) => PAD.top + (1 - (y - y0) / (y1 - y0)) * (H - PAD.top - PAD.bottom)
    return { x0, x1, y0, y1, sx, sy, xs: [...new Set(xs)].sort((a, b) => a - b) }
  }, [all])

  if (!geo || all.length === 0)
    return (
      <figure className="rounded-2xl border border-line bg-surface p-3">
        <figcaption className="mb-2 text-sm font-bold">{title}</figcaption>
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

  return (
    <figure className="rounded-2xl border border-line bg-surface p-3" data-testid="chart">
      <figcaption className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-bold">{title}</span>
        {series.length > 1 && (
          <span className="flex gap-3 text-xs text-muted">
            {series.map((s, i) => (
              <span key={s.name} className="flex items-center gap-1">
                <span className="inline-block h-2 w-3 rounded-sm" style={{ background: SERIES_COLORS[i] }} />
                {s.name}
              </span>
            ))}
          </span>
        )}
      </figcaption>
      <div className="relative ltr">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none select-none"
          role="img"
          aria-label={title}
          onPointerMove={(e) => setHoverX(nearestX(e.clientX))}
          onPointerDown={(e) => setHoverX(nearestX(e.clientX))}
          onPointerLeave={() => setHoverX(undefined)}
        >
          {niceTicks(geo.y0, geo.y1).map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={sy(t)} y2={sy(t)} stroke="#2a3442" strokeWidth={1} />
              <text x={PAD.left} y={sy(t) - 3} fontSize={10} fill="#8b98a9">{fmtNum(t)}</text>
            </g>
          ))}
          <text x={PAD.left} y={H - 6} fontSize={10} fill="#8b98a9">{fmtDate(geo.x0)}</text>
          {geo.x1 !== geo.x0 && <text x={W - PAD.right} y={H - 6} fontSize={10} fill="#8b98a9" textAnchor="end">{fmtDate(geo.x1)}</text>}
          {hoverX !== undefined && <line x1={sx(hoverX)} x2={sx(hoverX)} y1={PAD.top} y2={H - PAD.bottom} stroke="#8b98a9" strokeDasharray="3 3" />}
          {series.map((s, i) => {
            const pts = [...s.points].sort((a, b) => a.x - b.x)
            const color = SERIES_COLORS[i % SERIES_COLORS.length]
            const d = pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')
            const lastP = pts.at(-1)
            return (
              <g key={s.name}>
                <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {pts.map((p) => (
                  <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r={p.x === hoverX ? 5 : 3.5} fill={color} stroke="#141a22" strokeWidth={2} />
                ))}
                {lastP && hoverX === undefined && (
                  <text x={sx(lastP.x)} y={sy(lastP.y) - 8} fontSize={11} fill="#e8edf3" textAnchor={pts.length > 1 ? 'end' : 'middle'} fontWeight="bold">{fmtNum(lastP.y)}</text>
                )}
              </g>
            )
          })}
        </svg>
        {hoverX !== undefined && (
          <div className="pointer-events-none absolute left-2 top-0 rounded-lg border border-line bg-bg/95 px-2 py-1 text-xs text-ink" dir="rtl">
            <div className="text-muted">{fmtDate(hoverX)}</div>
            {hovered.map(({ s, p }) => p && (
              <div key={s.name}>{series.length > 1 ? `${s.name}: ` : ''}<b>{fmtNum(p.y)}</b> {unit}</div>
            ))}
          </div>
        )}
      </div>
    </figure>
  )
}
