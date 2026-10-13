import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { deleteCommitment, saveCommitment, toggleCommitmentSkip } from '../db/repo'
import { buildICS } from '../domain/ics'
import { whatIf, type Scenario, type WhatIfResult } from '../domain/scheduler'
import { addDays, fmtMinutes, minuteOfDay } from '../domain/time'
import type { Commitment, CommitmentKind, DayKey, PlanBlock } from '../domain/types'
import { useLife } from '../state'
import { Button } from '../../ui/primitives'
import { useSafe, useToast } from '../../ui/Toast'
import { dayLabel, fmtTime, fmtTimeRange, fmtWhen, fromTimeInput, KIND_LABEL, toTimeInput, WEEKDAY_NAMES, WEEKDAY_SHORT } from '../ui/format'
import { LI } from '../ui/icons'
import { Bar, Chip, deliverFile, Empty, Field, Header, IconBtn, Sheet, Tabs } from '../ui/kit'
import { BlockSheet, PlanReviewSheet, usePlanActions } from '../ui/planActions'
import { DayTimeline } from '../ui/timeline'

type Tab = 'week' | 'day' | 'commitments' | 'whatif'

export function PlanScreen() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'week'
  return (
    <div className="space-y-4">
      <Header title="الخطة" sub="المحرك المحلي بيوزّع المهام المرنة حوالين التزاماتك الثابتة" />
      <Tabs<Tab> value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} tabs={[
        { value: 'week', label: 'الأسبوع' }, { value: 'day', label: 'يوم' }, { value: 'commitments', label: 'الالتزامات الثابتة' }, { value: 'whatif', label: 'ماذا لو؟' },
      ]} />
      {tab === 'week' && <WeekView />}
      {tab === 'day' && <DayView />}
      {tab === 'commitments' && <Commitments />}
      {tab === 'whatif' && <WhatIf />}
    </div>
  )
}

