import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  createMilestone, deleteMilestone, deleteProject, loadAll, projectAsTemplate, restoreProject, saveNote, updateMilestone, updateProject, updateTask,
} from '../db/repo'
import { isOpen, remainingMinutes } from '../domain/priority'
import { milestoneProgress, projectBlockers, projectForecast, projectProgress } from '../domain/progress'
import { projectReport } from '../domain/report'
import { addDays, dayKey, diffDays } from '../domain/time'
import type { NoteKind, ProgressWeighting, Project, ProjectStatus, Task, TaskStatus } from '../domain/types'
import { PROJECT_COLORS } from '../domain/factory'
import { useLife } from '../state'
import { Button } from '../../ui/primitives'
import { useSafe, useToast } from '../../ui/Toast'
import { dayLabel, fmtDayShort, NOTE_KIND_LABEL, STATUS_LABEL } from '../ui/format'
import { LI } from '../ui/icons'
import { Bar, Chip, CommitText, copyText, deliverFile, Empty, Field, Header, Section, Sheet, Stat, Tabs } from '../ui/kit'
import { TaskRow, useQuickAdd } from '../ui/tasks'
import { fmtMinutes } from '../domain/time'

type View = 'overview' | 'board' | 'list' | 'timeline' | 'log' | 'settings'
const BOARD: TaskStatus[] = ['new', 'planned', 'in_progress', 'paused', 'done']

export function ProjectDetail() {
  const { id } = useParams()
  const { data } = useLife()
  const [view, setView] = useState<View>('overview')
  const p = data.projects.find((x) => x.id === id)
  if (!p) return <div><Header title="المشروع" back /><Empty>المشروع مش موجود.</Empty></div>
  return (
    <div className="space-y-4 pb-8">
      <Header back title={<span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: p.color }} />{p.name}</span>} sub={p.deletedAt ? 'في سلة المحذوفات' : p.description} />
      <Tabs<View> value={view} onChange={setView} tabs={[
        { value: 'overview', label: 'نظرة عامة' }, { value: 'board', label: 'Kanban' }, { value: 'list', label: 'قائمة' }, { value: 'timeline', label: 'Timeline' },
        { value: 'log', label: 'القرارات والمخاطر' }, { value: 'settings', label: 'إعدادات' },
      ]} />
      {view === 'overview' && <Overview p={p} />}
      {view === 'board' && <Board p={p} />}
      {view === 'list' && <ListView p={p} />}
      {view === 'timeline' && <Timeline p={p} />}
      {view === 'log' && <Log p={p} />}
      {view === 'settings' && <Settings p={p} />}
    </div>
  )
}

const tasksOf = (p: Project, tasks: Task[]) => tasks.filter((t) => t.projectId === p.id && !t.deletedAt && !t.recurrence)

