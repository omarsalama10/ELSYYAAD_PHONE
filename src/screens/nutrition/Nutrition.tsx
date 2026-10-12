import { useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteMeal, getProfile, logWeight, saveDay, saveProfile } from '../../db/nutritionRepo'
import { cheapestProtein, suggestFill } from '../../domain/nutrition/budget'
import { GOAL_AR } from '../../domain/nutrition/targets'
import type { MealSlot } from '../../domain/nutrition/types'
import { fmtDate, fmtNum, todayISO } from '../../lib/format'
import { useNutrition, type NutritionView } from '../../lib/nutrition'
import { Icon, IconX } from '../../ui/icons'
import { Banner, Button, Card, Empty, NumberInput, PageTitle } from '../../ui/primitives'
import { useSafe } from '../../ui/Toast'
import { ProgressRing } from '../../ui/viz'
import { FoodPicker, SLOT_AR } from './FoodPicker'

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']
const DAY = 86_400_000
const shift = (iso: string, d: number) => {
  const x = new Date(new Date(`${iso}T12:00:00`).getTime() + d * DAY)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const BMR_AR = { inbody: 'من InBody', katch: 'من كتلة الدهون (Katch-McArdle)', mifflin: 'من الطول والوزن والسن (Mifflin)' }

function MacroBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = target ? Math.min(1, value / target) : 0
  return (
    <div className="text-xs">
      <div className="mb-1 flex justify-between"><span className="text-muted">{label}</span><span className="num"><b>{fmtNum(value, 0)}</b> / {target} جم</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-ink/[0.07]"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct * 100}%`, background: color }} /></div>
    </div>
  )
}

function Summary({ v }: { v: NutritionView }) {
  const t = v.targets!
  const left = t.kcal - v.totals.kcal
  return (
    <section className="glass p-5" aria-label="ملخص اليوم">
      <div className="flex items-center gap-5">
        <ProgressRing value={v.totals.kcal / t.kcal} size={116} color={left < 0 ? '#c47812' : '#1f8f76'} label={`${v.totals.kcal} من ${t.kcal} سعرة`}>
          <span className="text-2xl font-bold num" data-testid="kcal-eaten">{v.totals.kcal}</span>
          <span className="text-[10px] text-muted">من {t.kcal} سعرة</span>
        </ProgressRing>
        <div className="flex-1 space-y-2.5">
          <MacroBar label="بروتين" value={v.totals.p} target={t.p} color="#1f8f76" />
          <MacroBar label="كارب" value={v.totals.c} target={t.c} color="#e2654f" />
          <MacroBar label="دهون" value={v.totals.f} target={t.f} color="#7c5cd6" />
        </div>
      </div>
      <p className="mt-3 text-center text-sm">{left >= 0 ? <>فاضلك <b className="num">{left}</b> سعرة و<b className="num">{Math.max(0, Math.round(t.p - v.totals.p))}</b> جم بروتين</> : <span className="text-warn">زوّدت <b className="num">{-left}</b> سعرة عن هدفك</span>}</p>
    </section>
  )
}

function WeighIn({ date, current }: { date: string; current?: number }) {
  const safe = useSafe()
  const [kg, setKg] = useState<number>()
  return (
    <section className="glass flex items-center gap-3 p-4" aria-label="وزن النهارده">
      <span className="text-sm font-semibold">وزنك النهارده</span>
      <NumberInput ariaLabel="وزن النهارده" value={kg} onChange={setKg} placeholder={current ? String(current) : 'كجم'} className="w-24 py-2" />
      <Button className="px-4 py-2 text-sm" onClick={() => void safe(async () => { if (!kg) throw new Error('اكتب الوزن'); await logWeight(date, kg); setKg(undefined) }, 'اتسجّل ✅')}>سجّل</Button>
    </section>
  )
}

function Water({ v }: { v: NutritionView }) {
  const safe = useSafe()
  const glasses = Math.round(v.waterGoal / 250)
  const set = (ml: number) => safe(() => saveDay({ ...v.day, waterMl: Math.max(0, ml) }))
  return (
    <section className="glass p-4" aria-label="المياه">
      <div className="mb-2 flex justify-between text-sm"><span className="font-semibold">💧 المياه</span><span className="num" data-testid="water">{(v.day.waterMl / 1000).toFixed(2)} / {(v.waterGoal / 1000).toFixed(2)} لتر</span></div>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: glasses }, (_, i) => (
          <button key={i} type="button" aria-label={`كوباية ${i + 1}`} onClick={() => void set((i + 1) * 250 === v.day.waterMl ? i * 250 : (i + 1) * 250)}
            className={`h-8 w-7 rounded-b-lg rounded-t-sm border ${i * 250 < v.day.waterMl ? 'border-[#2f8fd8] bg-[#2f8fd8]/70' : 'border-ink/15 bg-white/60'}`} />
        ))}
      </div>
    </section>
  )
}

