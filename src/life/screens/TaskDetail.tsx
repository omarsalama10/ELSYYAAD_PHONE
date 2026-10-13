import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { lifeDb } from '../db/db'
import {
  addAttachment, addComment, addManualLog, deleteAttachment, deleteLog, deleteTasks, duplicateTask, finishTask, pauseTimer, restoreTask,
  saveTemplate, startTimer, taskEvents, uid, updateTask,
} from '../db/repo'
import { isOpen, priorityLabel, remainingMinutes, wouldCreateCycle } from '../domain/priority'
import { describeRecurrence } from '../domain/recurrence'
import { suggestEstimate } from '../domain/text'
import { at, dayKey, fmtMinutes, hhmm, minuteOfDay } from '../domain/time'
import type { Attachment, Confidence, Energy, Recurrence, Task, TaskEvent, TaskStatus, TimeKind } from '../domain/types'
import { useLife } from '../state'
import { useNow, useObjectUrl } from '../../lib/hooks'
import { Button } from '../../ui/primitives'
import { useSafe, useToast } from '../../ui/Toast'
import { ENERGY_LABEL, fmtWhen, fromTimeInput, STATUS_LABEL, toTimeInput, WEEKDAY_NAMES, WEEKDAY_SHORT } from '../ui/format'
import { LI } from '../ui/icons'
import { Bar, Chip, CommitText, Empty, Field, Header, Section, Sheet, Toggle } from '../ui/kit'
import { usePlanActions } from '../ui/planActions'

const STATUSES: TaskStatus[] = ['new', 'planned', 'in_progress', 'paused', 'done', 'cancelled']

