import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { completedSessions, getActiveProgram, getActiveSession, startSession } from '../db/repo'
import { effectiveSets, isReturnPhase, trainingWeek } from '../domain/progression'
import type { Section } from '../domain/types'
import { UNIT } from '../lib/format'
import { useExercises } from '../lib/hooks'
import { dayCover, dayFocus, estimateMinutes, SECTION_AR } from '../lib/workout'
import { Icon, IconX } from '../ui/icons'
import { Bare } from '../ui/Layout'
import { Button } from '../ui/primitives'
import { useSafe } from '../ui/Toast'

const SECTIONS: Section[] = ['warmup', 'main', 'finisher', 'cardio']

export function DayDetail() {
  const { dayId = '' } = useParams()
  const nav = useNavigate()
  const safe = useSafe()
  const exercises = useExercises()
  const data = useLiveQuery(async () => ({ program: await getActiveProgram(), done: await completedSessions(), active: await getActiveSession() }), [])
  if (!data?.program || !exercises) return null
  const { program, done, active } = data
  const day = program.days.find((d) => d.id === dayId)
  if (!day) return <Bare><p className="pt-safe text-muted">اليوم ده مش موجود</p></Bare>

  const week = done[0] ? trainingWeek(done[0].startedAt, Date.now()) : 1
  const cover = dayCover(day, exercises)
  const totalSets = day.blocks.filter((b) => b.section !== 'warmup' && b.section !== 'cardio').reduce((a, b) => a + effectiveSets(b, week), 0)
  const otherOpen = active && active.dayId !== day.id

  const start = () =>
    safe(async () => {
      if (active) { nav(`/session/${active.id}`); return }
      const s = await startSession(program.id, day.id)
      nav(`/session/${s.id}`)
    })

  return (
    <Bare>
      <div className="relative -mx-4 mb-4">
        <div className="relative h-72 overflow-hidden rounded-b-[2.25rem] bg-white">
          {cover && <img src={cover} alt="" className="h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-[#18252e]/75 via-[#18252e]/10 to-transparent" />
        </div>
        <button type="button" onClick={() => nav(-1)} aria-label="رجوع" className="glass-strong absolute right-4 top-0 mt-[max(env(safe-area-inset-top),0.75rem)] flex h-11 w-11 items-center justify-center rounded-2xl"><Icon.back /></button>
        <div className="absolute inset-x-5 bottom-5 text-white">
          <h1 className="text-3xl font-bold">{day.name}</h1>
          <p className="text-sm text-white/85">{dayFocus(day, exercises)}</p>
        </div>
      </div>

      <div className="glass mb-4 grid grid-cols-3 divide-x divide-x-reverse divide-white/70 p-0 text-center">
        {[
          { label: 'المدة', value: `${estimateMinutes(day, exercises, week)} د` },
          { label: 'المجموعات', value: `${totalSets}` },
          { label: 'المرحلة', value: isReturnPhase(week) ? 'رجوع' : `أسبوع ${week}` },
        ].map((s) => (
          <div key={s.label} className="py-3.5">
            <div className="text-xs text-muted">{s.label}</div>
            <div className="text-lg font-bold num">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-5">
        {SECTIONS.map((sec) => {
          const blocks = day.blocks.filter((b) => b.section === sec)
          if (blocks.length === 0) return null
          return (
            <section key={sec}>
              <h2 className="mb-2 px-1 text-[15px] font-semibold">{SECTION_AR[sec]}</h2>
              <ul className="space-y-2">
                {blocks.map((b) => {
                  const e = exercises.get(b.exerciseId)
                  if (!e) return null
                  const range = b.repMin === b.repMax ? `${b.repMin}` : `${b.repMin}-${b.repMax}`
                  return (
                    <li key={b.id}>
                      <Link to={`/exercises/${encodeURIComponent(e.id)}`} className="glass flex items-center gap-3 p-2.5 pl-3">
                        {e.images[0]
                          ? <img src={e.images[0]} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-2xl bg-white object-cover" />
                          : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent"><IconX.dumbbell /></span>}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{e.nameAr}</span>
                          <span className="block text-xs text-muted">
                            {effectiveSets(b, week)} مجموعات × {range} {UNIT[e.metric]}{e.unilateral ? ' • لكل ناحية' : ''}{b.group ? ' • سوبر سيت' : ''}
                          </span>
                        </span>
                        <IconX.arrow />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-safe">
        <div className="mx-auto mb-2 max-w-xl">
          <Button className="flex w-full items-center justify-center gap-2 py-4 text-lg" onClick={start}>
            <IconX.play />{otherOpen ? 'عندك تمرين مفتوح — كمّله' : active ? 'كمّل التمرين' : 'ابدأ التمرين'}
          </Button>
        </div>
      </div>
    </Bare>
  )
}
