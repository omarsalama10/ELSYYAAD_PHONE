import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { approvePlan, finishTask, pauseTimer, postponeTask, startTimer, toggleCommitmentSkip, updateTask } from '../db/repo'
import { remainingMinutes } from '../domain/priority'
import { diffPlans } from '../domain/scheduler'
import { addDays, fmtMinutes, hhmm } from '../domain/time'
import type { DayKey, PlanBlock, Task } from '../domain/types'
import { useLife } from '../state'
import { Button } from '../../ui/primitives'
import { useSafe, useToast } from '../../ui/Toast'
import { dayLabel, fmtWhen } from './format'
import { LI } from './icons'
import { Chip, Field, Sheet } from './kit'

export const POSTPONE_REASONS = ['وقت غير كافٍ', 'مهمة أكبر من المتوقع', 'تغيّر الالتزامات', 'طاقة منخفضة', 'مستني حد/حاجة', 'أولوية أعلى ظهرت']

/** Plan mutations that keep the approved plan consistent with manual changes. */
export function usePlanActions() {
  const life = useLife()
  const { data, approved, proposal } = life

  /** Rewrites approved days so a task no longer appears there (new revision, history kept). */
  const dropFromApproved = async (taskId: string, reason: string, extra?: PlanBlock) => {
    const days = [...approved.values()].filter((p) => p.blocks.some((b) => b.taskId === taskId) || (extra && p.day === extra.day)).map((p) => p.day)
    if (!days.length) return
    const blocks = days.flatMap((d) => approved.get(d)!.blocks.filter((b) => b.taskId !== taskId))
    if (extra) blocks.push(extra)
    await approvePlan(blocks, days, reason)
  }

  return {
    approve: async (days: DayKey[], reason?: string) => approvePlan(proposal.blocks, days, reason),
    moveBlock: async (b: PlanBlock, startMin: number, day: DayKey = b.day) => {
      if (!b.taskId) return
      const t = life.taskById.get(b.taskId)
      if (!t) return
      const len = Math.max(15, remainingMinutes(t, data.settings) || b.endMin - b.startMin)
      await updateTask(t.id, { pinned: { day, startMin }, startDate: undefined }, { reason: 'نقل يدوي' })
      await dropFromApproved(t.id, 'نقل يدوي', { id: `p:${t.id}:${day}`, day, startMin, endMin: Math.min(1440, startMin + len), kind: 'pinned', title: t.title, taskId: t.id, confidence: t.confidence })
    },
    unpin: async (t: Task) => {
      await updateTask(t.id, { pinned: undefined }, { reason: 'إلغاء التثبيت' })
      await dropFromApproved(t.id, 'إلغاء التثبيت')
    },
    postpone: async (t: Task, toDay: DayKey, reason: string) => {
      await postponeTask(t.id, toDay, reason)
      await dropFromApproved(t.id, `تأجيل: ${reason}`)
    },
  }
}

/** Action sheet for a tapped timeline block. */
export function BlockSheet({ block, onClose }: { block: PlanBlock | null; onClose: () => void }) {
  const life = useLife()
  const nav = useNavigate()
  const safe = useSafe()
  const toast = useToast()
  const actions = usePlanActions()
  const [postponing, setPostponing] = useState(false)
  const [toDay, setToDay] = useState(addDays(life.today, 1))
  const [reason, setReason] = useState(POSTPONE_REASONS[0]!)
  if (!block) return null
  const t = block.taskId ? life.taskById.get(block.taskId) : undefined
  const running = t && life.runningTaskId === t.id
  const close = () => { setPostponing(false); onClose() }

  if (block.kind === 'commitment') {
    const c = life.data.commitments.find((x) => x.id === block.commitmentId)
    const skipped = c?.skipDays.includes(block.day)
    return (
      <Sheet open onClose={close} title={block.title}>
        <p className="text-sm text-muted">التزام ثابت • {dayLabel(block.day, life.today)} {hhmm(block.startMin)}–{hhmm(block.endMin)}. المخطط ميحركهوش أبدًا.</p>
        <Button variant="soft" className="w-full" onClick={() => void safe(async () => {
          await toggleCommitmentSkip(block.commitmentId!, block.day)
          toast(skipped ? 'الالتزام رجع' : 'اتلغى المرة دي — راجع الخطة البديلة من زر "إعادة الجدولة"')
          close()
        })}>{skipped ? 'رجّعه' : 'إلغاء المرة دي بس (وقت فاضي للخطة)'}</Button>
        <Button variant="ghost" className="w-full" onClick={() => { close(); nav('/plan?tab=commitments') }}>تعديل الالتزام</Button>
      </Sheet>
    )
  }
  if (!t) return null

  return (
    <Sheet open onClose={close} title={t.title}>
      <div className="flex flex-wrap gap-1">
        <Chip>{dayLabel(block.day, life.today)} {hhmm(block.startMin)}–{hhmm(block.endMin)}</Chip>
        {block.parts && block.parts > 1 && <Chip>جلسة {block.part}/{block.parts}</Chip>}
        <Chip>متبقي {fmtMinutes(remainingMinutes(t, life.data.settings))}</Chip>
        {t.dueAt !== undefined && <Chip tone="warn">موعد {fmtWhen(t.dueAt, life.today)}</Chip>}
      </div>
      {!postponing ? (
        <div className="grid grid-cols-2 gap-2">
          {running
            ? <Button variant="soft" onClick={() => void safe(async () => { await pauseTimer(); close() })}>⏸ إيقاف مؤقت</Button>
            : <Button onClick={() => void safe(async () => { await startTimer(t.id); close() })}>▶ ابدأ</Button>}
          <Button variant="soft" onClick={() => void safe(async () => { await finishTask(t.id); toast('برافو ✅'); close() })}>✓ خلصت</Button>
          <Button variant="soft" onClick={() => { close(); nav(`/focus?task=${t.id}`) }}>جلسة تركيز</Button>
          <Button variant="soft" onClick={() => setPostponing(true)}>أجّل</Button>
          {t.pinned && <Button variant="ghost" onClick={() => void safe(async () => { await actions.unpin(t); close() })}>إلغاء التثبيت</Button>}
          <Button variant="ghost" onClick={() => { close(); nav(`/tasks/${t.id}`) }}>تفاصيل المهمة</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="لحد يوم"><input type="date" className="w-full" value={toDay} min={life.today} onChange={(e) => setToDay(e.target.value)} /></Field>
          <Field label="السبب (بيتسجل في التحليلات)">
            <div className="flex flex-wrap gap-1.5">
              {POSTPONE_REASONS.map((r) => (
                <button key={r} type="button" onClick={() => setReason(r)} className={`rounded-full px-3 py-1 text-sm ${reason === r ? 'bg-ink text-white' : 'bg-white/70 text-muted'}`}>{r}</button>
              ))}
            </div>
          </Field>
          <Button className="w-full" onClick={() => void safe(async () => { await actions.postpone(t, toDay, reason); toast(`اتأجلت لـ ${dayLabel(toDay, life.today)}`); close() })}>تأكيد التأجيل</Button>
        </div>
      )}
    </Sheet>
  )
}

