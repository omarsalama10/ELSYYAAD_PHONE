import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { completedSessions, exerciseHistory, getActiveProgram } from '../db/repo'
import { asymmetryPct, bestPerSession, sideTotals, weeklySetsByMuscle } from '../domain/stats'
import type { Section } from '../domain/types'
import { MUSCLE_AR } from '../data/catalog'
import { UNIT, weekStart } from '../lib/format'
import { useExercises } from '../lib/hooks'
import { LineChart } from '../ui/LineChart'
import { Card, Empty, PageTitle } from '../ui/primitives'

const WEEK = 7 * 86_400_000
const COUNTED: Section[] = ['main', 'finisher']

export function ProgressScreen() {
  const exercises = useExercises()
  const program = useLiveQuery(() => getActiveProgram(), [])
  const sessions = useLiveQuery(() => completedSessions(), [])
  const sets = useLiveQuery(() => db.sets.toArray(), [])
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

  const sectionOf = new Map(program.days.flatMap((d) => d.blocks.map((b) => [b.id, b.section] as const)))
  const finished = new Set(sessions.map((s) => s.id))
  const counted = sets.filter((s) => finished.has(s.sessionId) && COUNTED.includes(sectionOf.get(s.blockId) ?? 'main'))
  const startedAt = new Map(sessions.map((s) => [s.id, s.startedAt]))
  const thisWeekStart = weekStart()
  const inRange = (from: number, to: number) => counted.filter((s) => { const t = startedAt.get(s.sessionId) ?? 0; return t >= from && t < to })
  const thisWeek = weeklySetsByMuscle(inRange(thisWeekStart, Infinity), exercises)
  const lastWeek = weeklySetsByMuscle(inRange(thisWeekStart - WEEK, thisWeekStart), exercises)
  const muscles = Object.keys(MUSCLE_AR).filter((m) => thisWeek[m] || lastWeek[m])

  const ex = exerciseId ? exercises.get(exerciseId) : undefined
  const chrono = [...(history ?? [])].reverse()
  const loaded = ex?.metric === 'reps' && chrono.some((h) => h.sets.some((s) => s.weight))

  const unilateral = trained.map((id) => exercises.get(id)).filter((e) => e?.unilateral)

  return (
    <div className="space-y-4">
      <PageTitle>التقدم</PageTitle>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Card className="p-3"><div className="text-2xl font-black">{sessions.length}</div><div className="text-xs text-muted">تمرين</div></Card>
        <Card className="p-3"><div className="text-2xl font-black">{counted.length}</div><div className="text-xs text-muted">مجموعة</div></Card>
        <Card className="p-3"><div className="text-2xl font-black">{Math.round(sessions.reduce((a, s) => a + ((s.finishedAt ?? s.startedAt) - s.startedAt), 0) / 3_600_000)}</div><div className="text-xs text-muted">ساعة</div></Card>
      </div>

      {ex && (
        <div className="space-y-2">
          <select className="w-full" value={exerciseId} onChange={(e) => setPicked(e.target.value)} aria-label="اختار تمرين">
            {trained.map((id) => <option key={id} value={id}>{exercises.get(id)?.nameAr ?? id}</option>)}
          </select>
          <LineChart
            title={loaded ? `${ex.nameAr} — أقصى قوة تقديرية` : `${ex.nameAr} — أفضل أداء`}
            unit={loaded ? 'كجم' : UNIT[ex.metric]}
            series={ex.unilateral
              ? (['L', 'R'] as const).map((side) => ({ name: side === 'L' ? 'شمال' : 'يمين', points: bestPerSession(ex, chrono.map((h) => ({ at: h.session.startedAt, sets: h.sets.filter((s) => s.side === side) }))) }))
              : [{ name: ex.nameAr, points: bestPerSession(ex, chrono.map((h) => ({ at: h.session.startedAt, sets: h.sets }))) }]}
          />
          <Link to={`/exercises/${encodeURIComponent(ex.id)}`} className="text-sm text-accent2">السجل الكامل ←</Link>
        </div>
      )}

      {unilateral.length > 0 && (
        <Card>
          <h2 className="mb-2 font-bold">شمال مقابل يمين (آخر مرة)</h2>
          <UnilateralRows ids={unilateral.map((e) => e!.id)} />
        </Card>
      )}

      <Card>
        <h2 className="mb-1 font-bold">مجموعات كل عضلة</h2>
        <p className="mb-2 text-xs text-muted">الهدف للتضخيم: حوالي 10-20 مجموعة للعضلة في الأسبوع.</p>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted"><tr><th className="py-1 text-right font-normal">العضلة</th><th className="font-normal">الأسبوع ده</th><th className="font-normal">اللي فات</th></tr></thead>
          <tbody>
            {muscles.map((m) => (
              <tr key={m} className="border-t border-line">
                <td className="py-1.5">{MUSCLE_AR[m]}</td>
                <td className="text-center font-bold">{thisWeek[m] ?? 0}</td>
                <td className="text-center text-muted">{lastWeek[m] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function UnilateralRows({ ids }: { ids: string[] }) {
  const exercises = useExercises()
  const rows = useLiveQuery(() => Promise.all(ids.map(async (id) => ({ id, h: (await exerciseHistory(id, 1))[0] }))), [ids.join()])
  if (!rows || !exercises) return null
  return (
    <ul className="space-y-1.5 text-sm">
      {rows.map(({ id, h }) => {
        const e = exercises.get(id)
        if (!e || !h) return null
        const t = sideTotals(e, h.sets)
        const pct = asymmetryPct(t.L, t.R)
        return (
          <li key={id} className="flex justify-between gap-2">
            <span>{e.nameAr}</span>
            <span className={pct >= 10 ? 'text-warn' : 'text-muted'}>
              {pct}% {pct > 0 ? (t.L < t.R ? '(الشمال أضعف)' : '(اليمين أضعف)') : ''}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
