import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { completedSessions, exerciseHistory, getActiveProgram } from '../db/repo'
import { asymmetryPct, bestPerSession, sideTotals, weeklySetsByMuscle } from '../domain/stats'
import type { Section, SetLog } from '../domain/types'
import { MUSCLE_AR } from '../data/catalog'
import { fmtNum, UNIT, weekStart } from '../lib/format'
import { useExercises } from '../lib/hooks'
import { LineChart, SERIES_COLORS, SINGLE_COLOR } from '../ui/LineChart'
import { Card, Empty, PageTitle } from '../ui/primitives'
import { Rings, Segmented } from '../ui/viz'

const DAY = 86_400_000
const WEEK = 7 * DAY
const COUNTED: Section[] = ['main', 'finisher']
type Range = 'week' | 'month' | 'all'
const RANGES: { value: Range; label: string }[] = [
  { value: 'week', label: 'الأسبوع' },
  { value: 'month', label: 'الشهر' },
  { value: 'all', label: 'الكل' },
]
/** Weekly goals the rings measure against (scaled by the number of weeks in range). */
const GOAL = { sessions: 3, sets: 75, cardio: 60 }

function rangeStart(r: Range, now: number, first: number): number {
  if (r === 'week') return weekStart(now)
  if (r === 'month') return now - 30 * DAY
  return first
}