/** Shows what a re-plan would change, and applies it only on confirmation. */
export function PlanReviewSheet({ open, onClose, days }: { open: boolean; onClose: () => void; days: DayKey[] }) {
  const life = useLife()
  const safe = useSafe()
  const toast = useToast()
  const actions = usePlanActions()
  if (!open) return null
  const before = days.flatMap((d) => (life.approved.get(d)?.blocks ?? []).filter((b) => b.kind !== 'commitment'))
  const after = life.proposal.blocks.filter((b) => days.includes(b.day) && b.kind !== 'commitment')
  const anyApproved = days.some((d) => life.approved.has(d))
  const changes = anyApproved ? diffPlans(before, after) : []
  const title = (id: string) => life.taskById.get(id)?.title ?? id
  const where = (x?: { day: DayKey; startMin: number }) => (x ? `${dayLabel(x.day, life.today)} ${hhmm(x.startMin)}` : '')
  const { atRisk, unscheduled, overload } = life.proposal
  return (
    <Sheet open onClose={onClose} title={anyApproved ? 'مراجعة إعادة الجدولة' : 'اعتماد الخطة'} footer={
      <Button className="w-full" onClick={() => void safe(async () => { await actions.approve(days, anyApproved ? 'إعادة جدولة' : undefined); toast('الخطة اتعتمدت ✅'); onClose() })}>
        {anyApproved ? `اعتمد التغييرات (${changes.length})` : `اعتمد خطة ${days.length > 1 ? `${days.length} أيام` : 'اليوم'}`}
      </Button>
    }>
      <p className="text-sm leading-relaxed text-muted">المحرك المحلي رتّب المهام المرنة حسب الأولوية والاعتماديات والوقت الفاضي بعد الالتزامات، وساب {Math.round(life.data.settings.bufferPct * 100)}% هامش طوارئ. الالتزامات الثابتة والمهام المثبّتة مش بتتحرك.</p>
      {anyApproved && (
        changes.length === 0 ? <p className="text-sm">مفيش تغييرات عن الخطة المعتمدة.</p> : (
          <ul className="space-y-1.5" data-testid="plan-changes">
            {changes.map((c) => (
              <li key={c.taskId} className="glass flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="truncate font-medium">{title(c.taskId)}</span>
                <span className="shrink-0 text-xs text-muted">
                  {c.type === 'added' && <>جديدة ← {where(c.to)}</>}
                  {c.type === 'removed' && <span className="text-warn">خرجت من الخطة</span>}
                  {c.type === 'moved' && <>{where(c.from)} ← {where(c.to)}</>}
                  {c.type === 'resized' && <>{fmtMinutes(c.from!.minutes)} ← {fmtMinutes(c.to!.minutes)}</>}
                </span>
              </li>
            ))}
          </ul>
        )
      )}
      {overload && <div className="rounded-2xl bg-danger/10 p-3 text-sm text-danger">حمل زائد: المطلوب لحد {dayLabel(overload.day, life.today)} {fmtMinutes(overload.demandMin)} والمتاح {fmtMinutes(overload.capacityMin)}. قلّل النطاق أو حرّك موعد.</div>}
      {atRisk.filter((r) => r.kind !== 'tight').map((r) => (
        <div key={r.taskId} className="flex items-center gap-2 text-sm text-danger">{LI.warn('h-4 w-4')}<span>{title(r.taskId)}: {r.kind === 'late' ? `متوقع تتأخر ${fmtMinutes(r.lateMin ?? 0)}` : 'مش لاقية وقت قبل موعدها'}</span></div>
      ))}
      {unscheduled.length > 0 && <p className="text-xs text-muted">{unscheduled.length} مهام مش داخلة في الخطة لعدم وجود وقت كافٍ أو اعتماديات مفتوحة.</p>}
    </Sheet>
  )
}
