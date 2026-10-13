import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { completedSessions, getActiveProgram, getActiveSession } from '../db/repo'
import { trainingWeek } from '../domain/progression'
import { nextDayId } from '../domain/rotation'
import { useExercises } from '../lib/hooks'
import { dayCover, dayFocus, estimateMinutes } from '../lib/workout'
import { IconX } from '../ui/icons'
import { PageTitle } from '../ui/primitives'
import { IconWell } from '../ui/viz'

export function WorkoutsScreen() {
  const exercises = useExercises()
  const data = useLiveQuery(async () => ({ program: await getActiveProgram(), done: await completedSessions(), active: await getActiveSession() }), [])
  if (!data?.program || !exercises) return null
  const { program, done, active } = data
  const week = done[0] ? trainingWeek(done[0].startedAt, Date.now()) : 1
  const next = active?.dayId ?? nextDayId(program.days.map((d) => d.id), done.at(-1)?.dayId)

  return (
    <div className="space-y-4">
      <PageTitle action={<Link to="/program" className="glass-strong flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm text-accent"><IconX.edit />تعديل</Link>}>
        التمارين
      </PageTitle>
      <p className="-mt-2 text-sm text-muted">{program.name}</p>

      {program.days.map((d) => {
        const cover = dayCover(d, exercises)
        const count = d.blocks.filter((b) => b.section !== 'warmup').length
        const isNext = d.id === next
        return (
          <Link key={d.id} to={`/workouts/${d.id}`} className="glass relative flex h-40 overflow-hidden p-0 active:scale-[0.99]" data-testid={`day-${d.id}`}>
            <div className="absolute inset-0 bg-gradient-to-l from-white/30 via-accent/5 to-accent2/15" />
            <div className="relative flex flex-1 flex-col justify-between p-5">
              <div>
                {isNext && <span className="mb-1.5 inline-block rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-white">النهارده</span>}
                <h2 className="text-2xl font-bold leading-tight">{d.name}</h2>
                <p className="mt-1 line-clamp-1 text-sm text-muted">{dayFocus(d, exercises, 3)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-glass text-ink"><IconX.arrow /></span>
                <span className="text-xs text-muted">{estimateMinutes(d, exercises, week)} د • {count} تمرين</span>
              </div>
            </div>
            {cover && (
              <div className="relative w-[42%] shrink-0">
                <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-l from-transparent to-white/70" />
              </div>
            )}
          </Link>
        )
      })}

      <Link to="/program/new" className="glass flex items-center gap-3 p-4" data-testid="build-program">
        <IconWell tone="accent"><IconX.bolt /></IconWell>
        <div className="flex-1">
          <div className="font-semibold">ابني برنامج جديد</div>
          <div className="text-xs text-muted">حسب هدفك وخبرتك ووقتك والأجهزة والإصابات</div>
        </div>
        <IconX.arrow />
      </Link>

      <Link to="/exercises" className="glass flex items-center gap-3 p-4">
        <IconWell tone="violet"><IconX.layers /></IconWell>
        <div className="flex-1">
          <div className="font-semibold">مكتبة التمارين</div>
          <div className="text-xs text-muted">صور وشرح لكل تمرين، وضيف فيديو من عندك</div>
        </div>
        <IconX.arrow />
      </Link>
    </div>
  )
}
