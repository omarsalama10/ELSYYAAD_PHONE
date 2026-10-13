import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { finishTask, getKV, KV, markHabit, pauseTimer, saveDayLog, startTimer, updateTask } from '../db/repo'
import { LOW_OUTPUT_LABEL } from '../domain/analytics'
import { habitStats, isScheduled } from '../domain/habits'
import { isOpen, remainingMinutes } from '../domain/priority'
import { currentAndNext, diffPlans } from '../domain/scheduler'
import { at, fmtMinutes, minuteOfDay, startOfWeek, addDays } from '../domain/time'
import type { LowOutputReason, PlanBlock, Task } from '../domain/types'
import { useLife } from '../state'
import { useNow } from '../../lib/hooks'
import { useSafe, useToast } from '../../ui/Toast'
import { Button } from '../../ui/primitives'
import { ProgressRing } from '../../ui/viz'
import { fmtDayLong, fmtTime, fmtTimeRange, fmtWhen, greeting } from '../ui/format'
import { LI } from '../ui/icons'
import { Bar, Chip, IconBtn, Section, Stat } from '../ui/kit'
import { BlockSheet, PlanReviewSheet, usePlanActions } from '../ui/planActions'
import { SearchSheet, TaskCheck, TaskRow, useQuickAdd } from '../ui/tasks'
import { DayTimeline } from '../ui/timeline'

const FOCUS_KEY = 'life.focusMode'
const readFocus = () => { try { return localStorage.getItem(FOCUS_KEY) === '1' } catch { return false } }

