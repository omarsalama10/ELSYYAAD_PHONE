import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createGoal, createMilestone, createTask, deleteGoal, restoreGoal, updateGoal, updateMilestone } from '../db/repo'
import { isOpen } from '../domain/priority'
import { goalProgress, goalStatus, milestoneProgress, unscheduledGoalTasks, type GoalTrack } from '../domain/progress'
import { addDays, dayKey } from '../domain/time'
import type { Goal, GoalHorizon, GoalKind, GoalMetric, GoalStatus } from '../domain/types'
import { useLife } from '../state'
import { Button } from '../../ui/primitives'
import { useSafe } from '../../ui/Toast'
import { fmtDayShort, GOAL_KIND_LABEL } from '../ui/format'
import { LI } from '../ui/icons'
import { Bar, Chip, CommitText, Empty, Field, Header, IconBtn, Section, Sheet, Stat, Tabs } from '../ui/kit'
import { TaskRow, useQuickAdd } from '../ui/tasks'

const TRACK: Record<GoalTrack, { label: string; tone: 'accent' | 'warn' | 'danger' | 'muted' }> = {
  achieved: { label: 'تحقق 🎉', tone: 'accent' }, ahead: { label: 'متقدم', tone: 'accent' }, on_track: { label: 'في المسار', tone: 'accent' },
  behind: { label: 'متأخر', tone: 'danger' }, no_data: { label: 'مفيش بيانات', tone: 'muted' },
}

export function GoalsScreen() {
  const { data, now } = useLife()
  const [filter, setFilter] = useState<GoalStatus>('active')
  const [creating, setCreating] = useState(false)
  const goals = data.goals.filter((g) => !g.deletedAt && g.status === filter).sort((a, b) => a.targetDate.localeCompare(b.targetDate))
  return (
    <div className="space-y-3">
      <Header back title="الأهداف" sub="كل هدف بيتحول لنتيجة قابلة للقياس ← مراحل ← مهام" action={<IconBtn label="هدف جديد" tone="accent" onClick={() => setCreating(true)}>{LI.plus()}</IconBtn>} />
      <Tabs<GoalStatus> value={filter} onChange={setFilter} tabs={[{ value: 'active', label: 'نشطة' }, { value: 'paused', label: 'متوقفة' }, { value: 'achieved', label: 'تحققت' }, { value: 'dropped', label: 'اتلغت' }]} />
      {goals.length === 0 ? <Empty action={filter === 'active' ? <Button variant="soft" onClick={() => setCreating(true)}>+ هدف</Button> : undefined}>مفيش أهداف هنا.</Empty> : goals.map((g) => {
        const pct = goalProgress(g, data.tasks, data.projects, data.milestones, data.settings)
        const st = goalStatus(g, pct, now)
        return (
          <Link key={g.id} to={`/goals/${g.id}`} className="glass block space-y-2 p-4">
            <div className="flex items-center gap-2">
              <span className="flex-1 font-semibold">{g.title}</span>
              <Chip tone={TRACK[st.track].tone}>{TRACK[st.track].label}</Chip>
            </div>
            <div className="relative">
              <Bar value={(pct ?? 0) / 100} tone={st.track === 'behind' ? 'warn' : 'accent'} label={g.title} />
              <span className="absolute -top-1 h-3.5 w-0.5 bg-ink/50" style={{ right: `${st.expectedPct}%` }} aria-label={`المتوقع ${st.expectedPct}%`} />
            </div>
            <div className="flex justify-between text-xs text-muted">
              <span>{pct ?? '—'}% (المتوقع لحد النهارده {st.expectedPct}%)</span>
              <span>{st.daysLeft >= 0 ? `باقي ${st.daysLeft} يوم` : `عدّى ${-st.daysLeft} يوم`}</span>
            </div>
          </Link>
        )
      })}
      {creating && <GoalSheet onClose={() => setCreating(false)} />}
    </div>
  )
}

