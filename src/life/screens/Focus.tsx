import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { addInterruption, finishTask, pauseTimer, startTimer, stopTimer, uid } from '../db/repo'
import { isOpen } from '../domain/priority'
import { fmtMinutes } from '../domain/time'
import type { TimeKind } from '../domain/types'
import { useLife } from '../state'
import { useNow, useWakeLock } from '../../lib/hooks'
import { beep, unlockAudio } from '../../lib/sound'
import { Button } from '../../ui/primitives'
import { useSafe, useToast } from '../../ui/Toast'
import { ProgressRing } from '../../ui/viz'
import { Field, Header } from '../ui/kit'

/**
 * Pomodoro-style focus sessions bound to a task. Work segments are real time logs
 * (pause = segment ends), so actual time and estimation accuracy stay measured.
 * The phase timer itself is in-memory: closing the app keeps the log running and the
 * elapsed time is recomputed from its start when you come back.
 */

type Phase = 'idle' | 'work' | 'break'
const KEY = 'life.focus'

interface Saved { phase: Phase; phaseStart: number; focusId: string; taskId?: string; kind: TimeKind; workMin: number; breakMin: number; rounds: number }
const load = (): Saved | null => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null } catch { return null } }
const save = (s: Saved | null) => { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY) } catch { /* private mode */ } }

