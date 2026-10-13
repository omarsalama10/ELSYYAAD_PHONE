import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { lifeDb } from '../db/db'
import { instantiateProjectTemplate, saveTemplate, taskFromTemplate, uid } from '../db/repo'
import type { Template } from '../domain/types'
import { useLife } from '../state'
import { Button } from '../../ui/primitives'
import { useSafe } from '../../ui/Toast'
import { Empty, Field, Header, Sheet } from '../ui/kit'

export function TemplatesScreen() {
  const { data, today } = useLife()
  const safe = useSafe()
  const nav = useNavigate()
  const [use, setUse] = useState<Template | null>(null)
  const [name, setName] = useState('')
  const [start, setStart] = useState(today)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ title: '', estimate: '', steps: '' })
  return (
    <div className="space-y-3">
      <Header back title="القوالب" sub="احفظ مشروع أو مهمة كقالب من شاشتها، أو اعمل قالب مهمة هنا" />
      <Button className="w-full" onClick={() => setCreating(true)}>+ قالب مهمة</Button>
      {data.templates.length === 0 ? <Empty>مفيش قوالب لسه.</Empty> : data.templates.map((t) => (
        <div key={t.id} className="glass flex items-center gap-2 p-3.5">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{t.name}</span>
            <span className="text-xs text-muted">{t.kind === 'project' ? `مشروع • ${t.payload.milestones.length} مراحل • ${t.payload.tasks.length} مهام` : `مهمة • ${t.payload.checklist.length} خطوات`}</span>
          </span>
          <Button variant="soft" className="px-3 py-1.5 text-sm" onClick={() => { setUse(t); setName(t.kind === 'project' ? t.payload.name : t.payload.title) }}>استخدم</Button>
          <button type="button" aria-label={`حذف ${t.name}`} className="px-1 text-sm text-danger" onClick={() => void safe(async () => { if (confirm('تحذف القالب؟')) await lifeDb.templates.delete(t.id) })}>حذف</button>
        </div>
      ))}
      {use && (
        <Sheet open onClose={() => setUse(null)} title={use.name} footer={
          <Button className="w-full" onClick={() => void safe(async () => {
            if (use.kind === 'project') { const p = await instantiateProjectTemplate(use.id, name.trim() || use.name, start); nav(`/projects/${p.id}`) }
            else { const t = await taskFromTemplate(use.id, { title: name.trim() || use.payload.title }); nav(`/tasks/${t.id}`) }
            setUse(null)
          })}>إنشاء</Button>
        }>
          <Field label="الاسم"><input className="w-full" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          {use.kind === 'project' && <Field label="تاريخ البدء" hint="مواعيد المراحل والمهام بتتحسب من التاريخ ده"><input type="date" className="w-full" value={start} onChange={(e) => setStart(e.target.value)} /></Field>}
        </Sheet>
      )}
      {creating && (
        <Sheet open onClose={() => setCreating(false)} title="قالب مهمة" footer={
          <Button className="w-full" onClick={() => void safe(async () => {
            if (!draft.title.trim()) throw new Error('اكتب العنوان')
            await saveTemplate({ id: uid(), kind: 'task', name: draft.title.trim(), createdAt: Date.now(), payload: { title: draft.title.trim(), estimateMin: Number(draft.estimate) || undefined, checklist: draft.steps.split('\n').map((x) => x.trim()).filter(Boolean) } })
            setCreating(false)
            setDraft({ title: '', estimate: '', steps: '' })
          }, 'اتحفظ')}>حفظ</Button>
        }>
          <Field label="العنوان"><input className="w-full" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="مراجعة أسبوعية" /></Field>
          <Field label="المدة (دقيقة)"><input type="number" className="ltr w-full" value={draft.estimate} onChange={(e) => setDraft({ ...draft, estimate: e.target.value })} /></Field>
          <Field label="الخطوات (سطر لكل خطوة)"><textarea className="w-full" rows={5} value={draft.steps} onChange={(e) => setDraft({ ...draft, steps: e.target.value })} /></Field>
        </Sheet>
      )}
    </div>
  )
}