export function ProgressScreen() {
  const exercises = useExercises()
  const program = useLiveQuery(() => getActiveProgram(), [])
  const sessions = useLiveQuery(() => completedSessions(), [])
  const sets = useLiveQuery(() => db.sets.toArray(), [])
  const [range, setRange] = useState<Range>('week')
  const trained = [...new Set((sets ?? []).map((s) => s.exerciseId))]
  const [picked, setPicked] = useState<string>()
  const exerciseId = picked ?? trained.find((id) => exercises?.get(id)?.metric === 'reps' && exercises.get(id)?.increment) ?? trained[0]
  const history = useLiveQuery(() => (exerciseId ? exerciseHistory(exerciseId, 100) : Promise.resolve([])), [exerciseId])

  if (!exercises || !program || !sessions || !sets) return null
  if (sessions.length === 0)
    return (
      <div className="space-y-4">
        <PageTitle>التقدم</PageTitle>
        <Empty>خلّص أول تمرين وهتلاقي هنا رسوم التقدم وحجم التمرين لكل عضلة.</Empty>
      </div>
    )

  const now = Date.now()
  const from = rangeStart(range, now, sessions[0]!.startedAt)
  const weeks = range === 'week' ? 1 : Math.max(1, (now - from) / WEEK)
  const sectionOf = new Map(program.days.flatMap((d) => d.blocks.map((b) => [b.id, b.section] as const)))
  const inRange = sessions.filter((s) => s.startedAt >= from)
  const ids = new Set(inRange.map((s) => s.id))
  const rangeSets = sets.filter((s) => s.done && ids.has(s.sessionId))
  const counted = rangeSets.filter((s) => COUNTED.includes(sectionOf.get(s.blockId) ?? 'main') && s.side !== 'R')
  const cardio = rangeSets.filter((s) => exercises.get(s.exerciseId)?.metric === 'cardio').reduce((a, s) => a + (s.seconds ?? 0) / 60, 0)
  const volumeOf = (list: SetLog[]) => list.reduce((a, s) => a + (s.weight && s.reps ? s.weight * s.reps : 0), 0)
  const bySession = new Map<string, SetLog[]>()
  for (const s of rangeSets) bySession.set(s.sessionId, [...(bySession.get(s.sessionId) ?? []), s])
  const volumePoints = inRange.map((s) => ({ x: s.startedAt, y: Math.round(volumeOf(bySession.get(s.id) ?? [])) }))
  const totalVolume = volumePoints.reduce((a, p) => a + p.y, 0)

  const rings = [
    { label: 'التمارين', value: inRange.length, goal: Math.round(GOAL.sessions * weeks), color: '#1f8f76', unit: '' },
    { label: 'المجموعات', value: counted.length, goal: Math.round(GOAL.sets * weeks), color: SINGLE_COLOR, unit: '' },
    { label: 'كارديو', value: Math.round(cardio), goal: Math.round(GOAL.cardio * weeks), color: SERIES_COLORS[1], unit: 'د' },
  ]

  const thisWeekStart = weekStart(now)
  const finished = new Set(sessions.map((s) => s.id))
  const startedAt = new Map(sessions.map((s) => [s.id, s.startedAt]))
  const allCounted = sets.filter((s) => s.done && finished.has(s.sessionId) && COUNTED.includes(sectionOf.get(s.blockId) ?? 'main'))
  const between = (a: number, b: number) => allCounted.filter((s) => { const t = startedAt.get(s.sessionId) ?? 0; return t >= a && t < b })
  const thisWeek = weeklySetsByMuscle(between(thisWeekStart, Infinity), exercises)
  const lastWeek = weeklySetsByMuscle(between(thisWeekStart - WEEK, thisWeekStart), exercises)
  const muscles = Object.keys(MUSCLE_AR).filter((m) => thisWeek[m] || lastWeek[m])
  const maxMuscle = Math.max(1, ...muscles.map((m) => Math.max(thisWeek[m] ?? 0, lastWeek[m] ?? 0)), 20)

  const ex = exerciseId ? exercises.get(exerciseId) : undefined
  const chrono = [...(history ?? [])].reverse()
  const loaded = ex?.metric === 'reps' && chrono.some((h) => h.sets.some((s) => s.weight))
  const unilateral = trained.map((id) => exercises.get(id)).filter((e) => e?.unilateral)

  return (
    <div className="space-y-4">
      <PageTitle>التقدم</PageTitle>
      <Segmented options={RANGES} value={range} onChange={setRange} />

      <LineChart
        title={`حجم التمرين: ${totalVolume >= 1000 ? `${fmtNum(totalVolume / 1000)} طن` : `${totalVolume} كجم`}`}
        subtitle="مجموع (الوزن × العدات) في كل تمرين"
        unit="كجم"
        series={[{ name: 'الحجم', points: volumePoints }]}
      />

      <section className="glass flex items-center gap-5 p-5" aria-label="الأهداف">
        <Rings rings={rings.map((r) => ({ value: r.goal ? r.value / r.goal : 0, color: r.color }))} />
        <ul className="flex-1 space-y-3 text-sm">
          {rings.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-muted"><span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />{r.label}</span>
              <span className="num"><b>{r.value}</b><span className="text-muted"> / {r.goal}{r.unit ? ` ${r.unit}` : ''}</span></span>
            </li>
          ))}
        </ul>
      </section>

      {ex && (
        <div className="space-y-2">
          <select className="glass-strong w-full rounded-2xl" value={exerciseId} onChange={(e) => setPicked(e.target.value)} aria-label="اختار تمرين">
            {trained.map((id) => <option key={id} value={id}>{exercises.get(id)?.nameAr ?? id}</option>)}
          </select>
          <LineChart
            title={loaded ? `${ex.nameAr} — أقصى قوة تقديرية` : `${ex.nameAr} — أفضل أداء`}
            unit={loaded ? 'كجم' : UNIT[ex.metric]}
            series={ex.unilateral
              ? (['L', 'R'] as const).map((side) => ({ name: side === 'L' ? 'شمال' : 'يمين', points: bestPerSession(ex, chrono.map((h) => ({ at: h.session.startedAt, sets: h.sets.filter((s) => s.side === side) }))) }))
              : [{ name: ex.nameAr, points: bestPerSession(ex, chrono.map((h) => ({ at: h.session.startedAt, sets: h.sets }))) }]}
          />
          <Link to={`/exercises/${encodeURIComponent(ex.id)}`} className="block px-1 text-sm text-accent">السجل الكامل ←</Link>
        </div>
      )}

      {unilateral.length > 0 && (
        <Card>
          <h2 className="mb-3 text-[15px] font-semibold">شمال مقابل يمين (آخر مرة)</h2>
          <UnilateralRows ids={unilateral.map((e) => e!.id)} />
        </Card>
      )}

      <Card>
        <h2 className="text-[15px] font-semibold">مجموعات كل عضلة</h2>
        <p className="mb-3 text-xs text-muted">الهدف للتضخيم: حوالي 10-20 مجموعة للعضلة في الأسبوع.</p>
        <ul className="space-y-2.5">
          {muscles.map((m) => {
            const v = thisWeek[m] ?? 0
            const prev = lastWeek[m] ?? 0
            return (
              <li key={m} className="text-sm">
                <div className="mb-1 flex justify-between">
                  <span>{MUSCLE_AR[m]}</span>
                  <span className="num"><b>{v}</b> <span className="text-xs text-muted">(اللي فات {prev})</span></span>
                </div>
                <div className="relative h-2 overflow-hidden rounded-full bg-accent/10">
                  <div className="absolute inset-y-0 right-0 rounded-full bg-accent" style={{ width: `${(v / maxMuscle) * 100}%` }} />
                  <div className="absolute inset-y-0 w-0.5 bg-accent2" style={{ right: `${(10 / maxMuscle) * 100}%` }} title="10 مجموعات" />
                </div>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}

function UnilateralRows({ ids }: { ids: string[] }) {
  const exercises = useExercises()
  const rows = useLiveQuery(() => Promise.all(ids.map(async (id) => ({ id, h: (await exerciseHistory(id, 1))[0] }))), [ids.join()])
  if (!rows || !exercises) return null
  return (
    <ul className="space-y-2 text-sm">
      {rows.map(({ id, h }) => {
        const e = exercises.get(id)
        if (!e || !h) return null
        const t = sideTotals(e, h.sets)
        const pct = asymmetryPct(t.L, t.R)
        return (
          <li key={id} className="flex justify-between gap-2">
            <span>{e.nameAr}</span>
            <span className={pct >= 10 ? 'font-semibold text-warn' : 'text-muted'}>
              {pct}% {pct > 0 ? (t.L < t.R ? '(الشمال أضعف)' : '(اليمين أضعف)') : ''}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