export function FocusScreen() {
  const life = useLife()
  const { data } = life
  const [params] = useSearchParams()
  const safe = useSafe()
  const toast = useToast()
  const now = useNow(1000)
  const [st, setSt] = useState<Saved | null>(load)
  const [taskId, setTaskId] = useState(params.get('task') ?? st?.taskId ?? life.runningTaskId ?? '')
  const [kind, setKind] = useState<TimeKind>('deep')
  const [workMin, setWorkMin] = useState(data.settings.focusWorkMin)
  const [breakMin, setBreakMin] = useState(data.settings.focusBreakMin)
  const alerted = useRef<string>('')
  useWakeLock()

  const tasks = data.tasks.filter((t) => isOpen(t) && !t.recurrence)
  const task = taskId ? life.taskById.get(taskId) : undefined
  const update = (s: Saved | null) => { setSt(s); save(s) }
  const phaseLen = st ? (st.phase === 'work' ? st.workMin : st.breakMin) * 60_000 : 0
  const elapsed = st && st.phase !== 'idle' ? now - st.phaseStart : 0
  const left = Math.max(0, phaseLen - elapsed)
  const running = !!life.runningTaskId && st?.phase === 'work'
  const sessionMin = data.logs.filter((l) => st && l.focusId === st.focusId).reduce((a, l) => a + ((l.end ?? now) - l.start) / 60_000, 0)
  const interruptions = data.logs.filter((l) => st && l.focusId === st.focusId).reduce((a, l) => a + l.interruptions, 0)

  // Phase end → chime + switch (work → break stops the log; break → prompts next round).
  useEffect(() => {
    if (!st || st.phase === 'idle' || left > 0) return
    const tag = `${st.focusId}:${st.phase}:${st.phaseStart}`
    if (alerted.current === tag) return
    alerted.current = tag
    beep()
    if (st.phase === 'work') {
      void stopTimer().then(() => update({ ...st, phase: 'break', phaseStart: Date.now(), rounds: st.rounds + 1 }))
      toast('خلصت جولة تركيز — خد استراحة ☕')
    } else {
      update({ ...st, phase: 'idle', phaseStart: Date.now() })
      toast('الاستراحة خلصت — جاهز للجولة الجاية؟')
    }
  }, [left, st]) // update/toast are stable enough; re-running on them would re-alert

  const startWork = () => safe(async () => {
    unlockAudio()
    const focusId = st?.focusId ?? uid()
    await startTimer(taskId || undefined, { kind, focusId })
    update({ phase: 'work', phaseStart: Date.now(), focusId, taskId: taskId || undefined, kind, workMin, breakMin, rounds: st?.rounds ?? 0 })
  })
  const pause = () => safe(async () => { await pauseTimer(); if (st) update({ ...st, phase: 'idle' }) })
  const end = (complete: boolean) => safe(async () => {
    if (complete && taskId) await finishTask(taskId)
    else await stopTimer()
    toast(`الجلسة: ${fmtMinutes(sessionMin)}${interruptions ? `، ${interruptions} مقاطعة` : ''}`)
    update(null)
  })

  const mm = String(Math.floor(left / 60_000)).padStart(2, '0')
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')

  return (
    <div className="space-y-4">
      <Header back title="جلسة تركيز" sub={task ? task.title : 'اربط الجلسة بمهمة عشان الوقت يتحسب عليها'} />
      {!st || (st.phase === 'idle' && st.rounds === 0) ? (
        <div className="glass space-y-3 p-4">
          <Field label="المهمة">
            <select className="w-full" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">بدون مهمة</option>
              {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="تركيز (د)"><input type="number" className="ltr w-full" value={workMin} onChange={(e) => setWorkMin(Math.max(5, Number(e.target.value)))} /></Field>
            <Field label="استراحة (د)"><input type="number" className="ltr w-full" value={breakMin} onChange={(e) => setBreakMin(Math.max(1, Number(e.target.value)))} /></Field>
            <Field label="النوع">
              <select className="w-full" value={kind} onChange={(e) => setKind(e.target.value as TimeKind)}>
                <option value="deep">عميق</option><option value="routine">روتيني</option><option value="study">دراسة</option><option value="other">أخرى</option>
              </select>
            </Field>
          </div>
          {task && task.estimateMin && task.estimateMin > workMin * 2 && (
            <p className="text-xs text-muted">المهمة {fmtMinutes(task.estimateMin)} — تقريبًا {Math.ceil(task.estimateMin / workMin)} جولات. قسّمها لخطوات في قائمة التحقق لو كبيرة.</p>
          )}
          <Button className="w-full" onClick={() => void startWork()}>▶ ابدأ</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-center py-2">
            <ProgressRing value={phaseLen ? 1 - left / phaseLen : 0} size={220} stroke={14} color={st.phase === 'break' ? '#e2654f' : '#1f8f76'} label="الوقت المتبقي">
              <span className="text-5xl font-bold num ltr">{st.phase === 'idle' ? '--:--' : `${mm}:${ss}`}</span>
              <span className="text-sm text-muted">{st.phase === 'work' ? 'تركيز' : st.phase === 'break' ? 'استراحة' : 'متوقفة'} • جولة {st.rounds + (st.phase === 'work' ? 1 : 0)}</span>
            </ProgressRing>
          </div>
          <p className="text-center text-sm text-muted num">الجلسة: {fmtMinutes(sessionMin)} شغل فعلي • {interruptions} مقاطعة</p>
          <div className="grid grid-cols-2 gap-2">
            {running
              ? <Button variant="soft" onClick={() => void pause()}>⏸ إيقاف مؤقت</Button>
              : <Button onClick={() => void startWork()}>{st.phase === 'break' ? 'اقطع الاستراحة وكمّل' : '▶ كمّل'}</Button>}
            <Button variant="soft" disabled={!running} onClick={() => void safe(() => addInterruption(), 'اتسجلت مقاطعة')}>+ مقاطعة</Button>
            <Button variant="soft" onClick={() => void end(false)}>إنهاء الجلسة</Button>
            {taskId && <Button variant="soft" onClick={() => void end(true)}>✓ المهمة خلصت</Button>}
          </div>
        </div>
      )}
      <p className="px-1 text-[11px] leading-relaxed text-muted">التطبيق بيقيس الوقت جوه الجلسات اللي بتشغلها بس، مش أي نشاط برا التطبيق. لو قفلت التطبيق المؤقت بيفضل محسوب من وقت البداية.</p>
    </div>
  )
}
