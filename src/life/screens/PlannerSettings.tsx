import { useState, type ReactNode } from 'react'
import { saveSettings } from '../db/repo'
import type { AccountabilityLevel, LifeSettings, ReminderKind } from '../domain/types'
import { DEFAULT_SETTINGS } from '../domain/types'
import { notificationsSupported, requestNotifications } from '../lib/reminderEngine'
import { useLife } from '../state'
import { Button } from '../../ui/primitives'
import { useSafe, useToast } from '../../ui/Toast'
import { fromTimeInput, toTimeInput, WEEKDAY_NAMES, WEEKDAY_SHORT } from '../ui/format'
import { CommitText, Field, Header, Section } from '../ui/kit'

const REMINDER_LABEL: Record<ReminderKind, string> = {
  before_start: 'قبل بداية المهمة', start: 'عند البداية', followup: 'متابعة بعد الانتهاء', overdue: 'تجاوز الموعد', commitment: 'الالتزامات الثابتة',
  morning: 'ملخص الصباح', evening: 'مراجعة المساء', overload: 'تراكم المهام', deadline: 'موعد نهائي قريب',
}
const LEVEL: Record<AccountabilityLevel, { label: string; sub: string }> = {
  calm: { label: 'هادئة', sub: 'بداية المهام والالتزامات وملخصين في اليوم' },
  balanced: { label: 'متوازنة', sub: '+ تذكير قبلها ومتابعة بعدها وتنبيه التراكم' },
  firm: { label: 'حازمة', sub: '+ تنبيه لو الجلسة عدّت والمهمة لسه مفتوحة' },
}

