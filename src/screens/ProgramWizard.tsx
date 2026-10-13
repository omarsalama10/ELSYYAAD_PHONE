import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addProgram } from '../db/repo'
import { buildProgram, estimateDayMinutes, type BGoal, type BuilderInput, type Equipment, type Experience, type Focus, type Limitation } from '../domain/builder'
import { useExercises } from '../lib/hooks'
import { Icon } from '../ui/icons'
import { Bare } from '../ui/Layout'
import { Button, Card } from '../ui/primitives'
import { useSafe } from '../ui/Toast'
import { Segmented } from '../ui/viz'

const GOALS: { value: BGoal; label: string; hint: string }[] = [
  { value: 'hypertrophy', label: 'تضخيم', hint: '6-10 عدات للأساسي و10-15 للمساعد' },
  { value: 'strength', label: 'قوة', hint: '4-6 عدات وراحة أطول' },
  { value: 'recomp', label: 'ريكومب', hint: 'عضل ودهون مع بعض' },
  { value: 'fatloss', label: 'تنشيف', hint: 'عدات أعلى وراحة أقل وكارديو أطول' },
]
const EXPERIENCE: { value: Experience; label: string }[] = [
  { value: 'beginner', label: 'مبتدئ' }, { value: 'returning', label: 'راجع' }, { value: 'intermediate', label: 'متوسط' }, { value: 'advanced', label: 'متقدم' },
]
const EQUIPMENT: { value: Equipment; label: string }[] = [
  { value: 'gym', label: 'جيم كامل' }, { value: 'dumbbells', label: 'دمبلز وبنش' }, { value: 'bodyweight', label: 'وزن الجسم' },
]
const FOCUS: { value: Focus; label: string }[] = [
  { value: 'forearms', label: 'ساعد وقبضة' }, { value: 'arms', label: 'دراع' }, { value: 'legs', label: 'رجل' }, { value: 'back', label: 'ظهر' },
  { value: 'chest', label: 'صدر' }, { value: 'shoulders', label: 'كتف' }, { value: 'abs', label: 'بطن' }, { value: 'glutes', label: 'مؤخرة' },
]
const LIMITS: { value: Limitation; label: string }[] = [
  { value: 'knee', label: 'ركبة' }, { value: 'lowerback', label: 'أسفل الظهر' }, { value: 'shoulder', label: 'كتف' },
]

function Chips<T extends string>({ options, values, onToggle, label }: { options: { value: T; label: string }[]; values: T[]; onToggle: (v: T) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((o) => {
        const on = values.includes(o.value)
        return <button key={o.value} type="button" aria-pressed={on} onClick={() => onToggle(o.value)} className={`rounded-full px-3 py-1.5 text-sm ${on ? 'bg-accent text-white shadow-lift' : 'bg-white/70 text-muted'}`}>{on ? '✓ ' : ''}{o.label}</button>
      })}
    </div>
  )
}

