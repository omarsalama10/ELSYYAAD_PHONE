import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db } from '../db/db'
import { discardSession, exerciseHistory, finishSession, firstCompletedSession, sessionSets, type SessionSets } from '../db/repo'
import { effectiveSets, isReturnPhase, trainingWeek } from '../domain/progression'
import type { Block, Section, SetLog } from '../domain/types'
import { fmtDuration } from '../lib/format'
import { useExercises, useNow, useWakeLock } from '../lib/hooks'
import { SECTION_AR } from '../lib/workout'
import { Bare } from '../ui/Layout'
import { Icon } from '../ui/icons'
import { Banner, Button } from '../ui/primitives'
import { useRest } from '../ui/RestTimer'
import { useSafe, useToast } from '../ui/Toast'
import { ExerciseCard } from './session/ExerciseCard'

type Group = { key: string; blocks: Block[] }

/** Consecutive blocks sharing a superset key become one group. */
function groupBlocks(blocks: Block[]): Group[] {
  const out: Group[] = []
  for (const b of blocks) {
    const prev = out.at(-1)
    if (b.group && prev && prev.blocks[0]?.group === b.group) prev.blocks.push(b)
    else out.push({ key: b.id, blocks: [b] })
  }
  return out
}

export function SessionScreen() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const safe = useSafe()
  const toast = useToast()
  const rest = useRest()
  const now = useNow()
  useWakeLock()

  const exercises = useExercises()
  const session = useLiveQuery(() => db.sessions.get(id), [id])
  const program = useLiveQuery(() => (session ? db.programs.get(session.programId) : undefined), [session?.programId])
  const sets = useLiveQuery(() => sessionSets(id), [id])
  const first = useLiveQuery(() => firstCompletedSession(), [])
  const day = program?.days.find((d) => d.id === session?.dayId)

  const [history, setHistory] = useState<Map<string, SessionSets[]>>()
  useEffect(() => {
    if (!day) return
    let cancelled = false
    const ids = [...new Set(day.blocks.map((b) => b.exerciseId))]
    void Promise.all(ids.map(async (eid) => [eid, await exerciseHistory(eid, 3)] as const)).then((rows) => {
      if (!cancelled) setHistory(new Map(rows))
    })
    return () => { cancelled = true }
  }, [day])

  const week = first && session ? trainingWeek(first.startedAt, session.startedAt) : 1
  const setsByBlock = useMemo(() => {
    const m = new Map<string, SetLog[]>()
    for (const s of sets ?? []) m.set(s.blockId, [...(m.get(s.blockId) ?? []), s])
    return m
  }, [sets])

  const [open, setOpen] = useState<Set<string>>()
  useEffect(() => {
    if (open || !day || !sets || !exercises) return
    const firstIncomplete = day.blocks.find((b) => {
      const e = exercises.get(b.exerciseId)
      const need = effectiveSets(b, week) * (e?.unilateral ? 2 : 1)
      return (setsByBlock.get(b.id)?.filter((s) => s.done).length ?? 0) < need
    })
    setOpen(new Set(firstIncomplete ? [firstIncomplete.id] : []))
  }, [open, day, sets, exercises, setsByBlock, week])

  if (session === undefined || !exercises) return null
  if (!session || !day)
    return (
      <Bare>
        <div className="pt-safe space-y-4">
          <p className="text-muted">التمرين ده مش موجود.</p>
          <Button onClick={() => nav('/')}>رجوع</Button>
        </div>
      </Bare>
    )

  const finished = !!session.finishedAt
  const doneCount = sets?.filter((s) => s.done).length ?? 0
  const needed = day.blocks.reduce((a, b) => a + effectiveSets(b, week) * (exercises.get(b.exerciseId)?.unilateral ? 2 : 1), 0)
  const progress = needed ? Math.min(1, doneCount / needed) : 0
  const sections: Section[] = ['warmup', 'main', 'finisher', 'cardio']

  const toggle = (blockId: string) =>
    setOpen((o) => {
      const n = new Set(o)
      if (n.has(blockId)) n.delete(blockId)
      else n.add(blockId)
      return n
    })

  const finish = () =>
    safe(async () => {
      if (doneCount === 0) {
        if (!confirm('مفيش ولا مجموعة متسجلة. تلغي التمرين؟')) return
        await discardSession(session.id)
        nav('/')
        return
      }
      if (!confirm('تنهي التمرين؟')) return
      rest.stop()
      await finishSession(session.id)
      try { await navigator.storage?.persist?.() } catch { /* best effort */ }
      toast(`عاش! ${doneCount} مجموعة النهارده 💪`)
      nav('/')
    })

  const discard = () =>
    safe(async () => {
      if (!confirm('تمسح التمرين ده بكل اللي اتسجل فيه؟')) return
      rest.stop()
      await discardSession(session.id)
      nav('/')
    })

  return (
    <Bare>
      <header className="sticky top-0 z-30 -mx-4 border-b border-white/70 bg-white/60 px-4 pb-3 pt-safe backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Link to="/" className="glass-strong flex h-10 w-10 items-center justify-center rounded-2xl text-muted" aria-label="رجوع"><Icon.back /></Link>
          <div className="flex-1">
            <div className="text-lg font-bold">{day.name}</div>
            <div className="text-xs text-muted">
              <span className="ltr tabular-nums">{fmtDuration((session.finishedAt ?? now) - session.startedAt)}</span> • {doneCount} مجموعة
            </div>
          </div>
          {!finished && <Button className="px-5 py-2" onClick={finish}>إنهاء</Button>}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-accent/10" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="تقدم التمرين">
          <div className="h-full rounded-full bg-gradient-to-l from-accent to-[#5cc9ad] transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
        </div>
      </header>

      <div className="space-y-5 pt-4">
        {isReturnPhase(week) && <Banner>مرحلة الرجوع: مجموعتين ومجهود متوسط (تقدر تعمل 3-4 عدات زيادة).</Banner>}
        {sections.map((sec) => {
          const blocks = day.blocks.filter((b) => b.section === sec)
          if (blocks.length === 0) return null
          return (
            <section key={sec} className="space-y-2">
              <h2 className="text-sm font-bold text-muted">{SECTION_AR[sec]}</h2>
              {groupBlocks(blocks).map((g) => {
                const cards = g.blocks.map((b) => {
                  const e = exercises.get(b.exerciseId)
                  if (!e) return null
                  return (
                    <ExerciseCard
                      key={b.id}
                      sessionId={session.id}
                      block={b}
                      exercise={e}
                      week={week}
                      sets={setsByBlock.get(b.id) ?? []}
                      history={history?.get(b.exerciseId) ?? []}
                      open={open?.has(b.id) ?? false}
                      onToggle={() => toggle(b.id)}
                      restAfter={g.blocks.length === 1 || b === g.blocks.at(-1)}
                    />
                  )
                })
                return g.blocks.length > 1 ? (
                  <div key={g.key} className="space-y-2 rounded-2xl border border-accent2/40 p-2">
                    <div className="px-1 text-xs text-accent2">سوبر سيت — العب التمرينين ورا بعض وبعدين ارتاح</div>
                    {cards}
                  </div>
                ) : cards
              })}
            </section>
          )
        })}
        {!finished && (
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" onClick={finish}>إنهاء التمرين</Button>
            <Button variant="danger" onClick={discard}>مسح</Button>
          </div>
        )}
      </div>
    </Bare>
  )
}