function Overview({ p }: { p: Project }) {
  const { data, proposal, now, today } = useLife()
  const safe = useSafe()
  const toast = useToast()
  const quick = useQuickAdd()
  const [newMs, setNewMs] = useState('')
  const s = data.settings
  const pr = projectProgress(p, data.tasks, s)
  const fc = projectForecast(p, data.tasks, data.logs, proposal, (t) => remainingMinutes(t, s), now)
  const bl = projectBlockers(p, data.tasks, now)
  const ms = data.milestones.filter((m) => m.projectId === p.id).sort((a, b) => a.order - b.order)
  const end = fc.beyondHorizon ? fc.rateEnd : fc.plannedEnd
  const report = () => safe(async () => {
    const md = projectReport(p, await loadAll(), proposal, now)
    if (await copyText(md)) toast('التقرير اتنسخ — الصقه في محادثة Claude')
    else await deliverFile(new File([md], `${p.name}-report-${today}.md`, { type: 'text/markdown' }))
  })
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="الإنجاز" value={`${pr.pct ?? 0}%`} sub={`${pr.done}/${pr.total} مهام`} />
        <Stat label="متبقي" value={fmtMinutes(fc.remainingMin)} sub={`${fc.dailyRateMin} د/يوم مسجلة`} />
        <Stat label="المتوقع" value={end ? dayLabel(end, today) : '—'} sub={p.targetDate ? `المستهدف ${fmtDayShort(p.targetDate)}` : 'بدون موعد مستهدف'}
          tone={fc.slipDays && fc.slipDays > 0 ? 'danger' : 'accent'} />
      </div>
      <Bar value={(pr.pct ?? 0) / 100} label="تقدم المشروع" />
      {fc.slipDays !== undefined && fc.slipDays > 0 && (
        <p className="rounded-2xl bg-danger/10 p-3 text-sm text-danger">متوقع يتأخر {fc.slipDays} يوم عن المستهدف. خيارات: قلل النطاق، زوّد الوقت (جرّب «ماذا لو؟»)، أو حرّك الموعد وسجّل السبب.</p>
      )}
      <p className="text-[11px] text-muted">التقدم = متوسط نسب إنجاز المهام ({p.weighting === 'equal' ? 'وزن متساوٍ' : p.weighting === 'estimate' ? 'بالوزن حسب المدة' : 'بأوزان مخصصة'}). المتوقع من خطة المحرك{fc.beyondHorizon ? '، وبعد أفق التخطيط من معدل وقتك المسجل' : ''}.</p>

      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => quick.open({ projectId: p.id })}>+ مهمة</Button>
        <Button variant="soft" className="flex-1" onClick={() => void report()}>تقرير حالة لـ Claude</Button>
      </div>

      <Section title="المراحل">
        <div className="space-y-2">
          {ms.map((m, i) => {
            const mp = milestoneProgress(m, data.tasks, s)
            const children = ms.filter((x) => x.parentId === m.id)
            if (m.parentId && ms.some((x) => x.id === m.parentId)) return null
            return (
              <div key={m.id} className="glass space-y-1.5 p-3.5">
                <div className="flex items-center gap-2">
                  <input type="checkbox" aria-label={`إنهاء ${m.title}`} className="h-5 w-5" checked={m.status === 'done'} onChange={() => void safe(() => updateMilestone(m.id, { status: m.status === 'done' ? 'open' : 'done' }))} />
                  <span className={`flex-1 font-medium ${m.status === 'done' ? 'text-muted line-through' : ''}`}>{m.title}</span>
                  {m.dueDate && <Chip tone={m.status !== 'done' && m.dueDate < today ? 'danger' : 'muted'}>{fmtDayShort(m.dueDate)}</Chip>}
                  <span className="text-xs text-muted num">{mp.pct ?? 0}%</span>
                </div>
                <Bar value={(mp.pct ?? 0) / 100} label={m.title} />
                <div className="flex gap-3 text-xs">
                  <input type="date" aria-label={`موعد ${m.title}`} className="py-1 text-xs" value={m.dueDate ?? ''} onChange={(e) => void safe(() => updateMilestone(m.id, { dueDate: e.target.value || undefined }))} />
                  {i > 0 && <button type="button" className="text-muted" onClick={() => void safe(async () => { await updateMilestone(m.id, { order: ms[i - 1]!.order }); await updateMilestone(ms[i - 1]!.id, { order: m.order }) })}>↑ لفوق</button>}
                  <button type="button" className="text-muted" onClick={() => void safe(() => createMilestone({ title: `${m.title} — فرعية`, projectId: p.id, parentId: m.id }))}>+ فرعية</button>
                  <button type="button" className="text-danger" onClick={() => void safe(async () => { if (confirm('تحذف المرحلة؟ المهام هتفضل.')) await deleteMilestone(m.id) })}>حذف</button>
                </div>
                {children.map((c) => (
                  <div key={c.id} className="mr-6 flex items-center gap-2 text-sm">
                    <input type="checkbox" aria-label={`إنهاء ${c.title}`} checked={c.status === 'done'} onChange={() => void safe(() => updateMilestone(c.id, { status: c.status === 'done' ? 'open' : 'done' }))} />
                    <CommitText ariaLabel="اسم المرحلة الفرعية" value={c.title} onCommit={(v) => v.trim() && void safe(() => updateMilestone(c.id, { title: v.trim() }))} className="py-1 text-sm" />
                    <button type="button" aria-label="حذف" className="text-muted" onClick={() => void safe(() => deleteMilestone(c.id))}>{LI.close('h-4 w-4')}</button>
                  </div>
                ))}
              </div>
            )
          })}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newMs.trim()) void safe(async () => { await createMilestone({ title: newMs.trim(), projectId: p.id, order: ms.length }); setNewMs('') }) }}>
            <input aria-label="مرحلة جديدة" placeholder="مرحلة جديدة (مثلًا: MVP)" className="flex-1" value={newMs} onChange={(e) => setNewMs(e.target.value)} />
            <Button variant="soft" type="submit" className="px-3 py-2">+</Button>
          </form>
        </div>
      </Section>

      {(bl.waiting.length > 0 || bl.bottlenecks.length > 0 || bl.overdue.length > 0) && (
        <Section title="اللي معطّل المشروع">
          <div className="glass space-y-2 p-4 text-sm">
            {bl.bottlenecks.slice(0, 3).map((b) => <p key={b.task.id}>🚧 <b>{b.task.title}</b> معطّلة {b.dependents} مهمة</p>)}
            {bl.waiting.slice(0, 5).map((w) => <p key={w.task.id} className="text-muted">⏳ {w.task.title} ← مستنية {w.on.map((x) => x.title).join('، ')}</p>)}
            {bl.overdue.map((t) => <p key={t.id} className="text-danger">⚠️ {t.title} متأخرة</p>)}
          </div>
        </Section>
      )}
    </div>
  )
}