export function ProgramWizard() {
  const nav = useNavigate()
  const safe = useSafe()
  const exercises = useExercises()
  const [input, setInput] = useState<BuilderInput>({
    goal: 'hypertrophy', experience: 'returning', days: 3, minutes: 90, equipment: 'gym',
    focus: ['forearms'], limitations: [], posture: true, cardio: true,
  })
  const set = (patch: Partial<BuilderInput>) => setInput((x) => ({ ...x, ...patch }))
  const toggle = <K extends 'focus' | 'limitations'>(k: K, v: BuilderInput[K][number]) =>
    setInput((x) => ({ ...x, [k]: (x[k] as string[]).includes(v) ? (x[k] as string[]).filter((y) => y !== v) : [...(x[k] as string[]), v] }))

  const preview = useMemo(() => (exercises ? buildProgram(input, exercises, Date.now()) : undefined), [input, exercises])
  if (!exercises || !preview) return null

  const adopt = () => safe(async () => {
    await addProgram(buildProgram(input, exercises, Date.now()))
    nav('/workouts')
  }, 'البرنامج الجديد اتفعّل ✅ — القديم محفوظ وتقدر ترجعله')

  return (
    <Bare>
      <div className="flex items-center gap-3 pb-4 pt-safe">
        <button type="button" onClick={() => nav(-1)} aria-label="رجوع" className="glass-strong flex h-10 w-10 items-center justify-center rounded-2xl text-muted"><Icon.back /></button>
        <h1 className="text-2xl font-bold">ابني برنامجك</h1>
      </div>
      <div className="space-y-4">
        <Card className="space-y-2">
          <h2 className="font-semibold">هدفك</h2>
          {GOALS.map((g) => (
            <button key={g.value} type="button" onClick={() => set({ goal: g.value })} className={`block w-full rounded-2xl px-3 py-2.5 text-right ${input.goal === g.value ? 'bg-accent text-white shadow-lift' : 'bg-white/70'}`}>
              <span className="block text-sm font-semibold">{g.label}</span>
              <span className={`block text-xs ${input.goal === g.value ? 'text-white/85' : 'text-muted'}`}>{g.hint}</span>
            </button>
          ))}
        </Card>

        <Card className="space-y-3">
          <div><h2 className="mb-2 font-semibold">خبرتك</h2><Segmented options={EXPERIENCE} value={input.experience} onChange={(experience) => set({ experience })} /></div>
          <div><h2 className="mb-2 font-semibold">أيام في الأسبوع</h2><Segmented options={[2, 3, 4, 5, 6].map((d) => ({ value: String(d), label: String(d) }))} value={String(input.days)} onChange={(d) => set({ days: Number(d) })} /></div>
          <div><h2 className="mb-2 font-semibold">مدة التمرين (دقيقة)</h2><Segmented options={[45, 60, 75, 90].map((m) => ({ value: String(m), label: String(m) }))} value={String(input.minutes)} onChange={(m) => set({ minutes: Number(m) })} /></div>
          <div><h2 className="mb-2 font-semibold">الأجهزة المتاحة</h2><Segmented options={EQUIPMENT} value={input.equipment} onChange={(equipment) => set({ equipment })} /></div>
        </Card>

        <Card className="space-y-3">
          <div><h2 className="mb-2 font-semibold">عضلات عايز تركز عليها</h2><Chips label="التركيز" options={FOCUS} values={input.focus} onToggle={(v) => toggle('focus', v)} /></div>
          <div><h2 className="mb-1 font-semibold">إصابات أو ألم مزمن</h2><p className="mb-2 text-xs text-muted">هنشيل التمارين اللي بتضغط على المكان ده ونحط بدايل أأمن.</p><Chips label="القيود" options={LIMITS} values={input.limitations} onToggle={(v) => toggle('limitations', v)} /></div>
          <label className="flex items-center justify-between text-sm"><span>تعديل وضع الظهر (إحماء + سحب أكتر من الدفع)</span><input type="checkbox" className="h-6 w-6 accent-[#1f8f76]" checked={input.posture} onChange={(e) => set({ posture: e.target.checked })} aria-label="تعديل وضع الظهر" /></label>
          <label className="flex items-center justify-between text-sm"><span>كارديو في آخر كل تمرين</span><input type="checkbox" className="h-6 w-6 accent-[#1f8f76]" checked={input.cardio} onChange={(e) => set({ cardio: e.target.checked })} aria-label="كارديو" /></label>
        </Card>

        <section className="glass space-y-3 p-4" data-testid="wizard-preview" aria-label="معاينة البرنامج">
          <h2 className="font-semibold">{preview.name}</h2>
          {preview.days.map((d) => (
            <div key={d.id}>
              <div className="flex justify-between text-sm"><b>{d.name}</b><span className="text-xs text-muted">≈ {estimateDayMinutes(d, exercises)} د</span></div>
              <p className="text-xs leading-relaxed text-muted">{d.blocks.filter((b) => b.section === 'main' || b.section === 'finisher').map((b) => exercises.get(b.exerciseId)?.nameAr).join(' • ')}</p>
            </div>
          ))}
        </section>
        <Button className="w-full" onClick={adopt}>اعتمد البرنامج ده</Button>
        <p className="text-center text-[11px] text-muted">برنامجك الحالي هيفضل محفوظ، وتقدر ترجعله من صفحة البرنامج. وتقدر تعدّل أي تمرين بعد كده.</p>
      </div>
    </Bare>
  )
}
