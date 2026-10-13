import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { bulkUpdate, deleteTasks, postponeTask } from '../db/repo'
import { isOpen } from '../domain/priority'
import { describeRecurrence } from '../domain/recurrence'
import { matches } from '../domain/text'
import { addDays, at, startOfWeek } from '../domain/time'
import type { Task, TaskStatus } from '../domain/types'
import { useLife } from '../state'
import { Button } from '../../ui/primitives'
import { useSafe, useToast } from '../../ui/Toast'
import { STATUS_LABEL } from '../ui/format'
import { LI } from '../ui/icons'
import { Empty, Field, Header, IconBtn, Sheet, Tabs } from '../ui/kit'
import { POSTPONE_REASONS } from '../ui/planActions'
import { TaskRow, useQuickAdd } from '../ui/tasks'

type View = 'open' | 'today' | 'week' | 'overdue' | 'unscheduled' | 'nodate' | 'recurring' | 'done' | 'all'
type Sort = 'priority' | 'due' | 'created' | 'title'

export function TasksScreen() {
  const life = useLife()
  const { data, now, today, proposal } = life
  const quick = useQuickAdd()
  const safe = useSafe()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const view = (params.get('view') as View) || 'open'
  const [q, setQ] = useState('')
  const [projectId, setProjectId] = useState(params.get('project') ?? '')
  const [status, setStatus] = useState<TaskStatus | ''>('')
  const [sort, setSort] = useState<Sort>('priority')
  const [selecting, setSelecting] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [bulk, setBulk] = useState<null | 'postpone' | 'project' | 'status' | 'importance'>(null)

  const weekEnd = at(addDays(startOfWeek(today, data.settings.weekStartsOn), 7), 0)
  const scheduledIds = new Set(proposal.blocks.filter((b) => b.taskId).map((b) => b.taskId!))
  const unschedIds = new Set(proposal.unscheduled.map((u) => u.taskId))
  const todayIds = new Set(life.blocksFor(today).filter((b) => b.taskId).map((b) => b.taskId!))

  const list = useMemo(() => {
    const base = data.tasks.filter((t) => !t.deletedAt && (view === 'recurring' ? !!t.recurrence : !t.recurrence))
    const byView = (t: Task) => {
      switch (view) {
        case 'open': return isOpen(t)
        case 'today': return isOpen(t) && (todayIds.has(t.id) || (t.dueAt !== undefined && t.dueAt < at(addDays(today, 1), 0)) || t.topDay === today)
        case 'week': return isOpen(t) && ((t.dueAt !== undefined && t.dueAt < weekEnd) || scheduledIds.has(t.id))
        case 'overdue': return isOpen(t) && t.dueAt !== undefined && t.dueAt < now
        case 'unscheduled': return isOpen(t) && (unschedIds.has(t.id) || !scheduledIds.has(t.id))
        case 'nodate': return isOpen(t) && t.dueAt === undefined
        case 'done': return t.status === 'done' || t.status === 'cancelled'
        default: return true
      }
    }
    const score = (t: Task) => proposal.scores[t.id]?.score ?? -1
    const cmp: Record<Sort, (a: Task, b: Task) => number> = {
      priority: (a, b) => score(b) - score(a),
      due: (a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity),
      created: (a, b) => b.createdAt - a.createdAt,
      title: (a, b) => a.title.localeCompare(b.title, 'ar'),
    }
    return base
      .filter(byView)
      .filter((t) => !projectId || (projectId === '-' ? !t.projectId : t.projectId === projectId))
      .filter((t) => !status || t.status === status)
      .filter((t) => !q || matches(q, t.title, t.description, t.notes, t.category, t.tags.join(' ')))
      .sort(view === 'done' ? (a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0) : cmp[sort])
  }, [data.tasks, view, projectId, status, q, sort, proposal, now, today, weekEnd])

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const ids = [...sel]
  const done = () => { setSel(new Set()); setSelecting(false); setBulk(null) }
  const projects = data.projects.filter((p) => !p.deletedAt)

  return (
    <div className="space-y-3">
      <Header title="المهام" action={
        <div className="flex gap-2">
          <IconBtn label={selecting ? 'إلغاء التحديد' : 'تحديد متعدد'} onClick={() => { setSelecting(!selecting); setSel(new Set()) }}>{selecting ? LI.close() : LI.check()}</IconBtn>
          <IconBtn label="مهمة جديدة" tone="accent" onClick={() => quick.open(projectId && projectId !== '-' ? { projectId } : {})}>{LI.plus()}</IconBtn>
        </div>
      } />
      <input aria-label="بحث في المهام" placeholder="بحث…" className="w-full" value={q} onChange={(e) => setQ(e.target.value)} />
      <Tabs<View> value={view} onChange={(v) => setParams({ view: v }, { replace: true })} tabs={[
        { value: 'open', label: 'المفتوحة' }, { value: 'today', label: 'اليوم' }, { value: 'week', label: 'الأسبوع' }, { value: 'overdue', label: 'متأخرة' },
        { value: 'unscheduled', label: 'غير مجدولة' }, { value: 'nodate', label: 'بدون موعد' }, { value: 'recurring', label: 'متكررة' }, { value: 'done', label: 'المنتهية' }, { value: 'all', label: 'الكل' },
      ]} />
      <div className="grid grid-cols-3 gap-2">
        <select aria-label="المشروع" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">كل المشاريع</option>
          <option value="-">بدون مشروع</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select aria-label="الحالة" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus | '')}>
          <option value="">كل الحالات</option>
          {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select aria-label="الترتيب" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="priority">الأولوية</option>
          <option value="due">الموعد</option>
          <option value="created">الأحدث</option>
          <option value="title">الاسم</option>
        </select>
      </div>

      {list.length === 0 ? (
        <Empty action={<Button variant="soft" onClick={() => quick.open()}>+ مهمة</Button>}>مفيش مهام هنا.</Empty>
      ) : (
        <div className="space-y-2">
          {list.map((t) => (
            <div key={t.id}>
              <TaskRow task={t} selected={sel.has(t.id)} onSelect={selecting ? () => toggle(t.id) : undefined} />
              {t.recurrence && <p className="px-3 pt-1 text-[11px] text-muted">{describeRecurrence(t.recurrence)} • بتتولّد نسخ للأيام الجاية تلقائيًا</p>}
            </div>
          ))}
          <p className="text-center text-xs text-muted num">{list.length} مهمة</p>
        </div>
      )}

      <Link to="/templates" className="block text-center text-sm font-semibold text-accent">القوالب ←</Link>

      {selecting && sel.size > 0 && (
        <div className="fixed inset-x-0 bottom-24 z-40 px-4">
          <div className="glass-strong mx-auto flex max-w-xl flex-wrap items-center justify-center gap-1.5 p-2" data-testid="bulk-bar">
            <span className="px-2 text-sm font-semibold num">{sel.size}</span>
            <Button className="px-3 py-1.5 text-sm" onClick={() => void safe(async () => { await bulkUpdate(ids, { status: 'done' }); toast(`${ids.length} اكتملت`); done() })}>✓ إكمال</Button>
            <Button variant="soft" className="px-3 py-1.5 text-sm" onClick={() => setBulk('postpone')}>تأجيل</Button>
            <Button variant="soft" className="px-3 py-1.5 text-sm" onClick={() => setBulk('project')}>نقل لمشروع</Button>
            <Button variant="soft" className="px-3 py-1.5 text-sm" onClick={() => setBulk('status')}>الحالة</Button>
            <Button variant="soft" className="px-3 py-1.5 text-sm" onClick={() => setBulk('importance')}>الأهمية</Button>
            <Button variant="danger" className="px-3 py-1.5 text-sm" onClick={() => void safe(async () => { await deleteTasks(ids); toast('اتنقلت لسلة المحذوفات'); done() })}>حذف</Button>
          </div>
        </div>
      )}
      {bulk && <BulkSheet kind={bulk} ids={ids} onClose={() => setBulk(null)} onDone={done} />}
    </div>
  )
}

