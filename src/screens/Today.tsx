import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { completedSessions, getActiveProgram, getActiveSession, getSetting, SETTING, startSession } from '../db/repo'
import { isDeloadWeek, isReturnPhase, trainingWeek } from '../domain/progression'
import { nextDayId } from '../domain/rotation'
import { fmtDate, fmtDuration, weekStart } from '../lib/format'
import { useExercises } from '../lib/hooks'
import { estimateMinutes } from '../lib/workout'
import { Banner, Button, Card, PageTitle } from '../ui/primitives'
import { useSafe } from '../ui/Toast'

const BACKUP_DAYS = 14
const DAY = 86_400_000

export function Today() {
  const nav = useNavigate()
  const safe = useSafe()
  const exercises = useExercises()
  const data = useLiveQuery(async () => {
    const [program, active, done, lastBackupAt] = await Promise.all([
      getActiveProgram(), getActiveSession(), completedSessions(), getSetting<number>(SETTING.lastBackupAt),
    ])
    return { program, active, done, lastBackupAt }
  }, [])
  if (!data || !exercises) return null
  const { program, active, done, lastBackupAt } = data
  if (!program) return <PageTitle>مفيش برنامج</PageTitle>

  const now = Date.now()
  const last = done.at(-1)
  const week = done[0] ? trainingWeek(done[0].startedAt, now) : 1
  const dayIds = program.days.map((d) => d.id)
  const nextId = active?.dayId ?? nextDayId(dayIds, last?.dayId)
  const day = program.days.find((d) => d.id === nextId) ?? program.days[0]!
  const thisWeek = done.filter((s) => s.startedAt >= weekStart(now)).length
  const needsBackup = done.length >= 3 && (!lastBackupAt || now - lastBackupAt > BACKUP_DAYS * DAY)
  const mainNames = day.blocks.filter((b) => b.section === 'main').map((b) => exercises.get(b.exerciseId)?.nameAr ?? b.exerciseId)

  const start = (dayId: string) =>
    safe(async () => {
      const s = await startSession(program.id, dayId)
      nav(`/session/${s.id}`)
    })

  return (
    <div className="space-y-4">
      <PageTitle>
        <span>اليوم</span>
      </PageTitle>

      <div className="flex items-center gap-3">
        <div className="flex gap-1.5" aria-label="تمارين الأسبوع">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`h-3 w-8 rounded-full ${i < thisWeek ? 'bg-accent' : 'bg-surface2'}`} />
          ))}
        </div>
        <span className="text-sm text-muted">{thisWeek}/3 الأسبوع ده • الأسبوع {week} من البرنامج</span>
      </div>

      {isReturnPhase(week) && (
        <Banner>مرحلة الرجوع (أول أسبوعين): مجموعتين بس في كل تمرين، ووزن تحس إنك كنت تقدر تعمل بيه 3-4 عدات زيادة.</Banner>
      )}
      {!isReturnPhase(week) && isDeloadWeek(week) && (
        <Banner tone="warn">أسبوع خفيف (Deload): مجموعات أقل بنفس الأوزان عشان جسمك يستشفى ويرجع أقوى.</Banner>
      )}
      {needsBackup && (
        <button type="button" className="block w-full text-right" onClick={() => nav('/settings')}>
          <Banner tone="warn">بقالك أكتر من {BACKUP_DAYS} يوم من غير نسخة احتياطية — اضغط هنا واحفظ نسخة على iCloud.</Banner>
        </button>
      )}

      <Card className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-3xl font-black">{day.name}</h2>
          <span className="text-sm text-muted">≈ {estimateMinutes(day, exercises, week)} دقيقة</span>
        </div>
        <p className="text-sm leading-relaxed text-muted">{mainNames.join(' • ')}</p>
        <Button className="w-full text-lg" onClick={() => (active ? nav(`/session/${active.id}`) : start(day.id))}>
          {active ? 'كمّل التمرين' : `ابدأ ${day.name}`}
        </Button>
        {!active && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted">
            <span>أو ابدأ يوم تاني:</span>
            {program.days.filter((d) => d.id !== day.id).map((d) => (
              <button key={d.id} type="button" className="rounded-lg bg-surface2 px-3 py-1 text-ink" onClick={() => start(d.id)}>
                {d.name}
              </button>
            ))}
          </div>
        )}
      </Card>

      {last && (
        <Card>
          <div className="text-sm text-muted">آخر تمرين</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-lg font-bold">{program.days.find((d) => d.id === last.dayId)?.name ?? last.dayId}</span>
            <span className="text-sm text-muted">
              {fmtDate(last.startedAt)} • {fmtDuration((last.finishedAt ?? last.startedAt) - last.startedAt)}
            </span>
          </div>
        </Card>
      )}
    </div>
  )
}