function GoalSheet({ onClose }: { onClose: () => void }) {
  const { today } = useLife()
  const safe = useSafe()
  const nav = useNavigate()
  const [g, setG] = useState({ title: '', outcome: '', successCriteria: '', kind: 'project' as GoalKind, horizon: 'monthly' as GoalHorizon, startDate: today, targetDate: addDays(today, 30) })
  const [metric, setMetric] = useState<GoalMetric['type']>('tasks')
  const [unit, setUnit] = useState('')
  const [target, setTarget] = useState(10)
  const horizonDays: Record<GoalHorizon, number> = { monthly: 30, quarterly: 90, yearly: 365, custom: 30 }
  const save = () => safe(async () => {
    if (!g.title.trim()) throw new Error('اكتب الهدف')
    if (g.targetDate < g.startDate) throw new Error('الموعد قبل البداية')
    const m: GoalMetric = metric === 'numeric' ? { type: 'numeric', unit, start: 0, target, current: 0 } : { type: metric }
    const created = await createGoal({ ...g, title: g.title.trim(), metric: m })
    onClose()
    nav(`/goals/${created.id}`)
  })
  return (
    <Sheet open onClose={onClose} title="هدف جديد" footer={<Button className="w-full" onClick={() => void save()}>إنشاء</Button>}>
      <Field label="الهدف"><input autoFocus className="w-full" value={g.title} onChange={(e) => setG({ ...g, title: e.target.value })} placeholder="إنهاء إصدار أول من البرنامج خلال شهر" /></Field>
      <Field label="النتيجة المطلوبة"><textarea className="w-full" rows={2} value={g.outcome} onChange={(e) => setG({ ...g, outcome: e.target.value })} placeholder="إيه اللي هيكون موجود لما يتحقق؟" /></Field>
      <Field label="معيار النجاح"><input className="w-full" value={g.successCriteria} onChange={(e) => setG({ ...g, successCriteria: e.target.value })} placeholder="مثلًا: 10 مستخدمين بيستخدموه بدون أخطاء حرجة" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="النوع">
          <select className="w-full" value={g.kind} onChange={(e) => setG({ ...g, kind: e.target.value as GoalKind })}>
            {(Object.keys(GOAL_KIND_LABEL) as GoalKind[]).map((k) => <option key={k} value={k}>{GOAL_KIND_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label="المدى">
          <select className="w-full" value={g.horizon} onChange={(e) => { const h = e.target.value as GoalHorizon; setG({ ...g, horizon: h, targetDate: h === 'custom' ? g.targetDate : addDays(g.startDate, horizonDays[h]) }) }}>
            <option value="monthly">شهري</option><option value="quarterly">ربع سنوي</option><option value="yearly">سنوي</option><option value="custom">مخصص</option>
          </select>
        </Field>
        <Field label="البداية"><input type="date" className="w-full" value={g.startDate} onChange={(e) => setG({ ...g, startDate: e.target.value })} /></Field>
        <Field label="الموعد"><input type="date" className="w-full" value={g.targetDate} onChange={(e) => setG({ ...g, targetDate: e.target.value, horizon: 'custom' })} /></Field>
      </div>
      <Field label="طريقة القياس">
        <select className="w-full" value={metric} onChange={(e) => setMetric(e.target.value as GoalMetric['type'])}>
          <option value="tasks">من إنجاز المهام والمشاريع المرتبطة</option>
          <option value="numeric">رقم (دروس، كيلو، عملاء…)</option>
          <option value="milestones">عدد المراحل المكتملة</option>
        </select>
      </Field>
      {metric === 'numeric' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="المستهدف"><input type="number" className="ltr w-full" value={target} onChange={(e) => setTarget(Number(e.target.value))} /></Field>
          <Field label="الوحدة"><input className="w-full" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="درس" /></Field>
        </div>
      )}
    </Sheet>
  )
}

export function GoalDetail() {
  const { id } = useParams()
  const { data, now } = useLife()
  const safe = useSafe()
  const nav = useNavigate()
  const quick = useQuickAdd()
  const [reasonFor, setReasonFor] = useState<Partial<Goal> | null>(null)
  const [reason, setReason] = useState('')
  const [newPhase, setNewPhase] = useState('')
  const [phaseTask, setPhaseTask] = useState<Record<string, string>>({})
  const g = data.goals.find((x) => x.id === id)
  if (!g) return <div><Header back title="الهدف" /><Empty>الهدف مش موجود.</Empty></div>
  const s = data.settings
  const pct = goalProgress(g, data.tasks, data.projects, data.milestones, s)
  const st = goalStatus(g, pct, now)
  const projects = data.projects.filter((p) => p.goalId === g.id && !p.deletedAt)
  const phases = data.milestones.filter((m) => m.goalId === g.id).sort((a, b) => a.order - b.order)
  const projIds = new Set(projects.map((p) => p.id))
  const linked = data.tasks.filter((t) => !t.deletedAt && !t.recurrence && (t.goalId === g.id || (t.projectId && projIds.has(t.projectId))))
  const noEstimate = unscheduledGoalTasks(g.id, data.tasks, data.projects)
  const sensitive = (p: Partial<Goal>) => ['targetDate', 'metric', 'status', 'successCriteria'].some((k) => k in p)
  const change = (p: Partial<Goal>) => { if (sensitive(p)) { setReasonFor(p); setReason('') } else void safe(() => updateGoal(g.id, p)) }
  const daysLeftText = st.daysLeft >= 0 ? `باقي ${st.daysLeft} يوم` : `عدّى الموعد بـ ${-st.daysLeft} يوم`

  return (
    <div className="space-y-4 pb-8">
      <Header back title={g.title} sub={`${GOAL_KIND_LABEL[g.kind]} • ${fmtDayShort(g.startDate)} ← ${fmtDayShort(g.targetDate)}`} />
      <div className="grid grid-cols-3 gap-2">
        <Stat label="الإنجاز" value={`${pct ?? '—'}${pct !== null ? '%' : ''}`} sub={`المتوقع ${st.expectedPct}%`} tone={st.track === 'behind' ? 'danger' : 'accent'} />
        <Stat label="الحالة" value={TRACK[st.track].label} sub={daysLeftText} />
        <Stat label="الإسقاط" value={st.projectedDate ? fmtDayShort(st.projectedDate) : '—'} sub="بالمعدل الحالي" tone={st.projectedDate && st.projectedDate > g.targetDate ? 'danger' : undefined} />
      </div>
      {st.suggestion === 'reduce_scope_or_extend' && (
        <div className="rounded-2xl bg-warn/10 p-3 text-sm text-warn">بالمعدل الحالي الهدف هيخلص {st.projectedDate ? fmtDayShort(st.projectedDate) : 'بعد الموعد'}. اقتراح: قلّل النطاق (شيل مهام أقل أهمية) أو مدّ الموعد — وسجّل السبب.</div>
      )}
      {st.suggestion === 'add_tasks' && <p className="rounded-2xl bg-white/60 p-3 text-sm text-muted">اربط مشاريع أو مهام بالهدف ده عشان يتقاس تقدمه.</p>}
      {noEstimate.length > 0 && <p className="text-xs text-warn">{noEstimate.length} مهام مرتبطة مالهاش مدة متوقعة — المخطط بيستخدم {s.defaultEstimateMin} د افتراضيًا ليها.</p>}

      {g.metric.type === 'numeric' && (() => {
        const m = g.metric
        const setNum = (k: 'start' | 'current' | 'target', v: string) => {
          const n = Number(v.replace(/[,،\s]/g, ''))
          if (v.trim() !== '' && Number.isFinite(n) && n !== m[k]) void safe(() => updateGoal(g.id, { metric: { ...m, [k]: n } }, k === 'current' ? 'تحديث القياس' : 'تعديل نقطة البداية أو المستهدف'))
        }
        return (
          <div className="glass space-y-3 p-4" data-testid="goal-metric">
            <div className="flex items-center gap-3">
              <span className="flex-1 text-sm">الرقم الحالي ({m.unit || 'وحدة'})</span>
              <button type="button" aria-label="نقص" className="h-9 w-9 rounded-xl bg-white/70" onClick={() => void safe(() => updateGoal(g.id, { metric: { ...m, current: m.current - 1 } }, 'تحديث القياس'))}>−</button>
              <span className="min-w-12 text-center text-lg font-bold num">{m.current.toLocaleString('en')}</span>
              <button type="button" aria-label="زوّد" className="h-9 w-9 rounded-xl bg-accent text-white" onClick={() => void safe(() => updateGoal(g.id, { metric: { ...m, current: m.current + 1 } }, 'تحديث القياس'))}>+</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="البداية"><CommitText ariaLabel="قيمة البداية" className="ltr" value={String(m.start)} onCommit={(v) => setNum('start', v)} /></Field>
              <Field label="الحالي"><CommitText ariaLabel="القيمة الحالية" className="ltr" value={String(m.current)} onCommit={(v) => setNum('current', v)} /></Field>
              <Field label="المستهدف"><CommitText ariaLabel="القيمة المستهدفة" className="ltr" value={String(m.target)} onCommit={(v) => setNum('target', v)} /></Field>
            </div>
            <p className="text-[11px] text-muted">اكتب الرقم الحالي كل أسبوع في المراجعة الأسبوعية؛ التقدم = (الحالي − البداية) ÷ (المستهدف − البداية).</p>
          </div>
        )
      })()}

      <Section title="المراحل">
        <div className="space-y-2">
          {phases.map((m) => {
            const mp = milestoneProgress(m, data.tasks, s)
            return (
              <div key={m.id} className="glass space-y-2 p-3.5">
                <div className="flex items-center gap-2">
                  <input type="checkbox" aria-label={`إنهاء ${m.title}`} className="h-5 w-5" checked={m.status === 'done'} onChange={() => void safe(() => updateMilestone(m.id, { status: m.status === 'done' ? 'open' : 'done' }))} />
                  <span className="flex-1 font-medium">{m.title}</span>
                  <input type="date" aria-label={`موعد ${m.title}`} className="py-1 text-xs" value={m.dueDate ?? ''} onChange={(e) => void safe(() => updateMilestone(m.id, { dueDate: e.target.value || undefined }))} />
                </div>
                <Bar value={(mp.pct ?? 0) / 100} label={m.title} />
                {data.tasks.filter((t) => t.milestoneId === m.id && !t.deletedAt).map((t) => <TaskRow key={t.id} task={t} />)}
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = phaseTask[m.id]?.trim(); if (v) void safe(async () => { await createTask({ title: v, goalId: g.id, milestoneId: m.id }); setPhaseTask({ ...phaseTask, [m.id]: '' }) }) }}>
                  <input aria-label={`مهمة في ${m.title}`} placeholder="حوّل المرحلة لمهمة فعلية…" className="flex-1 text-sm" value={phaseTask[m.id] ?? ''} onChange={(e) => setPhaseTask({ ...phaseTask, [m.id]: e.target.value })} />
                  <Button variant="soft" type="submit" className="px-3 py-2">+</Button>
                </form>
              </div>
            )
          })}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newPhase.trim()) void safe(async () => { await createMilestone({ title: newPhase.trim(), goalId: g.id, order: phases.length }); setNewPhase('') }) }}>
            <input aria-label="مرحلة جديدة" placeholder="مرحلة جديدة" className="flex-1" value={newPhase} onChange={(e) => setNewPhase(e.target.value)} />
            <Button variant="soft" type="submit" className="px-3 py-2">+</Button>
          </form>
        </div>
      </Section>

      <Section title="المشاريع المرتبطة">
        {projects.length === 0 ? <p className="px-1 text-sm text-muted">اربط مشروع من إعدادات المشروع.</p> : projects.map((p) => (
          <Link key={p.id} to={`/projects/${p.id}`} className="glass flex items-center gap-2 p-3"><span className="h-3 w-3 rounded-full" style={{ background: p.color }} /><span className="flex-1">{p.name}</span></Link>
        ))}
      </Section>

      <Section title={`المهام المرتبطة (${linked.filter(isOpen).length} مفتوحة)`} action={<button type="button" className="text-sm font-semibold text-accent" onClick={() => quick.open({ goalId: g.id })}>+ مهمة</button>}>
        <div className="space-y-2">{linked.filter((t) => !t.milestoneId || !phases.some((m) => m.id === t.milestoneId)).slice(0, 30).map((t) => <TaskRow key={t.id} task={t} />)}</div>
      </Section>

      <Section title="التعريف والقياس">
        <div className="glass space-y-3 p-4">
          <Field label="الهدف"><CommitText ariaLabel="عنوان الهدف" value={g.title} onCommit={(v) => v.trim() && change({ title: v.trim() })} /></Field>
          <Field label="النتيجة المطلوبة"><CommitText multiline ariaLabel="النتيجة" value={g.outcome} onCommit={(v) => change({ outcome: v })} /></Field>
          <Field label="معيار النجاح"><CommitText ariaLabel="معيار النجاح" value={g.successCriteria} onCommit={(v) => change({ successCriteria: v })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="الموعد"><input type="date" className="w-full" value={g.targetDate} onChange={(e) => e.target.value && change({ targetDate: e.target.value })} /></Field>
            <Field label="الحالة">
              <select className="w-full" value={g.status} onChange={(e) => change({ status: e.target.value as GoalStatus })}>
                <option value="active">نشط</option><option value="paused">متوقف</option><option value="achieved">تحقق</option><option value="dropped">اتلغى</option>
              </select>
            </Field>
          </div>
        </div>
      </Section>

      <Section title="سجل التغييرات وأسبابها">
        {g.changes.length === 0 ? <p className="px-1 text-sm text-muted">أي تغيير في الموعد أو القياس أو الحالة بيتسجل هنا بسببه.</p> : (
          <ul className="space-y-1.5">
            {[...g.changes].reverse().map((c, i) => (
              <li key={i} className="glass px-3.5 py-2 text-sm">
                <div className="flex justify-between"><b>{c.field === 'targetDate' ? 'الموعد' : c.field === 'metric' ? 'القياس' : c.field === 'status' ? 'الحالة' : c.field}</b><span className="text-[11px] text-muted">{fmtDayShort(dayKey(c.at))}</span></div>
                <div className="text-muted">{typeof c.from === 'object' ? '' : `${String(c.from)} ← ${String(c.to)} — `}{c.reason}</div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {g.deletedAt
        ? <Button variant="soft" className="w-full" onClick={() => void safe(() => restoreGoal(g.id), 'اترجع')}>استرجاع</Button>
        : <Button variant="danger" className="w-full" onClick={() => void safe(async () => { if (confirm('تحذف الهدف؟')) { await deleteGoal(g.id); nav('/goals') } })}>حذف الهدف</Button>}

      {reasonFor && (
        <Sheet open onClose={() => setReasonFor(null)} title="سبب التغيير" footer={
          <Button className="w-full" onClick={() => void safe(async () => { await updateGoal(g.id, reasonFor, reason); setReasonFor(null) }, 'اتسجل')}>حفظ التغيير</Button>
        }>
          <p className="text-sm text-muted">تسجيل السبب بيخلي القرار واضح لما ترجعله أو تديه لـ Claude.</p>
          <input autoFocus aria-label="السبب" className="w-full" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلًا: النطاق زاد بعد مراجعة المتطلبات" />
        </Sheet>
      )}
    </div>
  )
}