export function TaskDetail() {
  const { id } = useParams()
  const life = useLife()
  const { data, today, taskById, proposal } = life
  const safe = useSafe()
  const toast = useToast()
  const nav = useNavigate()
  const actions = usePlanActions()
  const tick = useNow(1000)
  const events = useLiveQuery(() => (id ? taskEvents(id) : Promise.resolve([] as TaskEvent[])), [id, data.events.length])
  const attachments = useLiveQuery(async () => (id ? await lifeDb.attachments.where('taskId').equals(id).toArray() : []), [id])
  const fileRef = useRef<HTMLInputElement>(null)
  const [comment, setComment] = useState('')
  const [newItem, setNewItem] = useState('')
  const [newLink, setNewLink] = useState('')
  const [depOpen, setDepOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const t = id ? taskById.get(id) : undefined
  if (!t) return <div className="pt-safe"><Header title="المهمة" back /><Empty>المهمة مش موجودة.</Empty></div>

  const patch = (p: Partial<Task>, reason?: string) => void safe(() => updateTask(t.id, p, { reason }))
  const s = data.settings
  const running = life.runningTaskId === t.id
  const log = data.logs.find((l) => l.end === undefined && l.taskId === t.id)
  const projects = data.projects.filter((p) => !p.deletedAt)
  const milestones = data.milestones.filter((m) => m.projectId === t.projectId || (!t.projectId && m.goalId === t.goalId))
  const goals = data.goals.filter((g) => !g.deletedAt)
  const deps = t.dependsOn.map((d) => taskById.get(d)).filter((x): x is Task => !!x)
  const dependents = data.tasks.filter((x) => !x.deletedAt && x.dependsOn.includes(t.id))
  const score = proposal.scores[t.id]
  const finish = proposal.finishAt[t.id]
  const risk = proposal.atRisk.find((r) => r.taskId === t.id)
  const unsched = proposal.unscheduled.find((u) => u.taskId === t.id)
  const suggestion = suggestEstimate(t, data.tasks.filter((x) => x.id !== t.id))
  const logs = data.logs.filter((l) => l.taskId === t.id).sort((a, b) => b.start - a.start)
  const dueDay = t.dueAt !== undefined ? dayKey(t.dueAt) : ''
  const dueMin = t.dueAt !== undefined ? minuteOfDay(t.dueAt) : 23 * 60 + 59

  return (
    <div className="space-y-4 pb-8">
      <Header back title={t.recurrence ? 'مهمة متكررة' : 'المهمة'} sub={t.deletedAt ? 'في سلة المحذوفات' : undefined} />
      {t.deletedAt && <Button variant="soft" className="w-full" onClick={() => void safe(() => restoreTask(t.id), 'اترجعت')}>استرجاع المهمة</Button>}

      <div className="glass space-y-3 p-4">
        <CommitText ariaLabel="العنوان" value={t.title} onCommit={(v) => v.trim() && patch({ title: v.trim() })} className="text-lg font-semibold" />
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((st) => (
            <button key={st} type="button" onClick={() => patch({ status: st })} aria-pressed={t.status === st}
              className={`rounded-full px-3 py-1 text-sm ${t.status === st ? 'bg-ink text-white' : 'bg-white/70 text-muted'}`}>{STATUS_LABEL[st]}</button>
          ))}
        </div>
        {!t.recurrence && isOpen(t) && (
          <div className="flex gap-2">
            {running
              ? <Button variant="soft" className="flex-1" onClick={() => void safe(() => pauseTimer())}>⏸ إيقاف ({fmtMinutes((tick - log!.start) / 60_000)})</Button>
              : <Button className="flex-1" onClick={() => void safe(() => startTimer(t.id))}>▶ ابدأ المؤقت</Button>}
            <Button variant="soft" className="flex-1" onClick={() => void safe(async () => { await finishTask(t.id); toast('برافو ✅') })}>✓ خلصت</Button>
            <Button variant="soft" onClick={() => nav(`/focus?task=${t.id}`)} aria-label="جلسة تركيز">{LI.focus()}</Button>
          </div>
        )}
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted"><span>الإنجاز</span><span className="num">{t.progress}%</span></div>
          <input type="range" aria-label="نسبة الإنجاز" min={0} max={100} step={5} value={t.progress} className="w-full accent-[rgb(31,143,118)]"
            onChange={(e) => patch({ progress: Number(e.target.value) })} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-white/60 p-2"><div className="text-muted">المقدّر</div><div className="font-semibold num">{t.estimateMin ? fmtMinutes(t.estimateMin) : '—'}</div></div>
          <div className="rounded-xl bg-white/60 p-2"><div className="text-muted">الفعلي</div><div className={`font-semibold num ${t.estimateMin && t.actualMin > t.estimateMin ? 'text-warn' : ''}`}>{fmtMinutes(t.actualMin)}</div></div>
          <div className="rounded-xl bg-white/60 p-2"><div className="text-muted">المتبقي</div><div className="font-semibold num">{fmtMinutes(remainingMinutes(t, s))}</div></div>
        </div>
      </div>

      {/* Plan insight */}
      {!t.recurrence && isOpen(t) && (
        <div className="glass space-y-2 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold">الأولوية {score ? `${score.score} — ${priorityLabel(score.score).label}` : '—'}</span>
            <Toggle label="تثبيت أولوية يدوية" checked={t.priorityOverride !== undefined} onChange={(v) => patch({ priorityOverride: v ? score?.score ?? 50 : undefined })} />
          </div>
          {t.priorityOverride !== undefined ? (
            <input type="range" aria-label="أولوية يدوية" min={0} max={100} value={t.priorityOverride} className="w-full" onChange={(e) => patch({ priorityOverride: Number(e.target.value) })} />
          ) : score && (
            <div className="grid grid-cols-4 gap-1 text-[11px] text-muted">
              <span>الأهمية {Math.round(score.importance * 100)}</span><span>الاستعجال {Math.round(score.urgency * 100)}</span>
              <span>بتعطّل {Math.round(score.blocking * 5)}</span><span>تأجيل {Math.round(score.delay * 5)}</span>
            </div>
          )}
          <p className="text-muted">
            {finish ? <>متوقع تخلص: <b className="text-ink">{fmtWhen(finish, today)}</b></> : unsched ? (unsched.reason === 'no_capacity' ? 'مفيش وقت كفاية ليها في أفق التخطيط' : unsched.reason === 'dependency_unscheduled' ? 'مستنية مهمة غير مجدولة' : 'بدايتها بعد أفق التخطيط') : 'مش مجدولة'}
            {risk && risk.kind !== 'tight' && <span className="text-danger"> • معرضة تفوت موعدها</span>}
            {risk?.kind === 'tight' && <span className="text-warn"> • هامش ضيق</span>}
          </p>
          {t.pinned ? (
            <div className="flex items-center justify-between rounded-xl bg-accent/10 px-3 py-2">
              <span>مثبتة {fmtWhen(at(t.pinned.day, t.pinned.startMin), today)}</span>
              <button type="button" className="text-sm font-semibold text-accent" onClick={() => void safe(() => actions.unpin(t))}>إلغاء التثبيت</button>
            </div>
          ) : (
            <PinEditor onPin={(day, startMin) => void safe(() => actions.moveBlock({ id: 'x', day, startMin, endMin: startMin + 30, kind: 'task', title: t.title, taskId: t.id }, startMin, day))} />
          )}
        </div>
      )}

      <Section title="التفاصيل">
        <div className="glass grid grid-cols-2 gap-3 p-4">
          <Field label="المشروع">
            <select className="w-full" value={t.projectId ?? ''} onChange={(e) => patch({ projectId: e.target.value || undefined, milestoneId: undefined })}>
              <option value="">بدون</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="المرحلة">
            <select className="w-full" value={t.milestoneId ?? ''} onChange={(e) => patch({ milestoneId: e.target.value || undefined })}>
              <option value="">بدون</option>
              {milestones.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </Field>
          <Field label="الهدف">
            <select className="w-full" value={t.goalId ?? ''} onChange={(e) => patch({ goalId: e.target.value || undefined })}>
              <option value="">بدون</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </Field>
          <Field label="التصنيف"><CommitText ariaLabel="التصنيف" value={t.category ?? ''} onCommit={(v) => patch({ category: v.trim() || undefined })} placeholder="شغل، دراسة…" /></Field>
          <Field label="الأهمية (1–5)">
            <select className="w-full" value={t.importance} onChange={(e) => patch({ importance: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}{n === 5 ? ' — حرجة' : n === 1 ? ' — بسيطة' : ''}</option>)}
            </select>
          </Field>
          <Field label="نوع المجهود">
            <select className="w-full" value={t.energy} onChange={(e) => patch({ energy: e.target.value as Energy })}>
              {(Object.keys(ENERGY_LABEL) as Energy[]).map((k) => <option key={k} value={k}>{ENERGY_LABEL[k]}</option>)}
            </select>
          </Field>
          <Field label="تبدأ من">
            <input type="date" className="w-full" value={t.startDate ?? ''} onChange={(e) => patch({ startDate: e.target.value || undefined })} />
          </Field>
          <Field label="الموعد النهائي">
            <input type="date" className="w-full" value={dueDay} onChange={(e) => patch({ dueAt: e.target.value ? at(e.target.value, dueMin) : undefined })} />
          </Field>
          {t.dueAt !== undefined && (
            <Field label="ساعة الموعد" hint="فاضي = آخر اليوم">
              <input type="time" className="ltr w-full" value={dueMin >= 23 * 60 + 59 ? '' : toTimeInput(dueMin)} onChange={(e) => patch({ dueAt: at(dueDay, e.target.value ? fromTimeInput(e.target.value) : 23 * 60 + 59) })} />
            </Field>
          )}
          <Field label="المدة المتوقعة (دقيقة)" hint={suggestion && !t.estimateMin ? <button type="button" className="text-accent" onClick={() => patch({ estimateMin: suggestion.minutes, confidence: 'rough' })}>اقتراح من سجلك: {fmtMinutes(suggestion.minutes)} ({suggestion.basis} مهام مشابهة)</button> : undefined}>
            <CommitText ariaLabel="المدة المتوقعة" value={t.estimateMin ? String(t.estimateMin) : ''} onCommit={(v) => { const n = Number(v); patch({ estimateMin: v && n > 0 ? Math.round(n) : undefined }) }} className="ltr" />
          </Field>
          <Field label="دقة التقدير">
            <select className="w-full" value={t.confidence} onChange={(e) => patch({ confidence: e.target.value as Confidence })}>
              <option value="firm">مؤكدة</option>
              <option value="rough">تقديرية (+{Math.round((s.roughFactor - 1) * 100)}% هامش)</option>
            </select>
          </Field>
          <Field label="أقصى جلسة (دقيقة)" hint={`فاضي = ${s.defaultSessionMin}`}>
            <CommitText ariaLabel="أقصى جلسة" value={t.maxSessionMin ? String(t.maxSessionMin) : ''} onCommit={(v) => patch({ maxSessionMin: Number(v) > 0 ? Math.round(Number(v)) : undefined })} className="ltr" />
          </Field>
          <Field label="الوزن في المشروع" hint="لو المشروع بأوزان مخصصة">
            <CommitText ariaLabel="الوزن" value={t.weight !== undefined ? String(t.weight) : ''} onCommit={(v) => patch({ weight: v === '' ? undefined : Math.max(0, Number(v)) })} className="ltr" />
          </Field>
          <div className="col-span-2"><Field label="الوصف"><CommitText multiline ariaLabel="الوصف" value={t.description ?? ''} onCommit={(v) => patch({ description: v || undefined })} /></Field></div>
          <div className="col-span-2"><Field label="ملاحظات"><CommitText multiline ariaLabel="ملاحظات" value={t.notes ?? ''} onCommit={(v) => patch({ notes: v || undefined })} /></Field></div>
          <div className="col-span-2"><Field label="وسوم (مفصولة بفاصلة)"><CommitText ariaLabel="وسوم" value={t.tags.join('، ')} onCommit={(v) => patch({ tags: v.split(/[,،]/).map((x) => x.trim()).filter(Boolean) })} /></Field></div>
        </div>
      </Section>

      <RecurrenceEditor task={t} onChange={(r) => patch({ recurrence: r })} />

      <Section title={`قائمة التحقق ${t.checklist.length ? `(${t.checklist.filter((c) => c.done).length}/${t.checklist.length})` : ''}`}>
        <div className="glass space-y-2 p-4">
          {t.checklist.length > 0 && <Bar value={t.checklist.filter((c) => c.done).length / t.checklist.length} label="قائمة التحقق" />}
          {t.checklist.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2">
              <input type="checkbox" aria-label={c.title} className="h-5 w-5" checked={c.done} onChange={() => patch({ checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })} />
              <span className={`flex-1 text-sm ${c.done ? 'text-muted line-through' : ''}`}>{c.title}</span>
              {i > 0 && <button type="button" aria-label="لفوق" className="text-muted" onClick={() => { const xs = [...t.checklist]; [xs[i - 1], xs[i]] = [xs[i]!, xs[i - 1]!]; patch({ checklist: xs }) }}>↑</button>}
              <button type="button" aria-label={`حذف ${c.title}`} className="text-muted" onClick={() => patch({ checklist: t.checklist.filter((x) => x.id !== c.id) })}>{LI.close('h-4 w-4')}</button>
            </div>
          ))}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newItem.trim()) { patch({ checklist: [...t.checklist, { id: uid(), title: newItem.trim(), done: false }] }); setNewItem('') } }}>
            <input aria-label="خطوة جديدة" placeholder="خطوة جديدة" className="flex-1" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
            <Button variant="soft" className="px-3 py-2" type="submit">+</Button>
          </form>
        </div>
      </Section>

      <Section title="الاعتماديات" action={<button type="button" className="text-sm font-semibold text-accent" onClick={() => setDepOpen(true)}>+ تعتمد على</button>}>
        <div className="glass space-y-2 p-4 text-sm">
          {deps.length === 0 && dependents.length === 0 && <p className="text-muted">مفيش. المهام اللي بتعتمد على غيرها مش بتتجدول قبل ما اللي قبلها يخلص.</p>}
          {deps.map((d) => (
            <div key={d.id} className="flex items-center gap-2">
              <span className={isOpen(d) ? 'text-warn' : 'text-accent'}>{isOpen(d) ? LI.lock('h-4 w-4') : LI.check('h-4 w-4')}</span>
              <button type="button" className="flex-1 truncate text-right" onClick={() => nav(`/tasks/${d.id}`)}>{d.title}</button>
              <button type="button" aria-label="شيل الاعتماد" className="text-muted" onClick={() => patch({ dependsOn: t.dependsOn.filter((x) => x !== d.id) })}>{LI.close('h-4 w-4')}</button>
            </div>
          ))}
          {dependents.length > 0 && <p className="pt-1 text-xs text-muted">بتعطّل: {dependents.map((x) => x.title).join('، ')}</p>}
        </div>
      </Section>

      <Section title="روابط ومرفقات">
        <div className="glass space-y-2 p-4 text-sm">
          {t.links.map((l) => (
            <div key={l} className="flex items-center gap-2">
              {LI.link('h-4 w-4 text-muted')}
              <a href={l} target="_blank" rel="noreferrer" className="ltr flex-1 truncate text-left text-accent">{l}</a>
              <button type="button" aria-label="حذف الرابط" className="text-muted" onClick={() => patch({ links: t.links.filter((x) => x !== l) })}>{LI.close('h-4 w-4')}</button>
            </div>
          ))}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = newLink.trim(); if (v) { patch({ links: [...t.links, v] }); setNewLink('') } }}>
            <input aria-label="رابط" placeholder="https://… أو shortcuts://…" className="ltr flex-1" value={newLink} onChange={(e) => setNewLink(e.target.value)} />
            <Button variant="soft" className="px-3 py-2" type="submit">+</Button>
          </form>
          {attachments?.map((a) => <AttachmentRow key={a.id} att={a} />)}
          <Button variant="ghost" className="w-full py-2 text-sm" onClick={() => fileRef.current?.click()}>{LI.clip('h-4 w-4 inline')} إرفاق صورة أو ملف</Button>
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void safe(() => addAttachment(f, { taskId: t.id }), 'اترفق'); e.target.value = '' }} />
        </div>
      </Section>

      <Section title="سجل الوقت" action={<button type="button" className="text-sm font-semibold text-accent" onClick={() => setLogOpen(true)}>+ وقت يدوي</button>}>
        {logs.length === 0 ? <p className="px-1 text-sm text-muted">لسه مفيش جلسات.</p> : (
          <ul className="glass divide-y divide-white/70 text-sm">
            {logs.slice(0, 20).map((l) => (
              <li key={l.id} className="flex items-center gap-2 px-4 py-2">
                <span className="flex-1">{fmtWhen(l.start, today)}</span>
                <span className="text-muted num">{l.end ? fmtMinutes((l.end - l.start) / 60_000) : 'شغالة'}</span>
                {l.interruptions > 0 && <Chip tone="warn">{l.interruptions} مقاطعة</Chip>}
                {l.end && <button type="button" aria-label="حذف الجلسة" className="text-muted" onClick={() => void safe(() => deleteLog(l.id))}>{LI.close('h-4 w-4')}</button>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="تعليقات وسجل التغييرات">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void safe(async () => { await addComment(t.id, comment); setComment('') }) }}>
          <input aria-label="تعليق" placeholder="اكتب تعليق أو ملاحظة…" className="flex-1" value={comment} onChange={(e) => setComment(e.target.value)} />
          <Button variant="soft" className="px-3 py-2" type="submit">إرسال</Button>
        </form>
        <ul className="space-y-1.5" data-testid="history">
          {events?.map((e) => <li key={e.id} className="glass px-3.5 py-2 text-sm"><EventLine e={e} /></li>)}
        </ul>
      </Section>

      {!t.deletedAt && (
        <div className="grid grid-cols-3 gap-2">
          <Button variant="soft" className="text-sm" onClick={() => void safe(async () => { const c = await duplicateTask(t.id); if (c) nav(`/tasks/${c.id}`) }, 'اتعملت نسخة')}>نسخة</Button>
          <Button variant="soft" className="text-sm" onClick={() => void safe(() => saveTemplate({ id: uid(), kind: 'task', name: t.title, createdAt: Date.now(), payload: { title: t.title, description: t.description, estimateMin: t.estimateMin, importance: t.importance, energy: t.energy, category: t.category, checklist: t.checklist.map((c) => c.title) } }), 'اتحفظت كقالب')}>قالب</Button>
          <Button variant="danger" className="text-sm" onClick={() => void safe(async () => { await deleteTasks([t.id]); toast('اتنقلت لسلة المحذوفات'); nav(-1) })}>حذف</Button>
        </div>
      )}

      {depOpen && (
        <Sheet open onClose={() => setDepOpen(false)} title="تعتمد على أي مهمة؟">
          <ul className="space-y-1.5">
            {data.tasks.filter((x) => !x.deletedAt && !x.recurrence && x.id !== t.id && !t.dependsOn.includes(x.id) && isOpen(x)).map((x) => {
              const cyc = wouldCreateCycle(data.tasks, t.id, x.id)
              return (
                <li key={x.id}>
                  <button type="button" disabled={cyc} className="glass w-full px-3.5 py-2.5 text-right text-sm disabled:opacity-40"
                    onClick={() => { patch({ dependsOn: [...t.dependsOn, x.id] }); setDepOpen(false) }}>
                    {x.title}{cyc && ' (هتعمل حلقة)'}
                  </button>
                </li>
              )
            })}
          </ul>
        </Sheet>
      )}
      {logOpen && <ManualLogSheet task={t} onClose={() => setLogOpen(false)} onSave={(start, min, kind) => void safe(async () => { await addManualLog(t.id, start, min, kind); setLogOpen(false) }, 'اتسجل')} />}
    </div>
  )
}

function PinEditor({ onPin }: { onPin: (day: string, startMin: number) => void }) {
  const { today } = useLife()
  const [day, setDay] = useState(today)
  const [time, setTime] = useState('10:00')
  return (
    <div className="flex items-end gap-2">
      <Field label="ثبّت في يوم"><input type="date" className="w-full" value={day} min={today} onChange={(e) => setDay(e.target.value)} /></Field>
      <Field label="الساعة"><input type="time" className="ltr w-full" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
      <Button variant="soft" className="py-2" onClick={() => time && onPin(day, fromTimeInput(time))}>ثبّت</Button>
    </div>
  )
}

function RecurrenceEditor({ task, onChange }: { task: Task; onChange: (r: Recurrence | undefined) => void }) {
  if (task.seriesId) return <p className="px-1 text-xs text-muted">نسخة من مهمة متكررة ({task.occurrence}). تعديل التكرار من المهمة الأصلية.</p>
  const r = task.recurrence
  return (
    <Section title="التكرار">
      <div className="glass space-y-2 p-4">
        <select aria-label="نوع التكرار" className="w-full" value={r?.type ?? ''} onChange={(e) => {
          const v = e.target.value
          onChange(v === 'daily' ? { type: 'daily', every: 1 } : v === 'weekly' ? { type: 'weekly', weekdays: [new Date().getDay()] } : v === 'monthly' ? { type: 'monthly', day: new Date().getDate() } : undefined)
        }}>
          <option value="">مش متكررة</option>
          <option value="daily">يومي</option>
          <option value="weekly">أسبوعي</option>
          <option value="monthly">شهري</option>
        </select>
        {r?.type === 'daily' && (
          <label className="flex items-center gap-2 text-sm">كل <input type="number" min={1} className="ltr w-16" value={r.every} onChange={(e) => onChange({ type: 'daily', every: Math.max(1, Number(e.target.value)) })} /> يوم</label>
        )}
        {r?.type === 'weekly' && (
          <div className="flex justify-between gap-1">
            {[6, 0, 1, 2, 3, 4, 5].map((d) => (
              <button key={d} type="button" aria-label={WEEKDAY_NAMES[d]} aria-pressed={r.weekdays.includes(d)}
                onClick={() => { const w = r.weekdays.includes(d) ? r.weekdays.filter((x) => x !== d) : [...r.weekdays, d]; if (w.length) onChange({ type: 'weekly', weekdays: w.sort() }) }}
                className={`h-9 flex-1 rounded-xl text-sm ${r.weekdays.includes(d) ? 'bg-accent text-white' : 'bg-white/70 text-muted'}`}>{WEEKDAY_SHORT[d]}</button>
            ))}
          </div>
        )}
        {r?.type === 'monthly' && (
          <label className="flex items-center gap-2 text-sm">يوم <input type="number" min={1} max={31} className="ltr w-16" value={r.day} onChange={(e) => onChange({ type: 'monthly', day: Math.min(31, Math.max(1, Number(e.target.value))) })} /> من كل شهر</label>
        )}
        {r && <p className="text-xs text-muted">{describeRecurrence(r)}. المهمة دي بقت قالب: التطبيق بيولّد منها نسخة لكل مرة في الأيام الجاية، وكل نسخة ليها حالتها ووقتها.</p>}
      </div>
    </Section>
  )
}

function AttachmentRow({ att }: { att: Attachment }) {
  const safe = useSafe()
  const url = useObjectUrl(att.blob)
  const img = att.mime.startsWith('image/')
  return (
    <div className="flex items-center gap-2">
      {img && url ? <img src={url} alt="" className="h-10 w-10 rounded-lg object-cover" /> : LI.clip('h-4 w-4 text-muted')}
      <a href={url} download={att.name} target="_blank" rel="noreferrer" className="flex-1 truncate text-accent">{att.name}</a>
      <span className="text-xs text-muted num">{Math.max(1, Math.round(att.size / 1024))}KB</span>
      <button type="button" aria-label={`حذف ${att.name}`} className="text-muted" onClick={() => void safe(() => deleteAttachment(att.id))}>{LI.close('h-4 w-4')}</button>
    </div>
  )
}

function ManualLogSheet({ task, onClose, onSave }: { task: Task; onClose: () => void; onSave: (start: number, min: number, kind: TimeKind) => void }) {
  const { today } = useLife()
  const [day, setDay] = useState(today)
  const [time, setTime] = useState('09:00')
  const [min, setMin] = useState(task.estimateMin ?? 30)
  const [kind, setKind] = useState<TimeKind>(task.energy === 'deep' ? 'deep' : task.energy === 'study' ? 'study' : 'routine')
  return (
    <Sheet open onClose={onClose} title="تسجيل وقت يدوي" footer={<Button className="w-full" onClick={() => onSave(at(day, fromTimeInput(time)), min, kind)}>حفظ</Button>}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="اليوم"><input type="date" className="w-full" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
        <Field label="البداية"><input type="time" className="ltr w-full" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        <Field label="المدة (دقيقة)"><input type="number" className="ltr w-full" value={min} onChange={(e) => setMin(Math.max(1, Number(e.target.value)))} /></Field>
        <Field label="النوع">
          <select className="w-full" value={kind} onChange={(e) => setKind(e.target.value as TimeKind)}>
            <option value="deep">تركيز عميق</option><option value="routine">روتيني</option><option value="study">دراسة</option><option value="other">أخرى</option>
          </select>
        </Field>
      </div>
    </Sheet>
  )
}

const FIELD_LABEL: Record<string, string> = {
  title: 'العنوان', status: 'الحالة', importance: 'الأهمية', priorityOverride: 'الأولوية اليدوية', dueAt: 'الموعد', startDate: 'تاريخ البدء', estimateMin: 'المدة',
  progress: 'الإنجاز', projectId: 'المشروع', milestoneId: 'المرحلة', goalId: 'الهدف', pinned: 'التثبيت', dependsOn: 'الاعتماديات', category: 'التصنيف', confidence: 'دقة التقدير', energy: 'نوع المجهود',
}

function fmtVal(field: string | undefined, v: unknown): string {
  if (v === undefined || v === null) return '—'
  if (field === 'status') return STATUS_LABEL[v as TaskStatus] ?? String(v)
  if (field === 'dueAt' && typeof v === 'number') return new Date(v).toLocaleString('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  if (field === 'pinned' && typeof v === 'object') { const p = v as { day: string; startMin: number }; return `${p.day} ${hhmm(p.startMin)}` }
  if (Array.isArray(v)) return `${v.length}`
  return String(v)
}

function EventLine({ e }: { e: TaskEvent }) {
  const when = new Date(e.at).toLocaleString('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  let text: string
  switch (e.type) {
    case 'created': text = `اتعملت${e.text ? ` (${e.text})` : ''}`; break
    case 'comment': text = `💬 ${e.text}`; break
    case 'deleted': text = 'اتحذفت'; break
    case 'restored': text = 'اترجعت'; break
    case 'imported': text = e.text ?? 'اتعدلت من خطة مستوردة'; break
    case 'postponed': text = `اتأجلت: ${FIELD_LABEL[e.field ?? ''] ?? e.field} ${fmtVal(e.field, e.from)} ← ${fmtVal(e.field, e.to)}`; break
    default: text = `${FIELD_LABEL[e.field ?? ''] ?? e.field}: ${fmtVal(e.field, e.from)} ← ${fmtVal(e.field, e.to)}`
  }
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="flex-1">{text}{e.reason && <span className="text-muted"> — {e.reason}</span>}</span>
      <span className="shrink-0 text-[11px] text-muted">{when}</span>
    </div>
  )
}
