import { useEffect, useMemo, useState } from 'react'
import { addMeal, newFoodId, recentFoodIds, saveFood } from '../../db/nutritionRepo'
import { entryFromFood } from '../../domain/nutrition/food'
import type { Food, MealSlot } from '../../domain/nutrition/types'
import { fmtNum } from '../../lib/format'
import { Icon } from '../../ui/icons'
import { Button, NumberInput } from '../../ui/primitives'
import { useSafe } from '../../ui/Toast'
import { Segmented } from '../../ui/viz'

export const SLOT_AR: Record<MealSlot, string> = { breakfast: 'فطار', lunch: 'غدا', dinner: 'عشا', snack: 'سناكس' }

type Mode = 'list' | 'quick' | 'custom'

function Amount({ food, slot, date, onDone, onBack }: { food: Food; slot: MealSlot; date: string; onDone: () => void; onBack: () => void }) {
  const safe = useSafe()
  const [servings, setServings] = useState(1)
  const [grams, setGrams] = useState<number>(food.serving.grams)
  const [price, setPrice] = useState<number | undefined>(food.price)
  const preview = entryFromFood({ ...food, price }, grams, slot, date)
  const setS = (s: number) => { const v = Math.max(0.25, s); setServings(v); setGrams(Math.round(v * food.serving.grams)) }

  const add = () =>
    safe(async () => {
      if (!grams || grams <= 0) throw new Error('اكتب الكمية')
      if (price !== food.price) await saveFood({ ...food, price })
      await addMeal(entryFromFood({ ...food, price }, grams, slot, date))
      onDone()
    }, `اتضاف لـ ${SLOT_AR[slot]} ✅`)

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-accent"><Icon.back />رجوع</button>
      <h2 className="text-xl font-bold">{food.name}</h2>
      <div className="glass space-y-3 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm">عدد ({food.serving.label})</span>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="أقل" className="h-9 w-9 rounded-xl bg-white/80 shadow-glass" onClick={() => setS(servings - 0.5)}>−</button>
            <span className="w-12 text-center text-lg font-bold num" data-testid="servings">{fmtNum(servings, 2)}</span>
            <button type="button" aria-label="أكتر" className="h-9 w-9 rounded-xl bg-white/80 shadow-glass" onClick={() => setS(servings + 0.5)}>+</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted">
          <label className="space-y-1">أو بالجرام<NumberInput ariaLabel="الجرامات" value={grams} onChange={(g) => { setGrams(g ?? 0); if (g) setServings(Number((g / food.serving.grams).toFixed(2))) }} /></label>
          <label className="space-y-1">سعر ال{food.serving.label} (جنيه)<NumberInput ariaLabel="السعر" value={price} onChange={setPrice} placeholder="اختياري" /></label>
        </div>
      </div>
      <div className="glass grid grid-cols-4 p-0 text-center">
        {[['سعرات', preview.kcal], ['بروتين', preview.p], ['كارب', preview.c], ['دهون', preview.f]].map(([l, v]) => (
          <div key={l} className="py-3"><div className="text-[11px] text-muted">{l}</div><div className="font-bold num">{fmtNum(v as number)}</div></div>
        ))}
      </div>
      <Button className="w-full" onClick={add}>ضيف</Button>
      <p className="text-center text-[11px] text-muted">القيم تقريبية — الأكل البيتي بيفرق حسب الزيت والكمية.</p>
    </div>
  )
}

function QuickAdd({ slot, date, onDone }: { slot: MealSlot; date: string; onDone: () => void }) {
  const safe = useSafe()
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState<number>()
  const [p, setP] = useState<number>()
  const [price, setPrice] = useState<number>()
  const add = () =>
    safe(async () => {
      if (!kcal) throw new Error('اكتب السعرات')
      await addMeal({ date, meal: slot, name: name.trim() || 'إضافة سريعة', kcal, p: p ?? 0, c: 0, f: 0, ...(price ? { price } : {}) })
      onDone()
    }, 'اتضاف ✅')
  return (
    <div className="glass space-y-3 p-4">
      <input className="w-full" placeholder="الاسم (مثلًا: أكل برة)" value={name} onChange={(e) => setName(e.target.value)} aria-label="اسم الأكلة" />
      <div className="grid grid-cols-3 gap-2 text-xs text-muted">
        <label className="space-y-1">سعرات<NumberInput ariaLabel="سعرات" value={kcal} onChange={setKcal} /></label>
        <label className="space-y-1">بروتين (جم)<NumberInput ariaLabel="بروتين" value={p} onChange={setP} /></label>
        <label className="space-y-1">السعر<NumberInput ariaLabel="سعر" value={price} onChange={setPrice} /></label>
      </div>
      <Button className="w-full" onClick={add}>ضيف</Button>
    </div>
  )
}

