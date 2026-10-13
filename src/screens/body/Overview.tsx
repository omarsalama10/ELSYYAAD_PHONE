import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../../db/db'
import { allWeights, getProfile } from '../../db/nutritionRepo'
import { getBodyGoals, saveBodyGoals } from '../../db/repo'
import { bmi, bmiCategory, fatFreeMass, projectGoal, weeklySlope, type Dated } from '../../domain/body'
import { emaTrend } from '../../domain/nutrition/adaptive'
import type { BodyGoals } from '../../domain/types'
import { fmtDateLong, fmtNum } from '../../lib/format'
import { LineChart } from '../../ui/LineChart'
import { Card, CommitNumber } from '../../ui/primitives'
import { useSafe } from '../../ui/Toast'

const ts = (iso: string) => new Date(`${iso}T12:00:00`).getTime()

function Tile({ label, value, unit, sub }: { label: string; value?: number; unit: string; sub?: string }) {
  return (
    <div className="glass p-3 text-center">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="text-lg font-bold num">{value !== undefined ? fmtNum(value) : '—'} <span className="text-[11px] font-normal text-muted">{unit}</span></div>
      {sub && <div className="text-[10px] text-muted">{sub}</div>}
    </div>
  )
}

function GoalRow({ label, unit, target, points, onSet }: { label: string; unit: string; target?: number; points: Dated[]; onSet: (v: number | undefined) => void }) {
  const [editing, setEditing] = useState(false)
  const proj = target !== undefined ? projectGoal(points, target, Date.now(), unit) : undefined
  const current = [...points].sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.value
  return (
    <li className="space-y-1 py-3" data-testid={`goal-${label}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{label}</span>
        <span className="flex items-center gap-2 text-sm">
          <span className="text-xs text-muted num">الحالي {current !== undefined ? fmtNum(current) : '—'} • الهدف</span>
          {editing
            ? <span className="w-20"><CommitNumber ariaLabel={`هدف ${label}`} value={target ?? current ?? 0} onCommit={(v) => { onSet(v > 0 ? v : undefined); setEditing(false) }} /></span>
            : <button type="button" aria-label={`حدد هدف ${label}`} className="font-bold text-accent num" onClick={() => setEditing(true)}>{target !== undefined ? `${fmtNum(target)} ${unit}` : 'حدد'}</button>}
        </span>
      </div>
      {proj && (
        <p className={`text-xs ${proj.status === 'on-track' || proj.status === 'reached' ? 'text-accent' : proj.status === 'wrong-way' ? 'text-warn' : 'text-muted'}`}>
          {proj.text}{proj.eta ? ` (حوالي ${fmtDateLong(proj.eta)})` : ''}
        </p>
      )}
    </li>
  )
}

export function BodyOverview() {
  const safe = useSafe()
  const data = useLiveQuery(async () => {
    const [weights, inbody, tape, profile, goals] = await Promise.all([allWeights(), db.inbody.orderBy('date').toArray(), db.tape.orderBy('date').toArray(), getProfile(), getBodyGoals()])
    return { weights, inbody, tape, profile, goals }
  }, [])
  if (!data) return null
  const { weights, inbody, tape, profile, goals } = data
  const weight = weights.at(-1)?.kg
  const ib = inbody.at(-1)
  const height = profile?.heightCm
  const b = weight && height ? bmi(weight, height) : undefined
  const ffm = weight && ib ? fatFreeMass(weight, ib) : undefined
  const trend = emaTrend(weights)
  const wPoints: Dated[] = weights.map((w) => ({ date: w.id, value: w.kg }))
  const rate = weeklySlope(wPoints.filter((p) => ts(p.date) >= ts(wPoints.at(-1)?.date ?? '1970-01-01') - 56 * 86_400_000))
  const pbfPoints: Dated[] = inbody.filter((i) => i.pbf !== undefined).map((i) => ({ date: i.date, value: i.pbf! }))
  const waistPoints: Dated[] = tape.filter((x) => x.waist !== undefined).map((x) => ({ date: x.date, value: x.waist! }))
  const setGoal = (patch: Partial<BodyGoals>) => safe(() => saveBodyGoals({ ...goals, ...patch }))

  return (
    <div className="space-y-3">
      {!height && (
        <Link to="/nutrition/setup" className="glass block p-4 text-sm"><b>سجّل طولك</b> <span className="text-muted">عشان نحسب الـ BMI (من بياناتك في التغذية)</span></Link>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Tile label="الوزن" value={weight} unit="كجم" sub={rate !== undefined ? `${rate > 0 ? '+' : ''}${rate.toFixed(2)}/أسبوع` : undefined} />
        <Tile label="BMI" value={b} unit="" sub={b ? bmiCategory(b) : undefined} />
        <Tile label="نسبة الدهون" value={ib?.pbf} unit="%" />
        <Tile label="الكتلة الخالية" value={ffm} unit="كجم" sub="وزن − الدهون" />
        <Tile label="العضل SMM" value={ib?.smm} unit="كجم" />
        <Tile label="الوسط" value={tape.at(-1)?.waist} unit="سم" />
      </div>
      <p className="px-1 text-[11px] text-muted">الـ BMI مش بيفرّق بين عضل ودهون — نسبة الدهون والكتلة الخالية أهم ليك.</p>

      <LineChart
        title="الوزن واتجاهه"
        subtitle="الاتجاه بيشيل تقلبات المية والأكل اليومية"
        unit="كجم"
        series={[
          { name: 'الوزن', points: weights.map((w) => ({ x: ts(w.id), y: w.kg })) },
          { name: 'الاتجاه', points: trend.map((w) => ({ x: ts(w.id), y: w.trend })) },
        ]}
      />

      <Card>
        <h2 className="text-[15px] font-semibold">أهدافك وتوقّع الوصول</h2>
        <p className="text-xs text-muted">دوس على الرقم عشان تحدد الهدف. التوقّع بيتحدّث مع كل قياس جديد.</p>
        <ul className="divide-y divide-white/70">
          <GoalRow label="الوزن" unit="كجم" target={goals.weight} points={wPoints} onSet={(v) => void setGoal({ weight: v })} />
          <GoalRow label="نسبة الدهون" unit="%" target={goals.pbf} points={pbfPoints} onSet={(v) => void setGoal({ pbf: v })} />
          <GoalRow label="الوسط" unit="سم" target={goals.waist} points={waistPoints} onSet={(v) => void setGoal({ waist: v })} />
        </ul>
      </Card>
    </div>
  )
}