function Board({ p }: { p: Project }) {
  const { data } = useLife()
  const safe = useSafe()
  const tasks = tasksOf(p, data.tasks)
  const move = (t: Task, dir: 1 | -1) => {
    const i = BOARD.indexOf(t.status === 'cancelled' ? 'done' : t.status)
    const next = BOARD[Math.min(BOARD.length - 1, Math.max(0, i + dir))]!
    if (next !== t.status) void safe(() => updateTask(t.id, { status: next }))
  }
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
      {BOARD.map((st) => {
        const col = tasks.filter((t) => t.status === st)
        return (
          <div key={st} className="w-64 shrink-0 snap-start space-y-2" data-testid={`col-${st}`}>
            <div className="flex items-center justify-between px-1"><h3 className="font-semibold">{STATUS_LABEL[st]}</h3><span className="text-xs text-muted num">{col.length}</span></div>
            {col.map((t) => (
              <div key={t.id} className="glass space-y-2 p-3">
                <a href={`#/tasks/${t.id}`} className="block text-sm font-medium">{t.title}</a>
                {t.progress > 0 && t.status !== 'done' && <Bar value={t.progress / 100} label={t.title} />}
                <div className="flex justify-between">
                  <button type="button" aria-label="للعمود اللي قبله" className="rounded-lg bg-white/70 px-2 text-sm" onClick={() => move(t, -1)} disabled={st === 'new'}>→</button>
                  <button type="button" aria-label="للعمود اللي بعده" className="rounded-lg bg-white/70 px-2 text-sm" onClick={() => move(t, 1)} disabled={st === 'done'}>←</button>
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function ListView({ p }: { p: Project }) {
  const { data, proposal } = useLife()
  const ms = data.milestones.filter((m) => m.projectId === p.id).sort((a, b) => a.order - b.order)
  const tasks = tasksOf(p, data.tasks).sort((a, b) => Number(!isOpen(a)) - Number(!isOpen(b)) || (proposal.scores[b.id]?.score ?? 0) - (proposal.scores[a.id]?.score ?? 0))
  const groups = [...ms.map((m) => ({ key: m.id, title: m.title, items: tasks.filter((t) => t.milestoneId === m.id) })), { key: '-', title: 'بدون مرحلة', items: tasks.filter((t) => !t.milestoneId || !ms.some((m) => m.id === t.milestoneId)) }]
  if (!tasks.length) return <Empty>مفيش مهام في المشروع لسه.</Empty>
  return (
    <div className="space-y-4">
      {groups.filter((g) => g.items.length).map((g) => (
        <Section key={g.key} title={g.title}><div className="space-y-2">{g.items.map((t) => <TaskRow key={t.id} task={t} showProject={false} />)}</div></Section>
      ))}
    </div>
  )
}

function Timeline({ p }: { p: Project }) {
  const { data, proposal, today } = useLife()
  const tasks = tasksOf(p, data.tasks)
  const ms = data.milestones.filter((m) => m.projectId === p.id && m.dueDate)
  const rows = [
    ...tasks.map((t) => {
      const blocks = proposal.blocks.filter((b) => b.taskId === t.id)
      const start = blocks[0]?.day ?? t.startDate ?? (t.completedAt ? dayKey(t.completedAt) : undefined)
      const end = blocks.at(-1)?.day ?? (t.dueAt ? dayKey(t.dueAt) : start)
      return { id: t.id, title: t.title, start, end, due: t.dueAt ? dayKey(t.dueAt) : undefined, done: t.status === 'done', kind: 'task' as const }
    }),
    ...ms.map((m) => ({ id: m.id, title: `◆ ${m.title}`, start: m.dueDate, end: m.dueDate, due: m.dueDate, done: m.status === 'done', kind: 'ms' as const })),
  ].filter((r) => r.start && r.end) as { id: string; title: string; start: string; end: string; due?: string; done: boolean; kind: 'task' | 'ms' }[]
  if (!rows.length) return <Empty>مفيش تواريخ بعد. حط مواعيد للمهام أو المراحل، أو اعتمد خطة.</Empty>
  const from = [today, ...rows.map((r) => r.start)].sort()[0]!
  const to = [addDays(today, 14), ...rows.map((r) => r.end), p.targetDate ?? today].sort().at(-1)!
  const span = Math.max(1, diffDays(from, to) + 1)
  const pos = (d: string) => (diffDays(from, d) / span) * 100
  rows.sort((a, b) => a.start.localeCompare(b.start))
  return (
    <div className="glass space-y-2 overflow-hidden p-4" data-testid="project-timeline">
      <div className="flex justify-between text-[11px] text-muted"><span>{fmtDayShort(from)}</span><span>{fmtDayShort(to)}</span></div>
      <div className="relative space-y-1.5">
        <div className="absolute inset-y-0 w-px bg-danger/60" style={{ right: `${pos(today)}%` }} aria-hidden />
        {p.targetDate && <div className="absolute inset-y-0 w-0.5 bg-ink/40" style={{ right: `${pos(p.targetDate)}%` }} aria-label="الموعد المستهدف" />}
        {rows.map((r) => (
          <div key={r.id} className="relative h-7">
            <div className={`absolute top-0 flex h-7 items-center overflow-hidden whitespace-nowrap rounded-lg px-2 text-[11px] ${r.kind === 'ms' ? 'bg-ink text-white' : r.done ? 'bg-accent/20 text-muted' : r.due && r.end > r.due ? 'bg-danger/20' : 'bg-accent/30'}`}
              style={{ right: `${pos(r.start)}%`, width: `max(${((diffDays(r.start, r.end) + 1) / span) * 100}%, 4.5rem)` }}>{r.title}</div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted">الخط الأحمر = النهارده، الرمادي = الموعد المستهدف. البلوك الأحمر = متوقع يعدّي موعده.</p>
    </div>
  )
}

function Log({ p }: { p: Project }) {
  const { data, today } = useLife()
  const safe = useSafe()
  const [kind, setKind] = useState<NoteKind>('decision')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const notes = data.notes.filter((n) => n.projectId === p.id && !n.deletedAt).sort((a, b) => b.createdAt - a.createdAt)
  return (
    <div className="space-y-3">
      <div className="glass space-y-2 p-4">
        <div className="flex gap-1.5">
          {(['decision', 'risk', 'issue', 'note'] as NoteKind[]).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full px-3 py-1 text-sm ${kind === k ? 'bg-ink text-white' : 'bg-white/70 text-muted'}`}>{NOTE_KIND_LABEL[k]}</button>
          ))}
        </div>
        <input aria-label="العنوان" className="w-full" placeholder={kind === 'decision' ? 'القرار' : kind === 'risk' ? 'الخطر المحتمل' : kind === 'issue' ? 'المشكلة' : 'ملاحظة فنية'} value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea aria-label="التفاصيل" className="w-full" rows={2} placeholder={kind === 'decision' ? 'السبب والبدائل اللي اترفضت' : 'التفاصيل'} value={body} onChange={(e) => setBody(e.target.value)} />
        <Button className="w-full" onClick={() => void safe(async () => { if (!title.trim()) throw new Error('اكتب عنوان'); await saveNote({ kind, title: title.trim(), body, projectId: p.id, day: today }); setTitle(''); setBody('') }, 'اتسجل')}>تسجيل</Button>
      </div>
      {notes.length === 0 ? <Empty>سجّل القرارات المهمة وأسبابها، والمخاطر والعقبات، عشان ترجعلها وتديها لـ Claude.</Empty> : notes.map((n) => (
        <div key={n.id} className="glass space-y-1 p-3.5">
          <div className="flex items-center gap-2">
            <Chip tone={n.kind === 'risk' || n.kind === 'issue' ? (n.open ? 'danger' : 'muted') : 'accent'}>{NOTE_KIND_LABEL[n.kind]}</Chip>
            <span className="flex-1 font-medium">{n.title}</span>
            <span className="text-[11px] text-muted">{fmtDayShort(dayKey(n.createdAt))}</span>
          </div>
          {n.body && <p className="whitespace-pre-wrap text-sm text-muted">{n.body}</p>}
          {(n.kind === 'risk' || n.kind === 'issue') && (
            <button type="button" className="text-xs font-semibold text-accent" onClick={() => void safe(() => saveNote({ ...n, open: !n.open }))}>{n.open ? 'اقفلها (اتحلت)' : 'افتحها تاني'}</button>
          )}
        </div>
      ))}
    </div>
  )
}

function Settings({ p }: { p: Project }) {
  const { data } = useLife()
  const safe = useSafe()
  const toast = useToast()
  const nav = useNavigate()
  const [tplOpen, setTplOpen] = useState(false)
  const [tplName, setTplName] = useState(`قالب ${p.name}`)
  const up = (patch: Partial<Project>) => void safe(() => updateProject(p.id, patch))
  return (
    <div className="glass space-y-3 p-4">
      <Field label="الاسم"><CommitText ariaLabel="اسم المشروع" value={p.name} onCommit={(v) => v.trim() && up({ name: v.trim() })} /></Field>
      <Field label="الوصف"><CommitText multiline ariaLabel="وصف المشروع" value={p.description ?? ''} onCommit={(v) => up({ description: v || undefined })} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="الحالة">
          <select className="w-full" value={p.status} onChange={(e) => up({ status: e.target.value as ProjectStatus })}>
            <option value="active">نشط</option><option value="paused">متوقف</option><option value="done">مكتمل</option><option value="archived">مؤرشف</option>
          </select>
        </Field>
        <Field label="حساب التقدم">
          <select className="w-full" value={p.weighting} onChange={(e) => up({ weighting: e.target.value as ProgressWeighting })}>
            <option value="equal">وزن متساوٍ</option><option value="estimate">حسب المدة</option><option value="custom">أوزان مخصصة</option>
          </select>
        </Field>
        <Field label="تاريخ البدء"><input type="date" className="w-full" value={p.startDate ?? ''} onChange={(e) => up({ startDate: e.target.value || undefined })} /></Field>
        <Field label="الموعد المستهدف"><input type="date" className="w-full" value={p.targetDate ?? ''} onChange={(e) => up({ targetDate: e.target.value || undefined })} /></Field>
        <Field label="الهدف">
          <select className="w-full" value={p.goalId ?? ''} onChange={(e) => up({ goalId: e.target.value || undefined })}>
            <option value="">بدون</option>
            {data.goals.filter((g) => !g.deletedAt).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </Field>
        <Field label="التصنيف"><CommitText ariaLabel="تصنيف المشروع" value={p.category ?? ''} onCommit={(v) => up({ category: v || undefined })} /></Field>
      </div>
      <div className="flex flex-wrap gap-2">
        {PROJECT_COLORS.map((c) => (
          <button key={c} type="button" aria-label={`لون ${c}`} onClick={() => up({ color: c })} className={`h-8 w-8 rounded-full ${p.color === c ? 'ring-2 ring-ink ring-offset-2' : ''}`} style={{ background: c }} />
        ))}
      </div>
      <Button variant="soft" className="w-full" onClick={() => setTplOpen(true)}>احفظ كقالب قابل لإعادة الاستخدام</Button>
      {p.deletedAt
        ? <Button variant="soft" className="w-full" onClick={() => void safe(() => restoreProject(p.id), 'اترجع')}>استرجاع</Button>
        : <Button variant="danger" className="w-full" onClick={() => void safe(async () => { if (!confirm('تنقل المشروع لسلة المحذوفات؟ المهام هتفضل.')) return; await deleteProject(p.id); toast('اتنقل لسلة المحذوفات'); nav('/projects') })}>حذف المشروع</Button>}
      <p className="text-[11px] text-muted">الأرشفة بتخفي المشروع من القوائم من غير ما تمسح تاريخه أو مهامه.</p>
      {tplOpen && (
        <Sheet open onClose={() => setTplOpen(false)} title="حفظ كقالب" footer={<Button className="w-full" onClick={() => void safe(async () => { await projectAsTemplate(p.id, tplName.trim() || p.name); setTplOpen(false) }, 'القالب اتحفظ')}>حفظ</Button>}>
          <Field label="اسم القالب" hint="بيتحفظ المراحل والمهام والمدد والاعتماديات، والمواعيد كإزاحة من تاريخ البدء."><input className="w-full" value={tplName} onChange={(e) => setTplName(e.target.value)} /></Field>
        </Sheet>
      )}
    </div>
  )
}
