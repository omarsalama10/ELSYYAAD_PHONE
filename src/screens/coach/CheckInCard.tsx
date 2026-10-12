import { useState } from 'react'
import { saveCheckIn } from '../../db/repo'
import type { CheckIn, Scale5 } from '../../domain/types'
import { todayISO } from '../../lib/format'
import { useTodayReadiness } from '../../lib/readiness'
import { Button } from '../../ui/primitives'
import { useSafe } from '../../ui/Toast'
import { ProgressRing } from '../../ui/viz'

type ScaleKey = 'sleepQuality' | 'stress' | 'soreness' | 'fatigue'
const SCALES: { key: ScaleKey; label: string; low: string; high: string; goodHigh: boolean }[] = [
  { key: 'sleepQuality', label: 'جودة النوم', low: 'وحشة', high: 'ممتازة', goodHigh: true },
  { key: 'stress', label: 'الضغط النفسي', low: 'مفيش', high: 'جامد', goodHigh: false },
  { key: 'soreness', label: 'ألم العضلات (الشدّ)', low: 'مفيش', high: 'جامد', goodHigh: false },
  { key: 'fatigue', label: 'التعب', low: 'نشيط', high: 'مهدود', goodHigh: false },
]

const scoreColor = (s: number) => (s >= 75 ? '#1f8f76' : s >= 50 ? '#2f9fb0' : s >= 35 ? '#c47812' : '#d64545')

function Form({ initial, onDone }: { initial?: CheckIn; onDone: () => void }) {
  const safe = useSafe()
  const [c, setC] = useState<CheckIn>(initial ?? { id: todayISO(), sleepHours: 7, sleepQuality: 3, stress: 2, soreness: 2, fatigue: 2, pain: false, at: Date.now() })
  const save = () => safe(async () => { await saveCheckIn({ ...c, at: Date.now() }); onDone() }, 'اتسجّلت جاهزيتك ✅')
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm">ساعات النوم</span>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="أقل" className="h-9 w-9 rounded-xl bg-white/80 text-lg shadow-glass" onClick={() => setC({ ...c, sleepHours: Math.max(0, c.sleepHours - 0.5) })}>−</button>
          <span className="w-12 text-center text-lg font-bold num" data-testid="sleep-hours">{c.sleepHours}</span>
          <button type="button" aria-label="أكتر" className="h-9 w-9 rounded-xl bg-white/80 text-lg shadow-glass" onClick={() => setC({ ...c, sleepHours: Math.min(14, c.sleepHours + 0.5) })}>+</button>
        </div>
      </div>
      {SCALES.map((s) => (
        <div key={s.key} className="space-y-1.5">
          <div className="flex justify-between text-sm"><span>{s.label}</span><span className="text-xs text-muted">1 = {s.low} • 5 = {s.high}</span></div>
          <div className="flex gap-1.5" role="radiogroup" aria-label={s.label}>
            {([1, 2, 3, 4, 5] as Scale5[]).map((v) => {
              const active = c[s.key] === v
              const good = s.goodHigh ? v >= 4 : v <= 2
              const neutral = v === 3
              return (
                <button
                  key={v} type="button" role="radio" aria-checked={active} aria-label={`${s.label} ${v}`}
                  onClick={() => setC({ ...c, [s.key]: v })}
                  className={`h-10 flex-1 rounded-xl text-sm font-semibold transition ${active ? (good ? 'bg-accent text-white shadow-lift' : neutral ? 'bg-muted text-white' : 'bg-accent2 text-white') : 'bg-white/70 text-muted'}`}
                >{v}</button>
              )
            })}
          </div>
        </div>
      ))}
      <label className="flex items-center justify-between text-sm">
        <span>فيه ألم أو إصابة؟</span>
        <input type="checkbox" className="h-6 w-6 accent-[#d64545]" checked={c.pain} onChange={(e) => setC({ ...c, pain: e.target.checked })} aria-label="فيه ألم" />
      </label>
      {c.pain && <input className="w-full" placeholder="فين؟ (مثلًا: الركبة الشمال)" value={c.painNote ?? ''} onChange={(e) => setC({ ...c, painNote: e.target.value })} aria-label="مكان الألم" />}
      <Button className="w-full" onClick={save}>حفظ</Button>
    </div>
  )
}

/** Daily readiness: prompt → form → score ring with advice. */
export function CheckInCard({ compact = false }: { compact?: boolean }) {
  const r = useTodayReadiness()
  const [editing, setEditing] = useState(false)
  if (!r) return null

  if (editing || (!r.checkin && !compact))
    return (
      <section className="glass p-5" aria-label="جاهزيتك النهارده">
        <h2 className="mb-1 text-[15px] font-semibold">جاهزيتك النهارده</h2>
        <p className="mb-4 text-xs text-muted">30 ثانية بيخلّوا اقتراحات الأوزان على مقاس يومك.</p>
        <Form initial={r.checkin} onDone={() => setEditing(false)} />
      </section>
    )

  if (!r.checkin)
    return (
      <button type="button" onClick={() => setEditing(true)} className="glass block w-full p-4 text-right">
        <span className="font-semibold">سجّل جاهزيتك النهارده</span>
        <span className="block text-xs text-muted">عشان نظبط الأوزان على حالتك (نوم، تعب، ألم)</span>
      </button>
    )

  const { score = 0, advice, checkin } = r
  return (
    <section className="glass flex items-center gap-4 p-4" aria-label="جاهزيتك النهارده" data-testid="readiness">
      <ProgressRing value={score / 100} size={76} stroke={8} color={scoreColor(score)} label={`جاهزيتك ${score} من 100`}>
        <span className="text-lg font-bold num">{score}</span>
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{advice?.title}</div>
        <p className="text-xs leading-relaxed text-muted">{advice?.text}</p>
        {checkin.pain && checkin.painNote && <p className="mt-1 text-xs text-danger">⚠️ ألم: {checkin.painNote}</p>}
      </div>
      <button type="button" className="self-start text-xs text-accent" onClick={() => setEditing(true)}>تعديل</button>
    </section>
  )
}
