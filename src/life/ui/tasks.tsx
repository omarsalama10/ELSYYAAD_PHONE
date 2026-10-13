import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { createTask, finishTask, updateTask } from '../db/repo'
import { isOpen, openDependencies, priorityLabel } from '../domain/priority'
import { matches, parseQuickAdd, suggestEstimate } from '../domain/text'
import { at, fmtMinutes } from '../domain/time'
import type { Task } from '../domain/types'
import { useLife } from '../state'
import { useSafe, useToast } from '../../ui/Toast'
import { Button } from '../../ui/primitives'
import { dayLabel, dueTone, fmtTime, fmtWhen, NOTE_KIND_LABEL, STATUS_LABEL, STATUS_TONE } from './format'
import { LI } from './icons'
import { Chip, Field, Sheet } from './kit'

export function TaskCheck({ task, size = 'md' }: { task: Task; size?: 'md' | 'sm' }) {
  const safe = useSafe()
  const done = task.status === 'done'
  const dim = size === 'sm' ? 'h-6 w-6' : 'h-7 w-7'
  return (
    <button
      type="button"
      aria-label={done ? `إلغاء إكمال ${task.title}` : `إكمال ${task.title}`}
      aria-pressed={done}
      onClick={(e) => { e.stopPropagation(); void safe(async () => { if (done) await updateTask(task.id, { status: 'planned' }); else await finishTask(task.id) }) }}
      className={`flex ${dim} shrink-0 items-center justify-center rounded-full border-2 transition ${done ? 'border-accent bg-accent text-white' : 'border-ink/25 bg-white/60 text-transparent active:border-accent'}`}
    >
      {LI.check('h-3.5 w-3.5')}
    </button>
  )
}