export function Home() {
  const life = useLife()
  const { data, now, today, proposal, taskById } = life
  const safe = useSafe()
  const toast = useToast()
  const quick = useQuickAdd()
  const actions = usePlanActions()
  const [search, setSearch] = useState(false)
  const [review, setReview] = useState(false)
  const [block, setBlock] = useState<PlanBlock | null>(null)
  const [focus, setFocusState] = useState(readFocus)
  const setFocus = (v: boolean) => { setFocusState(v); try { localStorage.setItem(FOCUS_KEY, v ? '1' : '0') } catch { /* private mode */ } }

  const s = data.settings
  const blocks = life.blocksFor(today)
  const approved = life.isApproved(today)
  const taskBlocks = blocks.filter((b) => b.taskId)
  const { current, next } = currentAndNext(blocks, now)
  const running = life.runningTaskId ? taskById.get(life.runningTaskId) : undefined
  const missed = taskBlocks.filter((b) => life.blockState(b) === 'missed')
  const newSinceApproval = approved ? diffPlans(taskBlocks, proposal.blocks.filter((b) => b.day === today && b.taskId)).filter((c) => c.type === 'added') : []
  const cap = proposal.capacity[0]!
  const plannedMin = taskBlocks.reduce((a, b) => a + b.endMin - b.startMin, 0)
  const doneMin = taskBlocks.filter((b) => life.blockState(b) === 'done').reduce((a, b) => a + b.endMin - b.startMin, 0)
  const nowMin = minuteOfDay(now)
  const leftMin = taskBlocks.filter((b) => life.blockState(b) !== 'done').reduce((a, b) => a + Math.max(0, b.endMin - Math.max(b.startMin, nowMin)), 0)
  const freeLeft = Math.max(0, cap.freeMin - leftMin)

  const work = data.tasks.filter((t) => !t.deletedAt && !t.recurrence)
  const open = work.filter(isOpen)
  const weekStart = startOfWeek(today, s.weekStartsOn)
  const weekEnd = at(addDays(weekStart, 7), 0)
  const weekDone = work.filter((t) => t.status === 'done' && (t.completedAt ?? 0) >= at(weekStart, 0)).length
  const weekDue = open.filter((t) => t.dueAt !== undefined && t.dueAt < weekEnd).length
  const weekPct = weekDone + weekDue ? weekDone / (weekDone + weekDue) : 0
  const dayPct = plannedMin ? doneMin / plannedMin : 0

  const scored = [...open].sort((a, b) => (proposal.scores[b.id]?.score ?? 0) - (proposal.scores[a.id]?.score ?? 0))
  const starred = open.filter((t) => t.topDay === today)
  const top = [...starred, ...scored.filter((t) => t.topDay !== today && taskBlocks.some((b) => b.taskId === t.id))].slice(0, 3)
  const overdue = open.filter((t) => t.dueAt !== undefined && t.dueAt < now)
  const unscheduled = proposal.unscheduled.map((u) => ({ u, t: taskById.get(u.taskId)! })).filter((x) => x.t)
  const risks = proposal.atRisk.filter((r) => r.kind !== 'unscheduled' || !overdue.some((t) => t.id === r.taskId))
  const inbox = data.reminders.filter((r) => r.status === 'missed').length

  const toggleStar = (t: Task) => safe(async () => {
    if (t.topDay !== today && starred.length >= 3) throw new Error('أقصى حاجة 3 أولويات لليوم — شيل نجمة الأول')
    await updateTask(t.id, { topDay: t.topDay === today ? undefined : today })
  })

  const focusTask = running ?? (current?.taskId ? taskById.get(current.taskId) : undefined) ?? (next?.taskId ? taskById.get(next.taskId) : undefined)

  if (focus) return <FocusView task={focusTask} block={current} next={next} onExit={() => setFocus(false)} />

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-2 pt-safe">
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.6rem] font-bold leading-tight tracking-tight">{greeting(now)}</h1>
          <p className="text-sm text-muted">{fmtDayLong(today)}</p>
        </div>
        <IconBtn label="بحث" onClick={() => setSearch(true)}>{LI.search()}</IconBtn>
        <Link to="/inbox" aria-label="التنبيهات" className="glass-strong relative flex h-10 w-10 items-center justify-center rounded-2xl">
          {LI.bell()}
          {inbox > 0 && <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white num">{inbox}</span>}
        </Link>
        <IconBtn label="وضع التركيز" onClick={() => setFocus(true)}>{LI.focus()}</IconBtn>
      </header>

      {/* Now / next */}
      <section className="glass relative overflow-hidden p-4" aria-label="دلوقتي">
        <div className="absolute inset-0 bg-gradient-to-l from-accent/10 via-transparent to-accent2/10" />
        <div className="relative space-y-3">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">{running ? 'شغال دلوقتي' : current ? 'دلوقتي' : 'التالي'}</span>
            {current && <span className="text-xs text-muted num">باقي {fmtMinutes(current.endMin - nowMin)}</span>}
          </div>
          {running || current || next ? (
            <NowCard
              task={running ?? (current?.taskId ? taskById.get(current.taskId) : undefined)}
              block={current ?? next}
              running={!!running}
            />
          ) : (
            <div className="space-y-2">
              <p className="text-lg font-semibold">مفيش حاجة مخططة دلوقتي</p>
              <Button className="w-full" onClick={() => quick.open()}>+ أضف مهمة</Button>
            </div>
          )}
          {next && (current || running) && (
            <button type="button" className="flex w-full items-center gap-2 rounded-2xl bg-white/50 px-3 py-2 text-right text-sm" onClick={() => setBlock(next)}>
              <span className="text-muted">التالي</span>
              <span className="flex-1 truncate font-medium">{next.title}</span>
              <span className="ltr text-xs text-muted num">{next.day === today ? fmtTime(next.startMin) : fmtWhen(at(next.day, next.startMin), today)}</span>
            </button>
          )}
        </div>
      </section>

      {/* Plan status */}
      {!approved && taskBlocks.length > 0 && (
        <button type="button" onClick={() => setReview(true)} className="glass flex w-full items-center gap-3 p-3.5 text-right">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-warn/15 text-warn">{LI.calendar('h-5 w-5')}</span>
          <span className="flex-1 text-sm"><b>خطة اليوم مقترحة</b><br /><span className="text-muted">راجعها واعتمدها عشان التذكيرات والمتابعة</span></span>
          <Chip tone="warn">اعتمد</Chip>
        </button>
      )}
      {approved && (missed.length > 0 || newSinceApproval.length > 0) && (
        <button type="button" onClick={() => setReview(true)} className="glass flex w-full items-center gap-3 p-3.5 text-right" data-testid="replan">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-danger/10 text-danger">{LI.repeat('h-5 w-5')}</span>
          <span className="flex-1 text-sm">
            <b>{missed.length > 0 ? `${missed.length} جلسة عدّت من غير ما تخلص` : `${newSinceApproval.length} مهام جديدة مش في الخطة المعتمدة`}</b><br />
            <span className="text-muted">اعرض أفضل إعادة توزيع (محليًا، من غير نت)</span>
          </span>
          <Chip tone="danger">أعد الجدولة</Chip>
        </button>
      )}

      {/* Time & progress */}
      <section className="grid grid-cols-4 gap-2" aria-label="وقت اليوم">
        <Stat label="مخطط" value={fmtMinutes(plannedMin)} />
        <Stat label="متبقي" value={fmtMinutes(leftMin)} />
        <Stat label="فاضي" value={fmtMinutes(freeLeft)} tone={freeLeft < 30 ? 'warn' : undefined} />
        <Stat label="التزامات" value={fmtMinutes(cap.commitmentMin)} />
      </section>
      <section className="glass flex items-center gap-4 p-4" aria-label="التقدم">
        <ProgressRing value={dayPct} size={92} stroke={9} label={`إنجاز اليوم ${Math.round(dayPct * 100)}%`}>
          <span className="text-xl font-bold num">{Math.round(dayPct * 100)}%</span>
          <span className="text-[10px] text-muted">اليوم</span>
        </ProgressRing>
        <div className="flex-1 space-y-2.5 text-sm">
          <div>
            <div className="flex justify-between"><span className="text-muted">الأسبوع</span><span className="font-semibold num">{weekDone}/{weekDone + weekDue}</span></div>
            <Bar value={weekPct} label="تقدم الأسبوع" />
          </div>
          <div className="flex justify-between text-xs text-muted">
            <span>هامش طوارئ {fmtMinutes(cap.freeMin - cap.budgetMin)}</span>
            <span>{fmtMinutes(doneMin)} اتعمل</span>
          </div>
        </div>
      </section>

      {/* Top 3 */}
      <Section title="أهم 3 أولويات" action={<span className="text-xs text-muted">النجمة تثبّت الأولوية يدويًا</span>}>
        {top.length === 0 ? <p className="px-1 text-sm text-muted">مفيش مهام مخططة النهارده.</p> : (
          <ul className="space-y-2">
            {top.map((t, i) => (
              <li key={t.id} className="glass flex items-center gap-3 px-3.5 py-3">
                <span className="w-4 text-center text-sm font-bold text-muted num">{i + 1}</span>
                <TaskCheck task={t} size="sm" />
                <Link to={`/tasks/${t.id}`} className="min-w-0 flex-1 truncate font-medium">{t.title}</Link>
                <button type="button" aria-label={t.topDay === today ? 'شيل من أولويات اليوم' : 'ثبّت في أولويات اليوم'} className={t.topDay === today ? 'text-warn' : 'text-muted'} onClick={() => void toggleStar(t)}>
                  {LI.star('h-5 w-5', t.topDay === today)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Timeline */}
      <Section title="جدول اليوم" action={<Link to="/plan" className="text-sm font-semibold text-accent">الأسبوع ←</Link>}>
        {blocks.length === 0 ? (
          <p className="glass p-4 text-sm text-muted">اليوم فاضي. أضف مهام أو التزامات ثابتة (شغل، محاضرات) من شاشة الخطة.</p>
        ) : (
          <DayTimeline day={today} blocks={blocks} stateOf={life.blockState} startMin={Math.min(s.dayStartMin, nowMin)} endMin={s.dayEndMin} now={now} isToday
            onTap={setBlock} onMove={(b, m) => void safe(async () => { await actions.moveBlock(b, m); toast(`اتنقلت لـ ${fmtTime(m)}`) })} />
        )}
        <p className="px-1 text-[11px] text-muted">اسحب من علامة ✥ لنقل المهمة؛ النقل بيثبّتها في الوقت الجديد. الالتزامات 🔒 مش بتتحرك.</p>
      </Section>

      {(overdue.length > 0 || risks.length > 0) && (
        <Section title={<span className="text-danger">متأخر ومعرض للخطر</span>}>
          <div className="space-y-2">
            {overdue.map((t) => <TaskRow key={t.id} task={t} />)}
            {risks.filter((r) => !overdue.some((t) => t.id === r.taskId)).map((r) => {
              const t = taskById.get(r.taskId)
              if (!t) return null
              return (
                <Link key={r.taskId} to={`/tasks/${t.id}`} className="glass flex items-center gap-2 px-3.5 py-3 text-sm">
                  <span className={r.kind === 'tight' ? 'text-warn' : 'text-danger'}>{LI.warn('h-4 w-4')}</span>
                  <span className="flex-1 truncate font-medium">{t.title}</span>
                  <span className="text-xs text-muted">{r.kind === 'late' ? `هتتأخر ${fmtMinutes(r.lateMin ?? 0)}` : r.kind === 'tight' ? 'هامش ضيق' : 'مالهاش وقت'}</span>
                </Link>
              )
            })}
          </div>
        </Section>
      )}

      {unscheduled.length > 0 && (
        <Section title="مش مجدولة" action={<span className="text-xs text-muted">{unscheduled.length}</span>}>
          <div className="space-y-2">
            {unscheduled.slice(0, 5).map(({ u, t }) => (
              <div key={u.taskId} className="space-y-1">
                <TaskRow task={t} />
                <p className="px-2 text-[11px] text-muted">
                  {u.reason === 'no_capacity' ? `مفيش وقت كفاية في ${s.planHorizonDays} يوم (اتحط ${fmtMinutes(u.placedMin)} من ${fmtMinutes(u.remainingMin)})`
                    : u.reason === 'dependency_unscheduled' ? 'مستنية مهمة لسه مش مجدولة' : 'تاريخ بدايتها بعد أفق التخطيط'}
                </p>
              </div>
            ))}
            {unscheduled.length > 5 && <Link to="/tasks?view=unscheduled" className="block px-1 text-sm font-semibold text-accent">عرض الكل ({unscheduled.length})</Link>}
          </div>
        </Section>
      )}

      <BackupNudge />
      <HabitsToday />
      <DayReview />

      <SearchSheet open={search} onClose={() => setSearch(false)} />
      <PlanReviewSheet open={review} onClose={() => setReview(false)} days={proposal.days.slice(0, 7)} />
      <BlockSheet block={block} onClose={() => setBlock(null)} />
    </div>
  )
}

function NowCard({ task, block, running }: { task?: Task; block?: PlanBlock; running: boolean }) {
  const safe = useSafe()
  const toast = useToast()
  const life = useLife()
  const tick = useNow(1000)
  const log = life.data.logs.find((l) => l.end === undefined)
  const title = task?.title ?? block?.title ?? ''
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-[1.45rem] font-bold leading-tight">{title}</h2>
        {block && <p className="ltr text-right text-sm text-muted num">{fmtTimeRange(block.startMin, block.endMin)}{block.parts && block.parts > 1 ? ` · جلسة ${block.part}/${block.parts}` : ''}</p>}
        {running && log && <p className="text-sm font-semibold text-accent2 num">⏱ {fmtMinutes((tick - log.start) / 60_000)} في الجلسة دي</p>}
      </div>
      {task && (
        <div className="flex gap-2">
          {running ? (
            <Button variant="soft" className="flex-1" onClick={() => void safe(() => pauseTimer())}>⏸ إيقاف مؤقت</Button>
          ) : (
            <Button className="flex flex-1 items-center justify-center gap-2" onClick={() => void safe(() => startTimer(task.id))}>{LI.play()} ابدأ</Button>
          )}
          <Button variant="soft" className="flex-1" onClick={() => void safe(async () => { await finishTask(task.id); toast('برافو ✅') })}>✓ خلصت</Button>
        </div>
      )}
      {task && task.checklist.length > 0 && (
        <p className="text-xs text-muted">قائمة التحقق: {task.checklist.filter((c) => c.done).length}/{task.checklist.length} • متبقي {fmtMinutes(remainingMinutes(task, life.data.settings))}</p>
      )}
    </div>
  )
}

function FocusView({ task, block, next, onExit }: { task?: Task; block?: PlanBlock; next?: PlanBlock; onExit: () => void }) {
  const life = useLife()
  const running = !!task && life.runningTaskId === task.id
  return (
    <div className="flex min-h-[80vh] flex-col justify-center gap-6 pt-safe" data-testid="focus-mode">
      <p className="text-center text-sm text-muted">وضع التركيز — باقي المهام مخفية</p>
      <div className="glass space-y-4 p-6 text-center">
        {task ? <NowCard task={task} block={block} running={running} /> : <p className="text-lg">مفيش مهمة دلوقتي</p>}
      </div>
      {next && <p className="text-center text-sm text-muted">بعدها: {next.title} ({fmtTime(next.startMin)})</p>}
      <Button variant="ghost" onClick={onExit}>اخرج من وضع التركيز</Button>
    </div>
  )
}

function HabitsToday() {
  const { data, today } = useLife()
  const safe = useSafe()
  const habits = data.habits.filter((h) => !h.archived && isScheduled(h, today)).sort((a, b) => a.order - b.order)
  if (!habits.length) return null
  return (
    <Section title="عادات اليوم" action={<Link to="/habits" className="text-sm font-semibold text-accent">الكل ←</Link>}>
      <div className="flex flex-wrap gap-2">
        {habits.map((h) => {
          const st = habitStats(h, data.habitLogs, today, data.settings.weekStartsOn)
          const m = st.todayMark
          return (
            <button key={h.id} type="button" onClick={() => void safe(() => markHabit(h.id, today))}
              className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm ${m === 'done' ? 'border-accent bg-accent text-white' : m === 'skipped' ? 'border-white bg-white/50 text-muted line-through' : 'border-white/80 bg-white/70'}`}>
              {m === 'done' ? LI.check('h-4 w-4') : null}{h.title}
              {st.current > 1 && <span className="text-[11px] opacity-80 num">🔥{st.current}</span>}
            </button>
          )
        })}
      </div>
    </Section>
  )
}

function DayReview() {
  const { data, today, now } = useLife()
  const safe = useSafe()
  const log = data.dayLogs.find((d) => d.day === today)
  const [open, setOpen] = useState(false)
  const evening = minuteOfDay(now) >= data.settings.eveningReviewMin - 60
  if (!evening && !open && !log) {
    return <button type="button" className="w-full text-center text-sm text-muted underline" onClick={() => setOpen(true)}>سجّل طاقتك وتركيزك النهارده (اختياري)</button>
  }
  const set = (patch: Parameters<typeof saveDayLog>[1]) => void safe(() => saveDayLog(today, patch))
  return (
    <Section title="مراجعة اليوم" action={<span className="text-[11px] text-muted">تقييم ذاتي اختياري</span>}>
      <div className="glass space-y-3 p-4">
        {(['energy', 'focus'] as const).map((k) => (
          <div key={k} className="flex items-center justify-between gap-2">
            <span className="text-sm">{k === 'energy' ? 'الطاقة' : 'التركيز'}</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-label={`${k === 'energy' ? 'الطاقة' : 'التركيز'} ${n}`} onClick={() => set({ [k]: n })}
                  className={`h-8 w-8 rounded-xl text-sm num ${log?.[k] === n ? 'bg-accent text-white' : 'bg-white/70 text-muted'}`}>{n}</button>
              ))}
            </div>
          </div>
        ))}
        <div className="space-y-1">
          <span className="text-sm">لو الإنجاز قليل، السبب؟</span>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(LOW_OUTPUT_LABEL) as LowOutputReason[]).map((r) => (
              <button key={r} type="button" onClick={() => set({ lowOutputReason: log?.lowOutputReason === r ? undefined : r })}
                className={`rounded-full px-3 py-1 text-xs ${log?.lowOutputReason === r ? 'bg-ink text-white' : 'bg-white/70 text-muted'}`}>{LOW_OUTPUT_LABEL[r]}</button>
            ))}
          </div>
        </div>
        <label className="flex items-center justify-between text-sm">
          <span>يوم راحة (المخطط ميحطش مهام مرنة)</span>
          <input type="checkbox" className="h-5 w-5" checked={!!log?.restDay} onChange={(e) => set({ restDay: e.target.checked })} />
        </label>
      </div>
    </Section>
  )
}

const BACKUP_DAYS = 14

function BackupNudge() {
  const { data, now } = useLife()
  const last = useLiveQuery(() => getKV<number>(KV.lastLifeBackupAt), [])
  const hasData = data.tasks.length + data.projects.length >= 5
  if (!hasData || (last && now - last < BACKUP_DAYS * 86_400_000)) return null
  return (
    <Link to="/settings" className="block rounded-2xl bg-warn/10 p-3 text-sm text-warn">
      {last ? `آخر نسخة احتياطية من أكتر من ${BACKUP_DAYS} يوم` : 'لسه معملتش نسخة احتياطية'} — البيانات على الموبايل بس. اضغط واحفظ نسخة على iCloud.
    </Link>
  )
}
