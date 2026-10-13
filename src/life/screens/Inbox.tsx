import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { finishTask, handleReminder, updateTask } from '../db/repo'
import { isOpen } from '../domain/priority'
import { addDays } from '../domain/time'
import type { ReminderLogEntry } from '../domain/types'
import { useLife } from '../state'
import { Button } from '../../ui/primitives'
import { useSafe, useToast } from '../../ui/Toast'
import { fmtWhen } from '../ui/format'
import { Chip, Empty, Header, Section, Tabs } from '../ui/kit'
import { POSTPONE_REASONS, usePlanActions } from '../ui/planActions'

type View = 'open' | 'log'

const STATUS: Record<ReminderLogEntry['status'], string> = {
  pending: 'مجدول', shown_system: 'إشعار نظام', shown_inapp: 'داخل التطبيق', missed: 'فات والتطبيق مقفول', snoozed: 'مؤجل', handled: 'اتعالج',
}

export function InboxScreen() {
  const { data, today } = useLife()
  const [view, setView] = useState<View>('open')
  const open = data.reminders.filter((r) => r.status === 'missed').sort((a, b) => b.dueAt - a.dueAt)
  const log = [...data.reminders].sort((a, b) => b.dueAt - a.dueAt).slice(0, 80)
  return (
    <div className="space-y-3">
      <Header back title="التنبيهات والمتابعة" />
      <Tabs<View> value={view} onChange={setView} tabs={[{ value: 'open', label: `محتاجة رد (${open.length})` }, { value: 'log', label: 'السجل' }]} />
      {view === 'open' && (open.length === 0 ? <Empty>مفيش حاجة مستنية رد.</Empty> : open.map((r) => <FollowUp key={r.id} r={r} />))}
      {view === 'log' && (
        <Section title="سجل التذكيرات">
          {log.length === 0 ? <Empty>لسه مفيش تذكيرات اتبعتت.</Empty> : (
            <ul className="glass divide-y divide-white/70 text-sm">
              {log.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-4 py-2">
                  <span className="min-w-0 flex-1 truncate">{r.title}</span>
                  <span className="shrink-0 text-[11px] text-muted">{fmtWhen(r.dueAt, today)}</span>
                  <Chip tone={r.status === 'missed' ? 'warn' : r.status === 'shown_system' ? 'accent' : 'muted'}>{STATUS[r.status]}</Chip>
                </li>
              ))}
            </ul>
          )}
          <p className="px-1 text-[11px] leading-relaxed text-muted">«إشعار نظام» = اتعرض عن طريق iOS والتطبيق في الخلفية. «داخل التطبيق» = التطبيق كان مفتوح. «فات» = وقته جه والتطبيق مقفول؛ iOS مش بيسمح لتطبيقات الويب تشتغل في الخلفية، فاستخدم تصدير التقويم للتنبيهات المضمونة.</p>
        </Section>
      )}
    </div>
  )
}

function FollowUp({ r }: { r: ReminderLogEntry }) {
  const life = useLife()
  const safe = useSafe()
  const toast = useToast()
  const nav = useNavigate()
  const actions = usePlanActions()
  const t = r.taskId ? life.taskById.get(r.taskId) : undefined
  const done = () => handleReminder(r.id)
  return (
    <div className="glass space-y-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{r.title}</span>
        <span className="shrink-0 text-[11px] text-muted">{fmtWhen(r.dueAt, life.today)}</span>
      </div>
      <p className="text-sm text-muted">{r.body}</p>
      {t && isOpen(t) ? (
        <div className="grid grid-cols-2 gap-2">
          <Button className="py-2 text-sm" onClick={() => void safe(async () => { await finishTask(t.id); await done(); toast('برافو ✅') })}>اكتملت</Button>
          <Button variant="soft" className="py-2 text-sm" onClick={() => void safe(async () => { await updateTask(t.id, { progress: Math.max(50, t.progress), status: 'paused' }); await done() }, 'اتسجلت جزئيًا')}>جزئيًا</Button>
          <Button variant="soft" className="py-2 text-sm" onClick={() => void safe(async () => { await actions.postpone(t, addDays(life.today, 1), POSTPONE_REASONS[0]!); await done() }, 'اتأجلت لبكرة')}>أجّل لبكرة</Button>
          <Button variant="ghost" className="py-2 text-sm" onClick={() => nav(`/tasks/${t.id}`)}>فتح</Button>
        </div>
      ) : (
        <Button variant="soft" className="w-full py-2 text-sm" onClick={() => void safe(done)}>تمام</Button>
      )}
    </div>
  )
}