export function TaskRow({ task, selected, onSelect, showProject = true }: { task: Task; selected?: boolean; onSelect?: () => void; showProject?: boolean }) {
  const nav = useNavigate()
  const { data, now, today, proposal, taskById, runningTaskId } = useLife()
  const project = task.projectId ? data.projects.find((p) => p.id === task.projectId) : undefined
  const score = proposal.scores[task.id]?.score
  const blocked = isOpen(task) && openDependencies(task, taskById).length > 0
  const pr = score !== undefined ? priorityLabel(score) : undefined
  const done = task.status === 'done' || task.status === 'cancelled'
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => (onSelect ? onSelect() : nav(`/tasks/${task.id}`))}
      onKeyDown={(e) => { if (e.key === 'Enter') (onSelect ? onSelect() : nav(`/tasks/${task.id}`)) }}
      className={`glass flex items-start gap-3 px-3.5 py-3 active:scale-[0.99] ${selected ? 'ring-2 ring-accent' : ''}`}
      data-testid="task-row"
    >
      {onSelect ? (
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 ${selected ? 'border-accent bg-accent text-white' : 'border-ink/25'}`}>{selected && LI.check('h-3.5 w-3.5')}</span>
      ) : <TaskCheck task={task} />}
      <div className="min-w-0 flex-1 space-y-1">
        <div className={`text-[15px] font-medium leading-snug ${done ? 'text-muted line-through' : ''}`}>{task.title}</div>
        <div className="flex flex-wrap gap-1">
          {runningTaskId === task.id && <Chip tone="coral">{LI.play('h-3 w-3')} شغالة</Chip>}
          {task.status !== 'new' && task.status !== 'done' && runningTaskId !== task.id && <Chip tone={STATUS_TONE[task.status]}>{STATUS_LABEL[task.status]}</Chip>}
          {blocked && <Chip tone="warn">{LI.lock('h-3 w-3')} معطلة</Chip>}
          {showProject && project && <Chip><span className="h-2 w-2 rounded-full" style={{ background: project.color }} />{project.name}</Chip>}
          {task.dueAt !== undefined && !done && <Chip tone={dueTone(task.dueAt, now)}>{LI.flag('h-3 w-3')}{fmtWhen(task.dueAt, today)}</Chip>}
          {task.pinned && !done && <Chip tone="accent">{LI.clock('h-3 w-3')}{dayLabel(task.pinned.day, today)} {fmtTime(task.pinned.startMin)}</Chip>}
          {task.estimateMin !== undefined && <Chip>{fmtMinutes(task.estimateMin)}{task.confidence === 'rough' ? '~' : ''}</Chip>}
          {task.progress > 0 && !done && <Chip tone="accent">{task.progress}%</Chip>}
          {pr && !done && pr.tone !== 'muted' && <Chip tone={pr.tone === 'accent' ? 'muted' : pr.tone}>{pr.label}</Chip>}
          {task.checklist.length > 0 && <Chip>{task.checklist.filter((c) => c.done).length}/{task.checklist.length}</Chip>}
        </div>
      </div>
    </div>
  )
}

// ---------- quick add ----------

interface QuickAddCtx { open: (defaults?: Partial<Task>) => void }
const QCtx = createContext<QuickAddCtx>({ open: () => {} })
export const useQuickAdd = () => useContext(QCtx)

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [defaults, setDefaults] = useState<Partial<Task> | null>(null)
  const open = useCallback((d: Partial<Task> = {}) => setDefaults(d), [])
  return (
    <QCtx.Provider value={useMemo(() => ({ open }), [open])}>
      {children}
      {defaults && <QuickAddSheet defaults={defaults} onClose={() => setDefaults(null)} />}
    </QCtx.Provider>
  )
}

function QuickAddSheet({ defaults, onClose }: { defaults: Partial<Task>; onClose: () => void }) {
  const { data, now, today } = useLife()
  const safe = useSafe()
  const toast = useToast()
  const nav = useNavigate()
  const [text, setText] = useState('')
  const [more, setMore] = useState(false)
  const [projectId, setProjectId] = useState(defaults.projectId ?? '')
  const [due, setDue] = useState('')
  const [importance, setImportance] = useState(defaults.importance ?? 3)
  const [estimate, setEstimate] = useState<string>('')
  const projects = data.projects.filter((p) => !p.deletedAt && p.status !== 'archived')
  const parsed = parseQuickAdd(text, projects, now)
  const history = data.tasks
  const suggestion = parsed.title.length > 3 && parsed.estimateMin === undefined && !estimate ? suggestEstimate({ title: parsed.title, projectId: projectId || parsed.projectId }, history) : undefined

  const save = (open: boolean) =>
    safe(async () => {
      if (!parsed.title.trim()) throw new Error('اكتب عنوان المهمة')
      const est = estimate ? Number(estimate) : parsed.estimateMin
      const t = await createTask({
        ...defaults,
        title: parsed.title,
        projectId: projectId || parsed.projectId || undefined,
        importance: parsed.importance ?? importance,
        estimateMin: est && est > 0 ? est : undefined,
        confidence: est ? 'firm' : 'rough',
        dueAt: due ? at(due, 23 * 60 + 59) : parsed.dueAt ?? defaults.dueAt,
        pinned: parsed.pinned ?? defaults.pinned,
        startDate: defaults.startDate,
      })
      toast('اتضافت ✅')
      onClose()
      if (open) nav(`/tasks/${t.id}`)
      else setText('')
    })

  return (
    <Sheet open onClose={onClose} title="مهمة جديدة" footer={
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => void save(false)}>إضافة</Button>
        <Button variant="soft" onClick={() => void save(true)}>إضافة وفتح</Button>
      </div>
    }>
      <input
        autoFocus
        aria-label="عنوان المهمة"
        placeholder="مثال: مراجعة الكود 45د !4 #المشروع @بكرة 14:00"
        className="w-full"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void save(false) }}
      />
      <div className="flex flex-wrap gap-1 text-xs">
        {parsed.estimateMin !== undefined && <Chip tone="accent">مدة {fmtMinutes(parsed.estimateMin)}</Chip>}
        {parsed.importance !== undefined && <Chip tone="accent">أهمية {parsed.importance}</Chip>}
        {parsed.projectId && <Chip tone="accent">{projects.find((p) => p.id === parsed.projectId)?.name}</Chip>}
        {parsed.dueAt !== undefined && <Chip tone="accent">موعد {fmtWhen(parsed.dueAt, today)}</Chip>}
        {parsed.pinned && <Chip tone="accent">مثبتة {fmtTime(parsed.pinned.startMin)}</Chip>}
        {suggestion && (
          <button type="button" className="chip text-accent" onClick={() => setEstimate(String(suggestion.minutes))}>
            اقتراح: {fmtMinutes(suggestion.minutes)} (من {suggestion.basis} مهام مشابهة)
          </button>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-muted">اختصارات: <span className="ltr">45د</span> أو <span className="ltr">2h</span> للمدة، <span className="ltr">!1…!5</span> للأهمية، <span className="ltr">#مشروع</span>، <span className="ltr">@اليوم/@بكرة</span>، ووقت <span className="ltr">HH:MM</span> لتثبيتها.</p>
      <button type="button" className="text-sm font-semibold text-accent" onClick={() => setMore(!more)}>{more ? 'إخفاء التفاصيل' : 'تفاصيل أكثر'}</button>
      {more && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="المشروع">
            <select className="w-full" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">بدون</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="الموعد النهائي"><input type="date" className="w-full" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          <Field label="المدة (دقيقة)"><input type="number" inputMode="numeric" className="ltr w-full" value={estimate} onChange={(e) => setEstimate(e.target.value)} /></Field>
          <Field label="الأهمية">
            <select className="w-full" value={importance} onChange={(e) => setImportance(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
        </div>
      )}
    </Sheet>
  )
}

// ---------- global search ----------

export function SearchSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useLife()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const go = (to: string) => { onClose(); setQ(''); nav(to) }
  const res = useMemo(() => {
    if (!q.trim()) return []
    const out: { key: string; label: string; sub: string; to: string }[] = []
    for (const p of data.projects) if (!p.deletedAt && matches(q, p.name, p.description, p.category)) out.push({ key: `p${p.id}`, label: p.name, sub: 'مشروع', to: `/projects/${p.id}` })
    for (const g of data.goals) if (!g.deletedAt && matches(q, g.title, g.outcome)) out.push({ key: `g${g.id}`, label: g.title, sub: 'هدف', to: `/goals/${g.id}` })
    for (const t of data.tasks) if (!t.deletedAt && matches(q, t.title, t.description, t.notes, t.category, t.tags.join(' '))) out.push({ key: `t${t.id}`, label: t.title, sub: t.recurrence ? 'مهمة متكررة' : `مهمة • ${STATUS_LABEL[t.status]}`, to: `/tasks/${t.id}` })
    for (const n of data.notes) if (!n.deletedAt && matches(q, n.title, n.body, n.tags.join(' '))) out.push({ key: `n${n.id}`, label: n.title, sub: NOTE_KIND_LABEL[n.kind], to: `/notes?open=${n.id}` })
    for (const c of data.commitments) if (!c.deletedAt && matches(q, c.title)) out.push({ key: `c${c.id}`, label: c.title, sub: `التزام ${fmtTime(c.startMin)}`, to: '/plan?tab=commitments' })
    return out.slice(0, 40)
  }, [q, data])
  return (
    <Sheet open={open} onClose={onClose} title="بحث">
      <input autoFocus aria-label="بحث" placeholder="مهمة، مشروع، هدف، ملاحظة، موعد…" className="w-full" value={q} onChange={(e) => setQ(e.target.value)} />
      {q && !res.length && <p className="py-6 text-center text-sm text-muted">مفيش نتائج</p>}
      <ul className="space-y-1.5">
        {res.map((r) => (
          <li key={r.key}>
            <button type="button" className="glass flex w-full items-center justify-between px-3.5 py-2.5 text-right" onClick={() => go(r.to)}>
              <span className="truncate font-medium">{r.label}</span>
              <span className="shrink-0 text-xs text-muted">{r.sub}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
