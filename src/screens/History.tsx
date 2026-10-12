import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db } from '../db/db'
import { completedSessions, deleteSet, discardSession, upsertSet } from '../db/repo'
import type { SetLog } from '../domain/types'
import { fmtDate, fmtDuration, fmtNum, UNIT } from '../lib/format'
import { useExercises } from '../lib/hooks'
import { fromLog, toLog } from '../lib/setValues'
import { Icon } from '../ui/icons'
import { Bare } from '../ui/Layout'
import { Button, CommitNumber, Empty } from '../ui/primitives'
import { useSafe } from '../ui/Toast'

function BackHeader({ title, to }: { title: string; to?: string }) {
  const nav = useNavigate()
  return (
    <div className="flex items-center gap-3 pb-4 pt-safe">
      <button type="button" onClick={() => (to ? nav(to) : nav(-1))} aria-label="رجوع" className="glass-strong flex h-10 w-10 items-center justify-center rounded-2xl text-muted"><Icon.back /></button>
      <h1 className="text-2xl font-bold">{title}</h1>
    </div>
  )
}

export function HistoryList() {
  const data = useLiveQuery(async () => {
    const [sessions, sets, programs] = await Promise.all([completedSessions(), db.sets.toArray(), db.programs.toArray()])
    const dayName = new Map(programs.flatMap((p) => p.days.map((d) => [d.id, d.name] as const)))
    return [...sessions].reverse().map((s) => {
      const own = sets.filter((x) => x.sessionId === s.id && x.done)
      return { s, name: dayName.get(s.dayId) ?? s.dayId, sets: own.filter((x) => x.side !== 'R').length, volume: Math.round(own.reduce((a, x) => a + (x.weight && x.reps ? x.weight * x.reps : 0), 0)) }
    })
  }, [])
  if (!data) return null
  return (
    <Bare>
      <BackHeader title="سجل التمارين" to="/progress" />
      {data.length === 0 ? <Empty>لسه مفيش تمارين متسجلة.</Empty> : (
        <ul className="space-y-2">
          {data.map(({ s, name, sets, volume }) => (
            <li key={s.id}>
              <Link to={`/history/${s.id}`} className="glass flex items-center gap-3 p-4" data-testid="history-row">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 font-bold text-accent">{s.dayId}</span>
                <span className="flex-1">
                  <span className="block font-semibold">{name}</span>
                  <span className="block text-xs text-muted">{fmtDate(s.startedAt)} • <span className="ltr num">{fmtDuration((s.finishedAt ?? s.startedAt) - s.startedAt)}</span></span>
                </span>
                <span className="text-left text-xs text-muted"><b className="text-ink num">{sets}</b> مجموعة<br /><span className="num">{volume}</span> كجم</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Bare>
  )
}

export function HistoryDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const safe = useSafe()
  const exercises = useExercises()
  const session = useLiveQuery(() => db.sessions.get(id), [id])
  const sets = useLiveQuery(() => db.sets.where('sessionId').equals(id).toArray(), [id])
  if (session === undefined || !sets || !exercises) return null
  if (!session) return <Bare><BackHeader title="مش موجود" to="/history" /></Bare>

  const groups = new Map<string, SetLog[]>()
  for (const s of [...sets].sort((a, b) => a.at - b.at)) groups.set(s.exerciseId, [...(groups.get(s.exerciseId) ?? []), s])

  const edit = (s: SetLog, patch: Partial<SetLog>) => safe(() => upsertSet({ ...s, ...patch }))
  const removeSession = () => safe(async () => {
    if (!confirm('تمسح التمرين ده بالكامل من السجل؟')) return
    await discardSession(session.id)
    nav('/history')
  })

  return (
    <Bare>
      <BackHeader title={fmtDate(session.startedAt)} to="/history" />
      <p className="-mt-2 mb-4 text-sm text-muted">عدّل أي رقم وهيتحفظ لما تسيب الخانة.</p>
      <div className="space-y-3">
        {[...groups.entries()].map(([exerciseId, list]) => {
          const e = exercises.get(exerciseId)
          if (!e) return null
          return (
            <section key={exerciseId} className="glass p-4" data-testid="history-exercise">
              <h2 className="mb-2 font-semibold">{e.nameAr}</h2>
              <div className="mb-1 grid grid-cols-[2rem_1fr_1fr_1fr_2rem] gap-2 text-[11px] text-muted">
                <span>#</span><span>{e.increment > 0 ? 'الوزن' : ''}</span><span>{UNIT[e.metric]}</span><span>RPE</span><span />
              </div>
              <ul className="space-y-1.5">
                {list.map((s, i) => {
                  const v = fromLog(e, s)
                  return (
                    <li key={s.id} className="grid grid-cols-[2rem_1fr_1fr_1fr_2rem] items-center gap-2">
                      <span className="text-xs text-muted">{i + 1}{s.side ? (s.side === 'L' ? 'ش' : 'ي') : ''}</span>
                      {e.increment > 0 ? <CommitNumber ariaLabel="الوزن" value={s.weight ?? 0} onCommit={(w) => void edit(s, { weight: w })} /> : <span />}
                      <CommitNumber ariaLabel={UNIT[e.metric]} value={Number(fmtNum(v.value ?? 0))} onCommit={(val) => void edit(s, toLog(e, { weight: s.weight, value: val }))} />
                      <CommitNumber ariaLabel="RPE" value={s.rpe ?? 0} onCommit={(r) => void edit(s, { rpe: r >= 6 && r <= 10 ? r : undefined })} />
                      <button type="button" aria-label="مسح المجموعة" className="text-danger" onClick={() => { if (confirm('تمسح المجموعة دي؟')) void safe(() => deleteSet(s.id)) }}><Icon.trash /></button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
      <Button variant="danger" className="mt-5 w-full" onClick={removeSession}>امسح التمرين ده</Button>
    </Bare>
  )
}