function Supplements({ v }: { v: NutritionView }) {
  const safe = useSafe()
  const list = v.profile?.supplements ?? []
  if (list.length === 0) return null
  const toggle = (s: string) => safe(() => saveDay({ ...v.day, supplements: v.day.supplements.includes(s) ? v.day.supplements.filter((x) => x !== s) : [...v.day.supplements, s] }))
  return (
    <section className="glass p-4" aria-label="المكملات">
      <div className="mb-2 text-sm font-semibold">💊 المكملات</div>
      <div className="flex flex-wrap gap-2">
        {list.map((s) => {
          const on = v.day.supplements.includes(s)
          return <button key={s} type="button" aria-pressed={on} onClick={() => void toggle(s)} className={`rounded-full px-3 py-1.5 text-sm ${on ? 'bg-accent text-white' : 'bg-white/70 text-muted'}`}>{on ? '✓ ' : ''}{s}</button>
        })}
      </div>
    </section>
  )
}

function WeeklyCard({ v }: { v: NutritionView }) {
  const safe = useSafe()
  const e = v.estimate!
  const apply = (kcal: number) => safe(async () => { const p = await getProfile(); if (p) await saveProfile({ ...p, kcalOverride: kcal }) }, `هدفك بقى ${kcal} سعرة`)
  const reset = () => safe(async () => { const p = await getProfile(); if (p) await saveProfile({ ...p, kcalOverride: undefined }) }, 'رجعنا للهدف المحسوب')
  return (
    <Card className="space-y-3">
      <h2 className="text-[15px] font-semibold">التقرير الأسبوعي</h2>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-white/60 p-2"><div className="text-[11px] text-muted">متوسط أكلك</div><div className="font-bold num">{v.avgIntake7 ?? '—'}</div></div>
        <div className="rounded-2xl bg-white/60 p-2"><div className="text-[11px] text-muted">حرقك {e.enoughData ? 'الفعلي' : 'المتوقع'}</div><div className="font-bold num">{e.tdee}</div></div>
        <div className="rounded-2xl bg-white/60 p-2"><div className="text-[11px] text-muted">الفائض</div><div className="font-bold num">{v.surplus !== undefined ? `${v.surplus > 0 ? '+' : ''}${v.surplus}` : '—'}</div></div>
      </div>
      {v.verdict && <Banner tone={v.verdict.tone === 'ok' ? 'ok' : 'warn'}>{v.verdict.text}</Banner>}
      <p className="text-xs leading-relaxed text-muted">{e.reason}</p>
      {v.suggestion && (
        <div className="flex items-center gap-3 rounded-2xl bg-accent/10 p-3" data-testid="kcal-suggestion">
          <div className="flex-1 text-sm">الهدف المقترح: <b className="num">{v.suggestion.kcal}</b> سعرة</div>
          <Button className="px-4 py-2 text-sm" onClick={() => void apply(v.suggestion!.kcal)}>طبّق</Button>
        </div>
      )}
      {v.profile?.kcalOverride && <button type="button" className="text-xs text-accent" onClick={() => void reset()}>رجّع للهدف المحسوب من المعادلة</button>}
    </Card>
  )
}

function BudgetCard({ v }: { v: NutritionView }) {
  const budget = v.profile?.budget
  const ranked = cheapestProtein(v.foods).slice(0, 4)
  if (!budget && ranked.length === 0) return null
  const proteinLeft = Math.max(0, (v.targets?.p ?? 0) - v.totals.p)
  const fill = budget ? suggestFill(proteinLeft, Math.max(0, budget - v.spent), v.foods) : []
  return (
    <Card className="space-y-3">
      <h2 className="text-[15px] font-semibold">💰 الميزانية</h2>
      {budget ? (
        <div className="text-sm">صرفت <b className="num">{v.spent}</b> من <b className="num">{budget}</b> جنيه النهارده</div>
      ) : <p className="text-xs text-muted">حدد ميزانية يومية من "بياناتك وهدفك" عشان نقترحلك أكل على قدها.</p>}
      {ranked.length > 0 && (
        <div>
          <div className="mb-1 text-xs text-muted">أرخص مصادر بروتين عندك (جم بروتين لكل جنيه):</div>
          <ul className="space-y-1 text-sm">{ranked.map((r) => <li key={r.food.id} className="flex justify-between"><span>{r.food.name}</span><span className="num text-muted">{r.proteinPerEgp.toFixed(1)}</span></li>)}</ul>
        </div>
      )}
      {fill.length > 0 && proteinLeft > 0 && (
        <div className="rounded-2xl bg-accent/10 p-3 text-sm" data-testid="budget-fill">
          <div className="mb-1 font-semibold">عشان تكمّل البروتين في حدود ميزانيتك:</div>
          <ul className="space-y-0.5">{fill.map((x) => <li key={x.food.id}>• {x.servings} {x.food.serving.label} {x.food.name} — {x.p} جم بروتين ({x.price} ج)</li>)}</ul>
        </div>
      )}
      {ranked.length === 0 && <p className="text-xs text-muted">ضيف سعر للأكلات اللي بتشتريها (وإنت بتسجّلها) وهنرتبهالك حسب أرخص بروتين.</p>}
    </Card>
  )
}

