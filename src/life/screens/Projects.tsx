import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createProject, instantiateProjectTemplate } from '../db/repo'
import { remainingMinutes } from '../domain/priority'
import { projectForecast, projectProgress } from '../domain/progress'
import type { Project } from '../domain/types'
import { useLife } from '../state'
import { Button } from '../../ui/primitives'
import { useSafe } from '../../ui/Toast'
import { dayLabel, fmtDayShort } from '../ui/format'
import { LI } from '../ui/icons'
import { Bar, Chip, Empty, Field, Header, IconBtn, Sheet, Tabs } from '../ui/kit'

type Filter = 'active' | 'paused' | 'done' | 'archived'

export function ProjectsScreen() {
  const { data } = useLife()
  const [filter, setFilter] = useState<Filter>('active')
  const [creating, setCreating] = useState(false)
  const list = data.projects.filter((p) => !p.deletedAt && p.status === filter).sort((a, b) => (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999'))
  return (
    <div className="space-y-3">
      <Header title="المشاريع" action={<IconBtn label="مشروع جديد" tone="accent" onClick={() => setCreating(true)}>{LI.plus()}</IconBtn>} />
      <Tabs<Filter> value={filter} onChange={setFilter} tabs={[{ value: 'active', label: 'نشطة' }, { value: 'paused', label: 'متوقفة' }, { value: 'done', label: 'مكتملة' }, { value: 'archived', label: 'الأرشيف' }]} />
      {list.length === 0 ? (
        <Empty action={filter === 'active' ? <Button variant="soft" onClick={() => setCreating(true)}>+ مشروع</Button> : undefined}>مفيش مشاريع هنا.</Empty>
      ) : list.map((p) => <ProjectCard key={p.id} p={p} />)}
      {creating && <NewProjectSheet onClose={() => setCreating(false)} />}
    </div>
  )
}

function ProjectCard({ p }: { p: Project }) {
  const { data, proposal, now, today } = useLife()
  const pr = projectProgress(p, data.tasks, data.settings)
  const fc = projectForecast(p, data.tasks, data.logs, proposal, (t) => remainingMinutes(t, data.settings), now)
  const end = fc.beyondHorizon ? fc.rateEnd : fc.plannedEnd
  const late = fc.slipDays !== undefined && fc.slipDays > 0
  return (
    <Link to={`/projects/${p.id}`} className="glass block space-y-2 p-4" data-testid="project-card">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.color }} />
        <h3 className="flex-1 truncate font-semibold">{p.name}</h3>
        <span className="text-sm font-bold num">{pr.pct ?? 0}%</span>
      </div>
      <Bar value={(pr.pct ?? 0) / 100} tone={late ? 'warn' : 'accent'} label={`تقدم ${p.name}`} />
      <div className="flex flex-wrap gap-1">
        <Chip>{pr.done}/{pr.total} مهام</Chip>
        {p.targetDate && <Chip tone={late ? 'warn' : 'muted'}>المستهدف {fmtDayShort(p.targetDate)}</Chip>}
        {end && pr.open > 0 && <Chip tone={late ? 'danger' : 'accent'}>المتوقع {dayLabel(end, today)}{late ? ` (+${fc.slipDays} يوم)` : ''}</Chip>}
        {fc.beyondHorizon && !fc.rateEnd && pr.open > 0 && <Chip tone="warn">مفيش وقت كافٍ في الخطة</Chip>}
      </div>
    </Link>
  )
}

function NewProjectSheet({ onClose }: { onClose: () => void }) {
  const { data, today } = useLife()
  const safe = useSafe()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [goalId, setGoalId] = useState('')
  const [tpl, setTpl] = useState('')
  const templates = data.templates.filter((t) => t.kind === 'project')
  const save = () => safe(async () => {
    if (!name.trim()) throw new Error('اكتب اسم المشروع')
    const p = tpl
      ? await instantiateProjectTemplate(tpl, name.trim(), today)
      : await createProject({ name: name.trim(), targetDate: target || undefined, goalId: goalId || undefined })
    onClose()
    nav(`/projects/${p.id}`)
  })
  return (
    <Sheet open onClose={onClose} title="مشروع جديد" footer={<Button className="w-full" onClick={() => void save()}>إنشاء</Button>}>
      <Field label="الاسم"><input autoFocus className="w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلًا: الإصدار الأول من البرنامج" /></Field>
      {templates.length > 0 && (
        <Field label="من قالب (اختياري)">
          <select className="w-full" value={tpl} onChange={(e) => setTpl(e.target.value)}>
            <option value="">بدون قالب</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      )}
      {!tpl && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="الموعد المستهدف"><input type="date" className="w-full" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
          <Field label="الهدف">
            <select className="w-full" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">بدون</option>
              {data.goals.filter((g) => !g.deletedAt).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </Field>
        </div>
      )}
    </Sheet>
  )
}