export function PlannerSettings() {
  const { data } = useLife()
  const safe = useSafe()
  const toast = useToast()
  const s = data.settings
  const [perm, setPerm] = useState(() => (notificationsSupported() ? Notification.permission : 'unsupported'))
  const set = (p: Partial<LifeSettings>) => void safe(() => saveSettings(p))
  const time = (k: keyof LifeSettings, label: string) => (
    <Field label={label}><input type="time" className="ltr w-full" value={toTimeInput(s[k] as number)} onChange={(e) => e.target.value && set({ [k]: fromTimeInput(e.target.value) })} /></Field>
  )
  const num = (k: keyof LifeSettings, label: string, hint?: ReactNode, scale = 1) => (
    <Field label={label} hint={hint}>
      <CommitText ariaLabel={label} className="ltr" value={String(Math.round((s[k] as number) * scale * 100) / 100)} onCommit={(v) => { const n = Number(v); if (Number.isFinite(n) && n >= 0) set({ [k]: n / scale }) }} />
    </Field>
  )
  return (
    <div className="space-y-4 pb-8">
      <Header back title="التخطيط والتذكير" sub="كل القواعد هنا بتتغير من غير تعديل كود" />

      <Section title="يومك">
        <div className="glass space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            {time('dayStartMin', 'بداية يوم الشغل')}
            {time('dayEndMin', 'نهاية يوم الشغل')}
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold text-muted">أيام راحة ثابتة (بدون مهام مرنة)</span>
            <div className="flex gap-1">
              {[6, 0, 1, 2, 3, 4, 5].map((d) => (
                <button key={d} type="button" aria-label={WEEKDAY_NAMES[d]} aria-pressed={s.restWeekdays.includes(d)}
                  onClick={() => set({ restWeekdays: s.restWeekdays.includes(d) ? s.restWeekdays.filter((x) => x !== d) : [...s.restWeekdays, d] })}
                  className={`h-10 flex-1 rounded-xl text-sm ${s.restWeekdays.includes(d) ? 'bg-accent2 text-white' : 'bg-white/70 text-muted'}`}>{WEEKDAY_SHORT[d]}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold text-muted">شكل الساعة</span>
            <div className="grid grid-cols-2 gap-1.5">
              {([['12h', '12 ساعة (2:30 م)'], ['24h', '24 ساعة (14:30)']] as const).map(([c, label]) => (
                <button key={c} type="button" aria-pressed={s.clock === c} onClick={() => set({ clock: c })}
                  className={`h-10 rounded-xl text-sm ${s.clock === c ? 'bg-ink text-white' : 'bg-white/70 text-muted'}`}>{label}</button>
              ))}
            </div>
          </div>
          <Field label="أول يوم في الأسبوع">
            <select className="w-full" value={s.weekStartsOn} onChange={(e) => set({ weekStartsOn: Number(e.target.value) })}>
              {[6, 0, 1].map((d) => <option key={d} value={d}>{WEEKDAY_NAMES[d]}</option>)}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="محرك الجدولة">
        <div className="glass grid grid-cols-2 gap-3 p-4">
          {num('bufferPct', 'هامش الطوارئ %', 'جزء من الوقت الفاضي ميتملاش', 100)}
          {num('gapMin', 'فاصل بين المهام (د)')}
          {num('defaultSessionMin', 'أقصى جلسة (د)', 'المهام الأطول بتتقسم')}
          {num('minChunkMin', 'أصغر جلسة (د)')}
          {num('maxDeepMinPerDay', 'أقصى تركيز عميق/يوم (د)')}
          <Field label="التركيز العميق من" hint="فاضي = أي وقت في اليوم">
            <input type="time" aria-label="بداية التركيز العميق" className="ltr w-full" value={s.deepStartMin === undefined ? '' : toTimeInput(s.deepStartMin)}
              onChange={(e) => set({ deepStartMin: e.target.value ? fromTimeInput(e.target.value) : undefined, ...(e.target.value ? {} : { deepEndMin: undefined }) })} />
          </Field>
          <Field label="لحد">
            <input type="time" aria-label="نهاية التركيز العميق" className="ltr w-full" value={s.deepEndMin === undefined ? '' : toTimeInput(s.deepEndMin)}
              onChange={(e) => set({ deepEndMin: e.target.value ? fromTimeInput(e.target.value) : undefined })} />
          </Field>
          {num('defaultEstimateMin', 'مدة افتراضية (د)', 'للمهام بدون تقدير')}
          {num('roughFactor', 'معامل التقدير التقريبي', 'مثلًا 1.25 = +25%')}
          {num('planHorizonDays', 'أفق التخطيط (أيام)')}
        </div>
      </Section>

      <Section title="أوزان الأولوية" action={<button type="button" className="text-xs text-accent" onClick={() => set({ weights: DEFAULT_SETTINGS.weights })}>الافتراضي</button>}>
        <div className="glass space-y-2 p-4">
          {([['importance', 'الأهمية'], ['urgency', 'قرب الموعد'], ['blocking', 'بتعطّل مهام تانية'], ['delay', 'اتأجلت قبل كده']] as const).map(([k, label]) => (
            <label key={k} className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0">{label}</span>
              <input type="range" min={0} max={1} step={0.05} className="flex-1" value={s.weights[k]} onChange={(e) => set({ weights: { ...s.weights, [k]: Number(e.target.value) } })} />
              <span className="w-10 text-left num">{Math.round(s.weights[k] * 100)}</span>
            </label>
          ))}
          <p className="text-[11px] text-muted">الأولوية = متوسط موزون للعوامل الأربعة (0–100). تقدر تثبّت أولوية يدوية لأي مهمة من شاشتها.</p>
        </div>
      </Section>

      <Section title="المتابعة والتذكير">
        <div className="glass space-y-3 p-4">
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(LEVEL) as AccountabilityLevel[]).map((l) => (
              <button key={l} type="button" aria-pressed={s.accountability === l} onClick={() => set({ accountability: l })}
                className={`rounded-2xl p-2 text-right ${s.accountability === l ? 'bg-ink text-white' : 'bg-white/70'}`}>
                <div className="text-sm font-semibold">{LEVEL[l].label}</div>
                <div className={`text-[10.5px] leading-snug ${s.accountability === l ? 'text-white/75' : 'text-muted'}`}>{LEVEL[l].sub}</div>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {num('remindBeforeMin', 'التذكير قبلها بـ (د)')}
            {num('snoozeMin', 'التأجيل (د)')}
            {time('morningSummaryMin', 'ملخص الصباح')}
            {time('eveningReviewMin', 'مراجعة المساء')}
            {time('quietStartMin', 'بداية الهدوء')}
            {time('quietEndMin', 'نهاية الهدوء')}
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold text-muted">أنواع موقوفة</span>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(REMINDER_LABEL) as ReminderKind[]).map((k) => {
                const off = s.disabledReminderKinds.includes(k)
                return (
                  <button key={k} type="button" aria-pressed={!off} onClick={() => set({ disabledReminderKinds: off ? s.disabledReminderKinds.filter((x) => x !== k) : [...s.disabledReminderKinds, k] })}
                    className={`rounded-full px-3 py-1 text-xs ${off ? 'bg-white/50 text-muted line-through' : 'bg-accent/12 text-accent'}`}>{REMINDER_LABEL[k]}</button>
                )
              })}
            </div>
          </div>
          <Field label="تصنيفات بدون تذكير (مفصولة بفاصلة)">
            <CommitText ariaLabel="تصنيفات بدون تذكير" value={s.mutedCategories.join('، ')} onCommit={(v) => set({ mutedCategories: v.split(/[,،]/).map((x) => x.trim()).filter(Boolean) })} />
          </Field>
          <div className="space-y-2 rounded-2xl bg-white/60 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span>إشعارات النظام: <b>{perm === 'granted' ? 'مفعّلة' : perm === 'denied' ? 'مرفوضة' : perm === 'unsupported' ? 'غير مدعومة هنا' : 'مش مفعّلة'}</b></span>
              {perm === 'default' && <Button variant="soft" className="px-3 py-1.5 text-sm" onClick={() => void safe(async () => { const r = await requestNotifications(); setPerm(r); if (r === 'granted') toast('الإشعارات اتفعلت') })}>فعّل</Button>}
            </div>
            <p className="text-[11px] leading-relaxed text-muted">على الآيفون: لازم التطبيق يكون مثبّت على الشاشة الرئيسية (iOS 16.4+). الإشعارات بتتبعت طول ما التطبيق شغال أو لسه في الخلفية؛ iOS بيوقف تطبيقات الويب بعد شوية. للتنبيه المضمون والتطبيق مقفول: من «الخطة» ← «للتقويم» صدّر الأسبوع لتقويم الآيفون. إشعارات Push من سيرفر مش مفعّلة (محتاجة خدمة خارجية).</p>
          </div>
        </div>
      </Section>

      <Section title="جلسات التركيز">
        <div className="glass grid grid-cols-2 gap-3 p-4">
          {num('focusWorkMin', 'مدة التركيز (د)')}
          {num('focusBreakMin', 'مدة الاستراحة (د)')}
        </div>
      </Section>
    </div>
  )
}