export function NutritionScreen() {
  const safe = useSafe()
  const [date, setDate] = useState(todayISO())
  const [slot, setSlot] = useState<MealSlot>()
  const v = useNutrition(date)
  if (!v) return null
  if (slot) return <FoodPicker slot={slot} date={date} foods={v.foods} onClose={() => setSlot(undefined)} />

  const isToday = date === todayISO()
  return (
    <div className="space-y-4">
      <PageTitle action={<Link to="/nutrition/setup" className="glass-strong flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm text-accent"><IconX.edit />بياناتك</Link>}>التغذية</PageTitle>

      {!v.profile || !v.weight ? (
        <Empty>
          <span className="mb-3 block">عشان نحسبلك السعرات والبروتين، محتاجين طولك ووزنك وهدفك.</span>
          <Link to="/nutrition/setup" className="inline-block rounded-2xl bg-accent px-5 py-3 font-semibold text-white shadow-lift">ابدأ</Link>
        </Empty>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <button type="button" aria-label="اليوم اللي فات" onClick={() => setDate(shift(date, -1))} className="glass-strong flex h-10 w-10 items-center justify-center rounded-2xl"><Icon.back /></button>
            <div className="text-center">
              <div className="font-semibold">{isToday ? 'النهارده' : fmtDate(date)}</div>
              <div className="text-xs text-muted">{GOAL_AR[v.profile.goal]}{v.profile.kcalOverride ? ' • هدف معدّل' : ''}</div>
            </div>
            <button type="button" aria-label="اليوم اللي بعده" disabled={isToday} onClick={() => setDate(shift(date, 1))} className="glass-strong flex h-10 w-10 rotate-180 items-center justify-center rounded-2xl disabled:opacity-30"><Icon.back /></button>
          </div>

          <Summary v={v} />
          {isToday && <WeighIn date={date} current={v.weight} />}

          {SLOTS.map((s) => {
            const entries = v.meals.filter((m) => m.meal === s)
            const kcal = entries.reduce((a, m) => a + m.kcal, 0)
            return (
              <section key={s} className="glass p-4" aria-label={SLOT_AR[s]} data-testid={`slot-${s}`}>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{SLOT_AR[s]} <span className="text-xs font-normal text-muted num">{kcal ? `${kcal} سعرة` : ''}</span></h2>
                  <button type="button" onClick={() => setSlot(s)} className="flex items-center gap-1 rounded-xl bg-accent/15 px-3 py-1.5 text-sm text-accent" aria-label={`ضيف ${SLOT_AR[s]}`}><Icon.plus />ضيف</button>
                </div>
                {entries.length > 0 && (
                  <ul className="mt-2 divide-y divide-white/70">
                    {entries.map((m) => (
                      <li key={m.id} className="flex items-center gap-2 py-2 text-sm">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{m.name}{m.grams ? <span className="text-xs text-muted"> • {m.grams} جم</span> : null}</span>
                          <span className="block text-xs text-muted num">{m.kcal} سعرة • {fmtNum(m.p)} بروتين{m.price ? ` • ${m.price} ج` : ''}</span>
                        </span>
                        <button type="button" aria-label="مسح" className="text-muted" onClick={() => void safe(() => deleteMeal(m.id))}><Icon.trash /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}

          <Water v={v} />
          <Supplements v={v} />
          <WeeklyCard v={v} />
          <BudgetCard v={v} />
          {v.bmr && <p className="px-1 text-[11px] leading-relaxed text-muted">معدل الحرق الأساسي {v.bmr.value} سعرة ({BMR_AR[v.bmr.method]}) × نشاطك = {v.targets!.tdee} سعرة. القيم تقريبية؛ الأرقام بتتظبط لوحدها مع تسجيل أكلك ووزنك.</p>}
        </>
      )}
    </div>
  )
}
