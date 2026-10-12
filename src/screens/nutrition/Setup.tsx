import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProfile, logWeight, saveProfile } from '../../db/nutritionRepo'
import { GOAL_AR } from '../../domain/nutrition/targets'
import type { Goal, NutritionProfile } from '../../domain/nutrition/types'
import { todayISO } from '../../lib/format'
import { useNutrition } from '../../lib/nutrition'
import { Icon } from '../../ui/icons'
import { Bare } from '../../ui/Layout'
import { Button, Card, NumberInput } from '../../ui/primitives'
import { useSafe } from '../../ui/Toast'
import { Segmented } from '../../ui/viz'

const ACTIVITY = [
  { v: 1.3, label: 'قاعد أغلب اليوم وتمرين خفيف' },
  { v: 1.4, label: 'شغل مكتب + 3 أيام جيم' },
  { v: 1.55, label: 'نشيط + 4-5 أيام تمرين' },
  { v: 1.7, label: 'شغل بدني أو تمرين يومي' },
]
const GOAL_HINT: Record<Goal, string> = {
  cut: 'نزول دهون (−400 سعرة)',
  recomp: 'نفس السعرات — بطيء بس بيبني عضل ويشيل دهون',
  leanbulk: 'فائض بسيط (+250) — عضل بأقل دهون، مناسب ليك',
  bulk: 'فائض أكبر (+450) — أسرع بس دهون أكتر',
}

const DEFAULT: NutritionProfile = {
  sex: 'male', birthYear: new Date().getFullYear() - 21, heightCm: 175, activity: 1.4, goal: 'leanbulk',
  proteinPerKg: 2, fatPerKg: 0.8, supplements: ['كرياتين 5 جم', 'واي بروتين'],
}

export function NutritionSetup() {
  const nav = useNavigate()
  const safe = useSafe()
  const view = useNutrition(todayISO())
  const [p, setP] = useState<NutritionProfile>()
  const [weight, setWeight] = useState<number>()
  const [supps, setSupps] = useState('')

  useEffect(() => {
    if (p || !view) return
    void getProfile().then((saved) => {
      const v = saved ?? DEFAULT
      setP(v)
      setSupps(v.supplements.join('، '))
    })
    setWeight(view.weight)
  }, [view, p])
  if (!p) return null

  const save = () =>
    safe(async () => {
      if (!weight) throw new Error('اكتب وزنك الحالي')
      if (!(p.heightCm > 120 && p.heightCm < 230)) throw new Error('الطول مش منطقي')
      const prev = await getProfile()
      const supplements = supps.split(/[،,]/).map((x) => x.trim()).filter(Boolean)
      await saveProfile({ ...p, supplements, kcalOverride: prev && prev.goal !== p.goal ? undefined : p.kcalOverride })
      if (weight !== view?.weight) await logWeight(todayISO(), weight)
      nav('/nutrition')
    }, 'اتحفظ ✅')

  return (
    <Bare>
      <div className="flex items-center gap-3 pb-4 pt-safe">
        <button type="button" onClick={() => nav('/nutrition')} aria-label="رجوع" className="glass-strong flex h-10 w-10 items-center justify-center rounded-2xl text-muted"><Icon.back /></button>
        <h1 className="text-2xl font-bold">بياناتك وهدفك</h1>
      </div>
      <div className="space-y-4">
        <Card className="space-y-3">
          <Segmented options={[{ value: 'male', label: 'ذكر' }, { value: 'female', label: 'أنثى' }]} value={p.sex} onChange={(sex) => setP({ ...p, sex })} />
          <div className="grid grid-cols-3 gap-2 text-xs text-muted">
            <label className="space-y-1">سنة الميلاد<NumberInput ariaLabel="سنة الميلاد" step="1" value={p.birthYear} onChange={(v) => v && setP({ ...p, birthYear: v })} /></label>
            <label className="space-y-1">الطول (سم)<NumberInput ariaLabel="الطول" value={p.heightCm} onChange={(v) => v && setP({ ...p, heightCm: v })} /></label>
            <label className="space-y-1">الوزن (كجم)<NumberInput ariaLabel="الوزن الحالي" value={weight} onChange={setWeight} /></label>
          </div>
        </Card>

        <Card className="space-y-2">
          <h2 className="font-semibold">نشاطك</h2>
          {ACTIVITY.map((a) => (
            <button key={a.v} type="button" onClick={() => setP({ ...p, activity: a.v })} className={`block w-full rounded-2xl px-3 py-2.5 text-right text-sm ${p.activity === a.v ? 'bg-accent text-white shadow-lift' : 'bg-white/70'}`}>{a.label}</button>
          ))}
        </Card>

        <Card className="space-y-2">
          <h2 className="font-semibold">هدفك</h2>
          {(Object.keys(GOAL_AR) as Goal[]).map((g) => (
            <button key={g} type="button" onClick={() => setP({ ...p, goal: g })} className={`block w-full rounded-2xl px-3 py-2.5 text-right ${p.goal === g ? 'bg-accent text-white shadow-lift' : 'bg-white/70'}`}>
              <span className="block text-sm font-semibold">{GOAL_AR[g]}</span>
              <span className={`block text-xs ${p.goal === g ? 'text-white/85' : 'text-muted'}`}>{GOAL_HINT[g]}</span>
            </button>
          ))}
        </Card>

        <Card className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs text-muted">
            <label className="space-y-1">بروتين (جم لكل كيلو)<NumberInput ariaLabel="بروتين لكل كيلو" value={p.proteinPerKg} onChange={(v) => v && setP({ ...p, proteinPerKg: v })} /></label>
            <label className="space-y-1">ميزانية الأكل اليومية (جنيه)<NumberInput ariaLabel="الميزانية" value={p.budget} onChange={(v) => setP({ ...p, budget: v })} /></label>
          </div>
          <label className="block space-y-1 text-xs text-muted">المكملات (افصل بفاصلة)
            <input className="block w-full" value={supps} onChange={(e) => setSupps(e.target.value)} aria-label="المكملات" />
          </label>
        </Card>
        <Button className="w-full" onClick={save}>حفظ</Button>
      </div>
    </Bare>
  )
}