function CustomFood({ onCreated }: { onCreated: (f: Food) => void }) {
  const safe = useSafe()
  const [name, setName] = useState('')
  const [label, setLabel] = useState('حصة')
  const [grams, setGrams] = useState<number>(100)
  const [m, setM] = useState<{ kcal?: number; p?: number; c?: number; f?: number }>({})
  const [price, setPrice] = useState<number>()
  const create = () =>
    safe(async () => {
      if (!name.trim() || !grams || m.kcal === undefined) throw new Error('الاسم والجرامات والسعرات مطلوبين')
      const k = 100 / grams
      const r = (v?: number) => Number(((v ?? 0) * k).toFixed(1))
      const food: Food = { id: newFoodId(), name: name.trim(), per100: { kcal: Math.round(m.kcal * k), p: r(m.p), c: r(m.c), f: r(m.f) }, serving: { label: label.trim() || 'حصة', grams }, custom: true, ...(price ? { price } : {}) }
      await saveFood(food)
      onCreated(food)
    }, 'الأكلة اتحفظت ✅')
  return (
    <div className="glass space-y-3 p-4">
      <input className="w-full" placeholder="اسم الأكلة" value={name} onChange={(e) => setName(e.target.value)} aria-label="اسم الأكلة الجديدة" />
      <div className="grid grid-cols-2 gap-2 text-xs text-muted">
        <label className="space-y-1">اسم الحصة<input className="block w-full" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="اسم الحصة" /></label>
        <label className="space-y-1">وزن الحصة (جم)<NumberInput ariaLabel="وزن الحصة" value={grams} onChange={(v) => setGrams(v ?? 0)} /></label>
      </div>
      <p className="text-xs text-muted">القيم للحصة الواحدة (من على الكيس أو تقديرك):</p>
      <div className="grid grid-cols-4 gap-2 text-xs text-muted">
        {(['kcal', 'p', 'c', 'f'] as const).map((k) => (
          <label key={k} className="space-y-1">{{ kcal: 'سعرات', p: 'بروتين', c: 'كارب', f: 'دهون' }[k]}<NumberInput ariaLabel={`حصة ${k}`} value={m[k]} onChange={(v) => setM({ ...m, [k]: v })} /></label>
        ))}
      </div>
      <label className="block space-y-1 text-xs text-muted">سعر الحصة (اختياري)<NumberInput ariaLabel="سعر الحصة" value={price} onChange={setPrice} /></label>
      <Button className="w-full" onClick={create}>حفظ الأكلة</Button>
    </div>
  )
}

export function FoodPicker({ slot, date, foods, onClose }: { slot: MealSlot; date: string; foods: Food[]; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('list')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Food>()
  const [recent, setRecent] = useState<string[]>([])
  useEffect(() => { void recentFoodIds().then(setRecent) }, [])

  const list = useMemo(() => {
    const term = q.trim()
    const filtered = term ? foods.filter((f) => f.name.includes(term)) : foods
    const rank = (f: Food) => (recent.includes(f.id) ? recent.indexOf(f.id) : 100 + (f.custom ? 0 : 1))
    return [...filtered].sort((a, b) => rank(a) - rank(b))
  }, [foods, q, recent])

  if (picked) return <Amount food={picked} slot={slot} date={date} onDone={onClose} onBack={() => setPicked(undefined)} />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pt-safe">
        <h1 className="text-2xl font-bold">ضيف لـ {SLOT_AR[slot]}</h1>
        <button type="button" onClick={onClose} className="text-sm text-accent">إلغاء</button>
      </div>
      <Segmented<Mode> options={[{ value: 'list', label: 'الأكلات' }, { value: 'quick', label: 'سريع' }, { value: 'custom', label: 'أكلة جديدة' }]} value={mode} onChange={setMode} />
      {mode === 'quick' && <QuickAdd slot={slot} date={date} onDone={onClose} />}
      {mode === 'custom' && <CustomFood onCreated={(f) => { setMode('list'); setPicked(f) }} />}
      {mode === 'list' && (
        <>
          <label className="glass-strong flex items-center gap-2 rounded-2xl px-3">
            <Icon.search />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر: فول، بيض، فراخ..." className="w-full border-0 bg-transparent px-0" aria-label="دوّر على أكلة" />
          </label>
          <ul className="glass divide-y divide-white/70 overflow-hidden p-0">
            {list.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => setPicked(f)} className="flex w-full items-center gap-3 px-4 py-3 text-right active:bg-white/60">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{f.name}{recent.includes(f.id) ? ' 🕘' : ''}{f.custom ? ' ✏️' : ''}</span>
                    <span className="block text-xs text-muted">{f.serving.label} ({f.serving.grams} جم): {Math.round(f.per100.kcal * f.serving.grams / 100)} سعرة • {fmtNum(f.per100.p * f.serving.grams / 100)} بروتين</span>
                  </span>
                  {f.price !== undefined && <span className="text-xs text-muted">{f.price} ج</span>}
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="p-6 text-center text-sm text-muted">مفيش — جرّب "أكلة جديدة"</li>}
          </ul>
        </>
      )}
    </div>
  )
}