function WeekView() {
  const life = useLife()
  const { proposal, today, data } = life
  const safe = useSafe()
  const toast = useToast()
  const [review, setReview] = useState(false)
  const [block, setBlock] = useState<PlanBlock | null>(null)
  const days = proposal.days.slice(0, 7)
  const approvedCount = days.filter((d) => life.isApproved(d)).length

  const exportIcs = () => safe(async () => {
    const blocks = days.flatMap((d) => life.blocksFor(d))
    const ics = buildICS(blocks, { now: Date.now(), alarmMin: data.settings.remindBeforeMin, calendarName: 'ELSYYAAD — الخطة' })
    const r = await deliverFile(new File([ics], `elsyyaad-plan-${today}.ics`, { type: 'text/calendar' }))
    if (r !== 'cancelled') toast('افتح الملف واختار Add All عشان التنبيهات تشتغل حتى والتطبيق مقفول')
  })

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => setReview(true)}>{approvedCount ? 'إعادة جدولة الأسبوع' : 'اعتمد خطة الأسبوع'}</Button>
        <Button variant="soft" onClick={() => void exportIcs()} aria-label="تصدير للتقويم">📅 للتقويم</Button>
      </div>
      {proposal.overload && (
        <div className="rounded-2xl bg-danger/10 p-3 text-sm text-danger">
          ⚠️ المطلوب لحد {dayLabel(proposal.overload.day, today)} محتاج {fmtMinutes(proposal.overload.demandMin)} والمتاح {fmtMinutes(proposal.overload.capacityMin)} بس. المحرك مش هيحشر أكتر من وقتك — قرر: قلل النطاق، حرّك موعد، أو ألغِ التزام.
        </div>
      )}
      {days.map((day) => {
        const cap = proposal.capacity.find((c) => c.day === day)!
        const blocks = life.blocksFor(day)
        const planned = blocks.filter((b) => b.kind !== 'commitment').reduce((a, b) => a + b.endMin - b.startMin, 0)
        const load = cap.freeMin + cap.pinnedMin ? planned / (cap.freeMin + cap.pinnedMin) : 0
        return (
          <section key={day} className="glass space-y-2 p-3.5" data-testid={`week-day-${day}`}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{dayLabel(day, today)}</h3>
              <div className="flex items-center gap-1.5">
                {cap.rest && <Chip tone="coral">راحة</Chip>}
                {life.isApproved(day) ? <Chip tone="accent">معتمدة</Chip> : <Chip>مقترحة</Chip>}
                <span className="text-xs text-muted num">{fmtMinutes(planned)} / {fmtMinutes(cap.freeMin + cap.pinnedMin)}</span>
              </div>
            </div>
            <Bar value={load} tone={load > 0.9 ? 'danger' : load > 0.8 ? 'warn' : 'accent'} label={`حمل ${dayLabel(day, today)}`} />
            {blocks.length === 0 ? <p className="text-xs text-muted">فاضي</p> : (
              <ul className="space-y-1">
                {blocks.map((b) => {
                  const st = life.blockState(b)
                  return (
                    <li key={b.id}>
                      <button type="button" onClick={() => setBlock(b)} className="flex w-full items-center gap-2 rounded-xl px-1.5 py-1 text-right text-sm active:bg-white/60">
                        <span className="ltr w-14 shrink-0 text-xs text-muted num">{fmtTime(b.startMin)}</span>
                        <span className={`h-2 w-2 shrink-0 rounded-full ${b.kind === 'commitment' ? 'bg-ink/30' : st === 'done' ? 'bg-accent' : st === 'missed' ? 'bg-danger' : 'bg-accent2'}`} />
                        <span className={`flex-1 truncate ${st === 'done' ? 'text-muted line-through' : ''}`}>{b.title}{b.parts && b.parts > 1 ? ` (${b.part}/${b.parts})` : ''}</span>
                        <span className="shrink-0 text-[11px] text-muted">{fmtMinutes(b.endMin - b.startMin)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
      <p className="text-[11px] leading-relaxed text-muted">📅 «للتقويم» بيصدّر الأسبوع كملف ICS بتنبيه قبل كل بلوك بـ {data.settings.remindBeforeMin} دقيقة. ده الطريق المضمون للتنبيهات على الآيفون والتطبيق مقفول. لو غيّرت الخطة صدّر تاني (الأحداث بنفس المعرّف بتتحدث).</p>
      <PlanReviewSheet open={review} onClose={() => setReview(false)} days={days} />
      <BlockSheet block={block} onClose={() => setBlock(null)} />
    </div>
  )
}

function DayView() {
  const life = useLife()
  const safe = useSafe()
  const actions = usePlanActions()
  const [day, setDay] = useState(life.today)
  const [block, setBlock] = useState<PlanBlock | null>(null)
  const [review, setReview] = useState(false)
  const s = life.data.settings
  const blocks = life.blocksFor(day)
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <IconBtn label="اليوم السابق" onClick={() => setDay(addDays(day, -1))}>{LI.back('h-5 w-5')}</IconBtn>
        <input type="date" aria-label="اليوم" className="flex-1 text-center" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        <IconBtn label="اليوم التالي" onClick={() => setDay(addDays(day, 1))}>{LI.back('h-5 w-5 rotate-180')}</IconBtn>
      </div>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{dayLabel(day, life.today)}</h3>
        {day >= life.today && day < addDays(life.today, s.planHorizonDays) && (
          <Button variant="soft" className="py-1.5 text-sm" onClick={() => setReview(true)}>{life.isApproved(day) ? 'أعد الجدولة' : 'اعتمد'}</Button>
        )}
      </div>
      {blocks.length === 0 ? <Empty>مفيش بلوكات اليوم ده.</Empty> : (
        <DayTimeline day={day} blocks={blocks} stateOf={life.blockState} startMin={s.dayStartMin} endMin={s.dayEndMin} now={life.now} isToday={day === life.today}
          onTap={setBlock} onMove={(b, m) => void safe(() => actions.moveBlock(b, m, day))} />
      )}
      <PlanReviewSheet open={review} onClose={() => setReview(false)} days={[day]} />
      <BlockSheet block={block} onClose={() => setBlock(null)} />
    </div>
  )
}

// ---------- commitments ----------

const KINDS: CommitmentKind[] = ['work', 'class', 'appointment', 'meal', 'gym', 'prayer', 'sleep', 'other']

function Commitments() {
  const { data, today } = useLife()
  const [edit, setEdit] = useState<Partial<Commitment> | null>(null)
  const list = data.commitments.filter((c) => !c.deletedAt).sort((a, b) => a.startMin - b.startMin)
  const rep = (c: Commitment) => c.repeat.type === 'once' ? dayLabel(c.repeat.day, today) : c.repeat.type === 'daily' ? 'يوميًا' : c.repeat.weekdays.map((d) => WEEKDAY_NAMES[d]).join('، ')
  return (
    <div className="space-y-3">
      <Button className="w-full" onClick={() => setEdit({ title: '', kind: 'work', startMin: 9 * 60, endMin: 17 * 60, repeat: { type: 'weekly', weekdays: [0, 1, 2, 3, 4] }, skipDays: [] })}>+ التزام ثابت</Button>
      <p className="px-1 text-xs leading-relaxed text-muted">الالتزامات الثابتة (شغل، محاضرات، مواعيد، جيم) بيتشال وقتها من السعة قبل أي جدولة، والمحرك عمره ما بيحركها. تقدر تلغي مرة واحدة من الجدول نفسه.</p>
      {list.length === 0 ? <Empty>مفيش التزامات لسه.</Empty> : list.map((c) => (
        <button key={c.id} type="button" className="glass flex w-full items-center gap-3 p-3.5 text-right" onClick={() => setEdit(c)}>
          <span className="ltr w-28 shrink-0 text-sm font-semibold num">{fmtTimeRange(c.startMin, c.endMin)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{c.title}</span>
            <span className="block truncate text-xs text-muted">{KIND_LABEL[c.kind]} • {rep(c)}{c.validUntil ? ` • لحد ${c.validUntil}` : ''}</span>
          </span>
        </button>
      ))}
      {edit && <CommitmentSheet value={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function CommitmentSheet({ value, onClose }: { value: Partial<Commitment>; onClose: () => void }) {
  const safe = useSafe()
  const { today } = useLife()
  const [c, setC] = useState<Partial<Commitment>>(value)
  const repeatType = c.repeat?.type ?? 'weekly'
  const weekdays = c.repeat?.type === 'weekly' ? c.repeat.weekdays : []
  const save = () => safe(async () => {
    if (!c.title?.trim()) throw new Error('اكتب اسم الالتزام')
    await saveCommitment({ ...c, title: c.title.trim(), startMin: c.startMin!, endMin: c.endMin! })
    onClose()
  })
  return (
    <Sheet open onClose={onClose} title={value.id ? 'تعديل التزام' : 'التزام جديد'} footer={
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => void save()}>حفظ</Button>
        {value.id && <Button variant="danger" onClick={() => void safe(async () => { if (confirm('تحذف الالتزام؟')) { await deleteCommitment(value.id!); onClose() } })}>حذف</Button>}
      </div>
    }>
      <Field label="الاسم"><input className="w-full" value={c.title ?? ''} onChange={(e) => setC({ ...c, title: e.target.value })} placeholder="الشغل، محاضرة، جيم…" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="من"><input type="time" className="ltr w-full" value={toTimeInput(c.startMin ?? 540)} onChange={(e) => e.target.value && setC({ ...c, startMin: fromTimeInput(e.target.value) })} /></Field>
        <Field label="إلى"><input type="time" className="ltr w-full" value={toTimeInput(c.endMin ?? 600)} onChange={(e) => e.target.value && setC({ ...c, endMin: fromTimeInput(e.target.value) })} /></Field>
      </div>
      <Field label="النوع">
        <select className="w-full" value={c.kind} onChange={(e) => setC({ ...c, kind: e.target.value as CommitmentKind })}>
          {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </Field>
      <Field label="التكرار">
        <select className="w-full" value={repeatType} onChange={(e) => {
          const t = e.target.value
          setC({ ...c, repeat: t === 'daily' ? { type: 'daily' } : t === 'once' ? { type: 'once', day: today } : { type: 'weekly', weekdays: [0, 1, 2, 3, 4] } })
        }}>
          <option value="weekly">أيام محددة في الأسبوع</option>
          <option value="daily">كل يوم</option>
          <option value="once">مرة واحدة</option>
        </select>
      </Field>
      {repeatType === 'weekly' && (
        <div className="flex justify-between gap-1">
          {[6, 0, 1, 2, 3, 4, 5].map((d) => (
            <button key={d} type="button" aria-label={WEEKDAY_NAMES[d]} aria-pressed={weekdays.includes(d)}
              onClick={() => setC({ ...c, repeat: { type: 'weekly', weekdays: weekdays.includes(d) ? weekdays.filter((x) => x !== d) : [...weekdays, d].sort() } })}
              className={`h-10 flex-1 rounded-xl text-sm ${weekdays.includes(d) ? 'bg-accent text-white' : 'bg-white/70 text-muted'}`}>{WEEKDAY_SHORT[d]}</button>
          ))}
        </div>
      )}
      {c.repeat?.type === 'once' && <Field label="اليوم"><input type="date" className="w-full" value={c.repeat.day} onChange={(e) => setC({ ...c, repeat: { type: 'once', day: e.target.value } })} /></Field>}
      <div className="grid grid-cols-2 gap-2">
        <Field label="ساري من (اختياري)"><input type="date" className="w-full" value={c.validFrom ?? ''} onChange={(e) => setC({ ...c, validFrom: e.target.value || undefined })} /></Field>
        <Field label="لحد (اختياري)"><input type="date" className="w-full" value={c.validUntil ?? ''} onChange={(e) => setC({ ...c, validUntil: e.target.value || undefined })} /></Field>
      </div>
      <Field label="تذكير قبلها (دقيقة)" hint="فاضي = الإعداد الافتراضي">
        <input type="number" inputMode="numeric" className="ltr w-full" value={c.remindBeforeMin ?? ''} onChange={(e) => setC({ ...c, remindBeforeMin: e.target.value === '' ? undefined : Number(e.target.value) })} />
      </Field>
      {value.id && (c.skipDays?.length ?? 0) > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-semibold text-muted">مرات ملغاة</span>
          <div className="flex flex-wrap gap-1">
            {c.skipDays!.filter((d) => d >= today).map((d) => (
              <button key={d} type="button" className="chip" onClick={() => void safe(async () => { await toggleCommitmentSkip(value.id!, d); setC({ ...c, skipDays: c.skipDays!.filter((x) => x !== d) }) })}>{dayLabel(d, today)} ✕</button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  )
}

// ---------- what-if ----------

type ScType = Scenario['type']

function WhatIf() {
  const life = useLife()
  const { data, now, today, taskById } = life
  const safe = useSafe()
  const toast = useToast()
  const [type, setType] = useState<ScType>('lost_time')
  const [minutes, setMinutes] = useState(120)
  const [hours, setHours] = useState(4)
  const [projectId, setProjectId] = useState(data.projects.find((p) => !p.deletedAt && p.status === 'active')?.id ?? '')
  const [taskId, setTaskId] = useState('')
  const [day, setDay] = useState(today)
  const [start, setStart] = useState(Math.min(22 * 60, Math.ceil(minuteOfDay(now) / 30) * 30))
  const [end, setEnd] = useState(Math.min(23 * 60 + 30, Math.ceil(minuteOfDay(now) / 30) * 30 + 120))
  const occ = useMemo(() => life.proposal.blocks.filter((b) => b.kind === 'commitment').slice(0, 30), [life.proposal])
  const [occId, setOccId] = useState(occ[0]?.id ?? '')
  const [result, setResult] = useState<{ r: WhatIfResult; sc: Scenario } | null>(null)
  const openTasks = data.tasks.filter((t) => !t.deletedAt && !t.recurrence && ['new', 'planned', 'in_progress', 'paused'].includes(t.status))

  const scenario = (): Scenario | undefined => {
    switch (type) {
      case 'lost_time': return { type, minutes }
      case 'reserve_project': return projectId ? { type, projectId, minutes: hours * 60, label: `وقت إضافي: ${data.projects.find((p) => p.id === projectId)?.name}` } : undefined
      case 'change_estimate': return taskId ? { type, taskId, minutes } : undefined
      case 'skip_commitment': { const b = occ.find((x) => x.id === occId); return b ? { type, commitmentId: b.commitmentId!, day: b.day } : undefined }
      case 'block_time': return end > start ? { type, day, startMin: start, endMin: end, title: 'وقت محجوز' } : undefined
    }
  }
  const run = () => {
    const sc = scenario()
    if (!sc) { toast('كمّل بيانات السيناريو', 'error'); return }
    const restDays = data.dayLogs.filter((d) => d.restDay).map((d) => d.day)
    setResult({ sc, r: whatIf({ tasks: data.tasks, commitments: data.commitments, settings: data.settings, now, restDays }, sc) })
  }
  const name = (id: string) => taskById.get(id)?.title ?? id
  const when = (t?: number) => (t ? fmtWhen(t, today) : 'مش مجدولة')

  return (
    <div className="space-y-3">
      <p className="px-1 text-sm leading-relaxed text-muted">جرّب سيناريو وشوف أثره على الأسبوع قبل ما تعتمد أي حاجة. ده محاكاة بس — مفيش أي تغيير بيتحفظ.</p>
      <div className="glass space-y-3 p-4">
        <Field label="السيناريو">
          <select className="w-full" value={type} onChange={(e) => { setType(e.target.value as ScType); setResult(null) }}>
            <option value="lost_time">حصل تأخير / ضاع وقت</option>
            <option value="skip_commitment">إلغاء التزام (مثلًا الجيم اتلغى)</option>
            <option value="reserve_project">تخصيص ساعات إضافية لمشروع</option>
            <option value="change_estimate">مهمة طلعت أكبر/أصغر</option>
            <option value="block_time">حجز وقت لحاجة طارئة</option>
          </select>
        </Field>
        {type === 'lost_time' && <Field label="الوقت الضايع (دقيقة)"><input type="number" className="ltr w-full" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></Field>}
        {type === 'reserve_project' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="المشروع">
              <select className="w-full" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">اختار</option>
                {data.projects.filter((p) => !p.deletedAt).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="ساعات"><input type="number" className="ltr w-full" value={hours} onChange={(e) => setHours(Number(e.target.value))} /></Field>
          </div>
        )}
        {type === 'change_estimate' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="المهمة">
              <select className="w-full" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                <option value="">اختار</option>
                {openTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </Field>
            <Field label="المدة الجديدة (دقيقة)"><input type="number" className="ltr w-full" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></Field>
          </div>
        )}
        {type === 'skip_commitment' && (
          occ.length === 0 ? <p className="text-sm text-muted">مفيش التزامات في أفق التخطيط.</p> : (
            <Field label="أي مرة؟">
              <select className="w-full" value={occId} onChange={(e) => setOccId(e.target.value)}>
                {occ.map((b) => <option key={b.id} value={b.id}>{b.title} — {dayLabel(b.day, today)} {fmtTime(b.startMin)}</option>)}
              </select>
            </Field>
          )
        )}
        {type === 'block_time' && (
          <div className="grid grid-cols-3 gap-2">
            <Field label="اليوم"><input type="date" className="w-full" value={day} onChange={(e) => setDay(e.target.value as DayKey)} /></Field>
            <Field label="من"><input type="time" className="ltr w-full" value={toTimeInput(start)} onChange={(e) => e.target.value && setStart(fromTimeInput(e.target.value))} /></Field>
            <Field label="إلى"><input type="time" className="ltr w-full" value={toTimeInput(end)} onChange={(e) => e.target.value && setEnd(fromTimeInput(e.target.value))} /></Field>
          </div>
        )}
        <Button className="w-full" onClick={run}>شوف الأثر</Button>
      </div>

      {result && (
        <div className="space-y-2" data-testid="whatif-result">
          <div className="grid grid-cols-2 gap-2">
            <div className="glass p-3 text-sm"><div className="text-xs text-muted">مخاطر جديدة</div><div className="text-xl font-bold text-danger num">{result.r.newlyAtRisk.length}</div></div>
            <div className="glass p-3 text-sm"><div className="text-xs text-muted">مخاطر اتحلت</div><div className="text-xl font-bold text-accent num">{result.r.resolvedRisks.length}</div></div>
          </div>
          {result.r.newlyAtRisk.map((id) => <p key={id} className="text-sm text-danger">⚠️ {name(id)} هتبقى معرضة تفوت موعدها</p>)}
          {result.r.resolvedRisks.map((id) => <p key={id} className="text-sm text-accent">✓ {name(id)} هتلحق موعدها</p>)}
          {result.r.rows.length === 0 ? <Empty>السيناريو ده مش مأثر على أي مهمة في الأفق.</Empty> : (
            <ul className="space-y-1.5">
              {result.r.rows.slice(0, 25).map((row) => (
                <li key={row.taskId} className="glass flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{name(row.taskId)}</span>
                  <span className="shrink-0 text-xs text-muted">{when(row.baseFinish)} ← {when(row.altFinish)}</span>
                  {row.deltaMin !== undefined && <Chip tone={row.deltaMin > 0 ? 'warn' : 'accent'}>{row.deltaMin > 0 ? '+' : '−'}{fmtMinutes(Math.abs(row.deltaMin))}</Chip>}
                </li>
              ))}
            </ul>
          )}
          {result.sc.type === 'skip_commitment' && (
            <Button variant="soft" className="w-full" onClick={() => void safe(async () => {
              const sc = result.sc as Extract<Scenario, { type: 'skip_commitment' }>
              await toggleCommitmentSkip(sc.commitmentId, sc.day)
              toast('اتلغى الالتزام المرة دي — اعتمد الخطة الجديدة من تبويب الأسبوع')
              setResult(null)
            })}>طبّق: ألغِ الالتزام المرة دي</Button>
          )}
        </div>
      )}
    </div>
  )
}
