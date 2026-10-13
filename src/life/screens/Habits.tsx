import { useState } from 'react'
import { createHabit, markHabit, updateHabit } from '../db/repo'
import { habitStats, isScheduled } from '../domain/habits'
import { addDays } from '../domain/time'
import type { Habit, HabitSchedule } from '../domain/types'
import { useLife } from '../state'
import { Button } from '../../ui/primitives'
import { useSafe } from '../../ui/Toast'
import { WEEKDAY_NAMES, WEEKDAY_SHORT } from '../ui/format'
import { LI } from '../ui/icons'
import { Empty, Field, Header, IconBtn, Sheet } from '../ui/kit'

export function HabitsScreen() {
  const { data, today } = useLife()
  const safe = useSafe()
  const [edit, setEdit] = useState<Partial<Habit> | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const habits = data.habits.filter((h) => h.archived === showArchived).sort((a, b) => a.order - b.order)
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13))
  const marks = new Map(data.habitLogs.map((l) => [`${l.habitId}|${l.day}`, l.mark]))
  return (
    <div className="space-y-3">
      <Header back title="العادات" sub="يوم فائت مش نهاية السلسلة — يومين ورا بعض بس اللي بيقطعوها" action={<IconBtn label="عادة جديدة" tone="accent" onClick={() => setEdit({ title: '', schedule: { type: 'daily' } })}>{LI.plus()}</IconBtn>} />
      {habits.length === 0 ? <Empty action={!showArchived ? <Button variant="soft" onClick={() => setEdit({ title: '', schedule: { type: 'daily' } })}>+ عادة</Button> : undefined}>{showArchived ? 'مفيش عادات مؤرشفة.' : 'ضيف عادة يومية أو أسبوعية (قراءة، نوم بدري، رياضة 3 مرات…).'}</Empty> : habits.map((h) => {
        const st = habitStats(h, data.habitLogs, today, data.settings.weekStartsOn)
        return (
          <div key={h.id} className="glass space-y-3 p-4" data-testid="habit">
            <div className="flex items-center gap-2">
              <button type="button" className="min-w-0 flex-1 text-right" onClick={() => setEdit(h)}>
                <div className="truncate font-semibold">{h.title}</div>
                <div className="text-xs text-muted">{h.schedule.type === 'daily' ? 'يوميًا' : h.schedule.type === 'weekly' ? h.schedule.weekdays.map((d) => WEEKDAY_NAMES[d]).join('، ') : `${h.schedule.times} مرات في الأسبوع`}</div>
              </button>
              {isScheduled(h, today) && (
                <button type="button" onClick={() => void safe(() => markHabit(h.id, today))} aria-label={`سجّل ${h.title} النهارده`}
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl ${st.todayMark === 'done' ? 'bg-accent text-white' : st.todayMark === 'skipped' ? 'bg-white/50 text-muted' : 'bg-white/80 text-ink/30'}`}>
                  {st.todayMark === 'skipped' ? '—' : LI.check()}
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl bg-white/60 p-2"><div className="text-muted">السلسلة</div><div className="text-base font-bold num">🔥 {st.current} {st.unit === 'week' ? 'أسبوع' : ''}</div></div>
              <div className="rounded-xl bg-white/60 p-2"><div className="text-muted">الأفضل</div><div className="text-base font-bold num">{st.best}</div></div>
              <div className="rounded-xl bg-white/60 p-2"><div className="text-muted">{st.unit === 'week' ? 'آخر 4 أسابيع' : 'آخر 30 يوم'}</div><div className="text-base font-bold num">{st.rate30 === null ? '—' : `${Math.round(st.rate30 * 100)}%`}</div></div>
            </div>
            {st.weekDone !== undefined && h.schedule.type === 'timesPerWeek' && <p className="text-xs text-muted num">الأسبوع ده: {st.weekDone}/{h.schedule.times}</p>}
            <div className="flex justify-between gap-0.5" aria-label="آخر 14 يوم">
              {days.map((d) => {
                const m = marks.get(`${h.id}|${d}`)
                const sched = isScheduled(h, d)
                return (
                  <button key={d} type="button" aria-label={`${d}: ${m === 'done' ? 'تم' : m === 'skipped' ? 'معذور' : 'لا'}`} onClick={() => void safe(() => markHabit(h.id, d))}
                    className={`h-6 flex-1 rounded-md ${m === 'done' ? 'bg-accent' : m === 'skipped' ? 'bg-ink/15' : sched ? 'bg-white/80 ring-1 ring-ink/10' : 'bg-transparent'}`} />
                )
              })}
            </div>
            <p className="text-[10.5px] text-muted">اضغط مربع: تم ← معذور (راحة/سفر، مبيقطعش السلسلة) ← فاضي.</p>
          </div>
        )
      })}
      <button type="button" className="w-full text-center text-sm text-muted underline" onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'العادات النشطة' : 'المؤرشفة'}</button>
      {edit && <HabitSheet value={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function HabitSheet({ value, onClose }: { value: Partial<Habit>; onClose: () => void }) {
  const safe = useSafe()
  const [title, setTitle] = useState(value.title ?? '')
  const [schedule, setSchedule] = useState<HabitSchedule>(value.schedule ?? { type: 'daily' })
  const save = () => safe(async () => {
    if (!title.trim()) throw new Error('اكتب اسم العادة')
    if (value.id) await updateHabit(value.id, { title: title.trim(), schedule })
    else await createHabit({ title: title.trim(), schedule })
    onClose()
  })
  const wd = schedule.type === 'weekly' ? schedule.weekdays : []
  return (
    <Sheet open onClose={onClose} title={value.id ? 'تعديل عادة' : 'عادة جديدة'} footer={
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => void save()}>حفظ</Button>
        {value.id && <Button variant="soft" onClick={() => void safe(async () => { await updateHabit(value.id!, { archived: !value.archived }); onClose() })}>{value.archived ? 'استرجاع' : 'أرشفة'}</Button>}
      </div>
    }>
      <Field label="العادة"><input autoFocus className="w-full" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="قراءة 20 دقيقة" /></Field>
      <Field label="التكرار">
        <select className="w-full" value={schedule.type} onChange={(e) => {
          const t = e.target.value
          setSchedule(t === 'weekly' ? { type: 'weekly', weekdays: [0, 2, 4] } : t === 'timesPerWeek' ? { type: 'timesPerWeek', times: 3 } : { type: 'daily' })
        }}>
          <option value="daily">كل يوم</option><option value="weekly">أيام محددة</option><option value="timesPerWeek">عدد مرات في الأسبوع</option>
        </select>
      </Field>
      {schedule.type === 'weekly' && (
        <div className="flex gap-1">
          {[6, 0, 1, 2, 3, 4, 5].map((d) => (
            <button key={d} type="button" aria-pressed={wd.includes(d)} aria-label={WEEKDAY_NAMES[d]}
              onClick={() => { const w = wd.includes(d) ? wd.filter((x) => x !== d) : [...wd, d]; if (w.length) setSchedule({ type: 'weekly', weekdays: w.sort() }) }}
              className={`h-10 flex-1 rounded-xl text-sm ${wd.includes(d) ? 'bg-accent text-white' : 'bg-white/70 text-muted'}`}>{WEEKDAY_SHORT[d]}</button>
          ))}
        </div>
      )}
      {schedule.type === 'timesPerWeek' && (
        <Field label="مرات في الأسبوع"><input type="number" min={1} max={7} className="ltr w-full" value={schedule.times} onChange={(e) => setSchedule({ type: 'timesPerWeek', times: Math.min(7, Math.max(1, Number(e.target.value))) })} /></Field>
      )}
    </Sheet>
  )
}
