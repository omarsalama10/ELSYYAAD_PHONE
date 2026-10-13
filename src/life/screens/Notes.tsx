import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { deleteNote, saveNote } from '../db/repo'
import { matches } from '../domain/text'
import { dayKey } from '../domain/time'
import type { Note, NoteKind } from '../domain/types'
import { useLife } from '../state'
import { Button } from '../../ui/primitives'
import { useSafe } from '../../ui/Toast'
import { fmtDayShort, NOTE_KIND_LABEL } from '../ui/format'
import { LI } from '../ui/icons'
import { Chip, Empty, Field, Header, IconBtn, Sheet, Tabs } from '../ui/kit'

type Filter = 'all' | NoteKind

export function NotesScreen() {
  const { data } = useLife()
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Partial<Note> | null>(null)
  const openId = params.get('open')
  useEffect(() => {
    if (!openId) return
    const n = data.notes.find((x) => x.id === openId)
    if (n) setEdit(n)
    setParams({}, { replace: true })
  }, [openId]) // runs once per deep link
  const projName = new Map(data.projects.map((p) => [p.id, p.name]))
  const list = data.notes
    .filter((n) => !n.deletedAt && (filter === 'all' || n.kind === filter) && (!q || matches(q, n.title, n.body, n.tags.join(' '), n.projectId && projName.get(n.projectId))))
    .sort((a, b) => b.updatedAt - a.updatedAt)
  return (
    <div className="space-y-3">
      <Header back title="الملاحظات والقرارات" sub="بنك أفكار، قرارات بأسبابها، مخاطر، وملاحظات مرتبطة بتاريخ" action={<IconBtn label="ملاحظة جديدة" tone="accent" onClick={() => setEdit({ kind: filter === 'all' ? 'note' : filter, title: '', body: '', tags: [] })}>{LI.plus()}</IconBtn>} />
      <input aria-label="بحث في الملاحظات" placeholder="بحث…" className="w-full" value={q} onChange={(e) => setQ(e.target.value)} />
      <Tabs<Filter> value={filter} onChange={setFilter} tabs={[{ value: 'all', label: 'الكل' }, { value: 'idea', label: 'أفكار' }, { value: 'note', label: 'ملاحظات' }, { value: 'decision', label: 'قرارات' }, { value: 'risk', label: 'مخاطر' }, { value: 'issue', label: 'مشاكل' }]} />
      {list.length === 0 ? <Empty>مفيش حاجة هنا لسه.</Empty> : list.map((n) => (
        <button key={n.id} type="button" className="glass block w-full space-y-1 p-3.5 text-right" onClick={() => setEdit(n)}>
          <div className="flex items-center gap-2">
            <Chip tone={n.kind === 'decision' ? 'accent' : n.kind === 'risk' || n.kind === 'issue' ? (n.open ? 'danger' : 'muted') : n.kind === 'idea' ? 'coral' : 'muted'}>{NOTE_KIND_LABEL[n.kind]}</Chip>
            <span className="flex-1 truncate font-medium">{n.title}</span>
            <span className="text-[11px] text-muted">{fmtDayShort(n.day ?? dayKey(n.createdAt))}</span>
          </div>
          {n.body && <p className="line-clamp-2 text-sm text-muted">{n.body}</p>}
          {n.projectId && <span className="text-[11px] text-muted">مشروع: {projName.get(n.projectId)}</span>}
        </button>
      ))}
      {edit && <NoteSheet value={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function NoteSheet({ value, onClose }: { value: Partial<Note>; onClose: () => void }) {
  const { data, today } = useLife()
  const safe = useSafe()
  const [n, setN] = useState<Partial<Note>>({ day: today, ...value })
  const save = () => safe(async () => {
    if (!n.title?.trim()) throw new Error('اكتب عنوان')
    await saveNote({ ...n, title: n.title.trim(), body: n.body ?? '', tags: n.tags ?? [] } as Note)
    onClose()
  })
  return (
    <Sheet open onClose={onClose} title={value.id ? 'تعديل' : 'جديد'} footer={
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => void save()}>حفظ</Button>
        {value.id && <Button variant="danger" onClick={() => void safe(async () => { await deleteNote(value.id!); onClose() })}>حذف</Button>}
      </div>
    }>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(NOTE_KIND_LABEL) as NoteKind[]).map((k) => (
          <button key={k} type="button" onClick={() => setN({ ...n, kind: k, open: k === 'risk' || k === 'issue' ? n.open ?? true : undefined })} className={`rounded-full px-3 py-1 text-sm ${n.kind === k ? 'bg-ink text-white' : 'bg-white/70 text-muted'}`}>{NOTE_KIND_LABEL[k]}</button>
        ))}
      </div>
      <Field label="العنوان"><input autoFocus className="w-full" value={n.title ?? ''} onChange={(e) => setN({ ...n, title: e.target.value })} /></Field>
      <Field label={n.kind === 'decision' ? 'السبب والبدائل' : 'التفاصيل'}><textarea className="w-full" rows={6} value={n.body ?? ''} onChange={(e) => setN({ ...n, body: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="مشروع">
          <select className="w-full" value={n.projectId ?? ''} onChange={(e) => setN({ ...n, projectId: e.target.value || undefined })}>
            <option value="">بدون</option>
            {data.projects.filter((p) => !p.deletedAt).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="هدف">
          <select className="w-full" value={n.goalId ?? ''} onChange={(e) => setN({ ...n, goalId: e.target.value || undefined })}>
            <option value="">بدون</option>
            {data.goals.filter((g) => !g.deletedAt).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </Field>
        <Field label="التاريخ"><input type="date" className="w-full" value={n.day ?? ''} onChange={(e) => setN({ ...n, day: e.target.value || undefined })} /></Field>
        <Field label="وسوم"><input className="w-full" value={(n.tags ?? []).join('، ')} onChange={(e) => setN({ ...n, tags: e.target.value.split(/[,،]/).map((x) => x.trim()).filter(Boolean) })} /></Field>
      </div>
      {(n.kind === 'risk' || n.kind === 'issue') && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="الخطورة">
            <select className="w-full" value={n.severity ?? 2} onChange={(e) => setN({ ...n, severity: Number(e.target.value) as 1 | 2 | 3 })}>
              <option value={1}>منخفضة</option><option value={2}>متوسطة</option><option value={3}>عالية</option>
            </select>
          </Field>
          <Field label="الحالة">
            <select className="w-full" value={n.open === false ? 'closed' : 'open'} onChange={(e) => setN({ ...n, open: e.target.value === 'open' })}>
              <option value="open">مفتوحة</option><option value="closed">اتحلت</option>
            </select>
          </Field>
        </div>
      )}
    </Sheet>
  )
}