function BulkSheet({ kind, ids, onClose, onDone }: { kind: 'postpone' | 'project' | 'status' | 'importance'; ids: string[]; onClose: () => void; onDone: () => void }) {
  const { data, today } = useLife()
  const safe = useSafe()
  const [day, setDay] = useState(addDays(today, 1))
  const [reason, setReason] = useState(POSTPONE_REASONS[0]!)
  const [projectId, setProjectId] = useState('')
  const [status, setStatus] = useState<TaskStatus>('planned')
  const [imp, setImp] = useState(3)
  const apply = () => safe(async () => {
    if (kind === 'postpone') for (const id of ids) await postponeTask(id, day, reason)
    if (kind === 'project') await bulkUpdate(ids, { projectId: projectId || undefined, milestoneId: undefined })
    if (kind === 'status') await bulkUpdate(ids, { status })
    if (kind === 'importance') await bulkUpdate(ids, { importance: imp })
    onDone()
  }, 'اتعدلت')
  return (
    <Sheet open onClose={onClose} title={`تعديل ${ids.length} مهام`} footer={<Button className="w-full" onClick={() => void apply()}>تطبيق</Button>}>
      {kind === 'postpone' && (
        <>
          <Field label="لحد يوم"><input type="date" className="w-full" value={day} min={today} onChange={(e) => setDay(e.target.value)} /></Field>
          <Field label="السبب">
            <select className="w-full" value={reason} onChange={(e) => setReason(e.target.value)}>{POSTPONE_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
          </Field>
        </>
      )}
      {kind === 'project' && (
        <Field label="المشروع">
          <select className="w-full" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">بدون مشروع</option>
            {data.projects.filter((p) => !p.deletedAt).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      )}
      {kind === 'status' && (
        <Field label="الحالة">
          <select className="w-full" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
            {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </Field>
      )}
      {kind === 'importance' && (
        <Field label="الأهمية (1–5)">
          <input type="range" min={1} max={5} value={imp} onChange={(e) => setImp(Number(e.target.value))} className="w-full" />
          <span className="text-sm num">{imp}</span>
        </Field>
      )}
    </Sheet>
  )
}
