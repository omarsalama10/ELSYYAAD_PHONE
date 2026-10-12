import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { completedSessions, getActiveProgram, getActiveSession, getSetting, SETTING, startSession } from '../db/repo'
import { isDeloadWeek, isReturnPhase, trainingWeek } from '../domain/progression'
import { nextDayId } from '../domain/rotation'
import { summarizeWeek } from '../domain/weekly'
import { fmtDate, fmtDuration, fmtNum, weekStart } from '../lib/format'
import { useExercises } from '../lib/hooks'
import { useOfflineState } from '../lib/offline'
import { dayCover, dayFocus, estimateMinutes } from '../lib/workout'
import { Icon, IconX } from '../ui/icons'
import { Banner, Button } from '../ui/primitives'
import { IconWell, ProgressRing, WeekBars } from '../ui/viz'
import { useSafe } from '../ui/Toast'
import { CheckInCard } from './coach/CheckInCard'

const BACKUP_DAYS = 14
const DAY = 86_400_000
const WEEK_TARGET = 3
const DAY_LETTERS = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'] // Sat → Fri

function greeting(now: number) {
  const h = new Date(now).getHours()
  return h < 12 ? 'صباح الخير' : h < 18 ? 'أهلًا بيك' : 'مساء الخير'
}

export function Today() {
  const nav = useNavigate()
  const safe = useSafe()
  const exercises = useExercises()
  const offline = useOfflineState()
  const data = useLiveQuery(async () => {
    const [program, active, done, lastBackupAt, sets] = await Promise.all([
      getActiveProgram(), getActiveSession(), completedSessions(), getSetting<number>(SETTING.lastBackupAt), db.sets.toArray(),
    ])
    return { program, active, done, lastBackupAt, sets }
  }, [])
  if (!data || !exercises) return null
  const { program, active, done, lastBackupAt, sets } = data
  if (!program) return null

  const now = Date.now()
  const last = done.at(-1)
  const week = done[0] ? trainingWeek(done[0].startedAt, now) : 1
  const nextId = active?.dayId ?? nextDayId(program.days.map((d) => d.id), last?.dayId)
  const day = program.days.find((d) => d.id === nextId) ?? program.days[0]!
  const ws = weekStart(now)
  const summary = summarizeWeek(ws, done, sets, exercises)
  const todayIdx = Math.min(6, Math.floor((now - ws) / DAY))
  const needsBackup = done.length >= 3 && (!lastBackupAt || now - lastBackupAt > BACKUP_DAYS * DAY)
  const cover = dayCover(day, exercises)
  const mainCount = day.blocks.filter((b) => b.section !== 'warmup').length
  const pct = Math.round((Math.min(summary.sessions, WEEK_TARGET) / WEEK_TARGET) * 100)

  const start = (dayId: string) =>
    safe(async () => {
      const s = await startSession(program.id, dayId)
      nav(`/session/${s.id}`)
    })

  const stats = [
    { color: 'bg-accent', label: 'التمارين', value: `${summary.sessions}/${WEEK_TARGET}` },
    { color: 'bg-accent2', label: 'الوقت', value: `${summary.minutes} د` },
    { color: 'bg-[#7c5cd6]', label: 'المجموعات', value: `${summary.sets}` },
    { color: 'bg-warn', label: 'الحجم', value: summary.volume >= 1000 ? `${fmtNum(summary.volume / 1000)} طن` : `${summary.volume} كجم` },
  ]

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between pt-safe">
        <div>
          <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight">{greeting(now)} 👋</h1>
          <p className="text-sm text-muted">جاهز تكسّر النهارده؟ • الأسبوع {week} من البرنامج</p>
        </div>
        <Link to="/settings" aria-label="الإعدادات" className="glass-strong flex h-11 w-11 items-center justify-center rounded-2xl text-muted"><Icon.settings /></Link>
      </header>

      {offline === 'preparing' && (
        <Banner tone="warn">⏳ التطبيق بيتجهّز للشغل من غير نت — خليك متصل بالنت لحد ما الرسالة دي تختفي.</Banner>
      )}
      {offline === 'failed' && (
        <button type="button" className="block w-full text-right" onClick={() => nav('/settings')}>
          <Banner tone="warn">⚠️ التجهيز للشغل من غير نت فشل — اضغط هنا وبعدين "إصلاح".</Banner>
        </button>
      )}
      {isReturnPhase(week) && <Banner>مرحلة الرجوع: مجموعتين بس في كل تمرين، ووزن تحس إنك كنت تقدر تعمل بيه 3-4 عدات زيادة.</Banner>}
      {!isReturnPhase(week) && isDeloadWeek(week) && <Banner tone="warn">أسبوع خفيف (Deload): مجموعات أقل بنفس الأوزان عشان جسمك يستشفى ويرجع أقوى.</Banner>}
      {needsBackup && (
        <button type="button" className="block w-full text-right" onClick={() => nav('/settings')}>
          <Banner tone="warn">بقالك أكتر من {BACKUP_DAYS} يوم من غير نسخة احتياطية — اضغط واحفظ نسخة على iCloud.</Banner>
        </button>
      )}

      {/* Today's workout hero */}
      <section className="glass relative overflow-hidden p-0" aria-label="تمرين النهارده">
        <div className="absolute inset-0 bg-gradient-to-l from-accent/10 via-white/0 to-accent2/10" />
        <div className="relative flex items-stretch">
          <div className="flex flex-1 flex-col gap-3 p-5">
            <span className="w-fit rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">{active ? 'تمرين مفتوح' : 'تمرين النهارده'}</span>
            <Link to={`/workouts/${day.id}`} className="block">
              <h2 className="text-[2rem] font-bold leading-none">{day.name}</h2>
              <p className="mt-1.5 text-sm text-muted">{dayFocus(day, exercises)}</p>
            </Link>
            <div className="flex gap-3 text-xs text-muted">
              <span className="flex items-center gap-1"><IconX.clock />{estimateMinutes(day, exercises, week)} د</span>
              <span className="flex items-center gap-1"><IconX.layers />{mainCount} تمرين</span>
            </div>
            <Button className="mt-1 flex items-center justify-center gap-2" onClick={() => (active ? nav(`/session/${active.id}`) : start(day.id))}>
              <IconX.play />{active ? 'كمّل التمرين' : `ابدأ ${day.name}`}
            </Button>
          </div>
          {cover && (
            <Link to={`/workouts/${day.id}`} className="relative w-[38%] shrink-0" aria-label={`تفاصيل ${day.name}`}>
              <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-white/80" />
            </Link>
          )}
        </div>
      </section>

      <CheckInCard />

      {/* Weekly progress */}
      <section className="glass p-5" aria-label="تقدم الأسبوع">
        <h2 className="mb-3 text-[15px] font-semibold">تقدم الأسبوع</h2>
        <div className="flex items-center gap-5">
          <ProgressRing value={pct / 100} label={`${pct}% من هدف الأسبوع`}>
            <span className="text-2xl font-bold num">{pct}%</span>
            <span className="text-[10px] text-muted">{summary.sessions}/3 الأسبوع ده</span>
          </ProgressRing>
          <ul className="flex-1 space-y-2.5 text-sm">
            {stats.map((s) => (
              <li key={s.label} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted"><span className={`h-2 w-2 rounded-full ${s.color}`} />{s.label}</span>
                <span className="font-semibold num">{s.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Weekly activity */}
      <section className="glass p-5" aria-label="نشاط الأسبوع">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">نشاط الأسبوع</h2>
          <span className="text-xs text-muted">مجموعات في اليوم</span>
        </div>
        <WeekBars values={summary.perDay} labels={DAY_LETTERS} highlight={todayIdx} unit="مجموعة" />
      </section>

      {/* Quick actions */}
      <section aria-label="اختصارات">
        <h2 className="mb-2 px-1 text-[15px] font-semibold">اختصارات</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { to: `/workouts/${day.id}`, label: 'ابدأ تمرين', icon: <IconX.dumbbell />, tone: 'accent' as const },
            { to: '/body?new=inbody', label: 'سجّل InBody', icon: <IconX.scale />, tone: 'violet' as const },
            { to: '/body?tab=tape', label: 'مقاساتي', icon: <IconX.tape />, tone: 'coral' as const },
            { to: '/program', label: 'تعديل البرنامج', icon: <IconX.edit />, tone: 'amber' as const },
          ].map((a) => (
            <Link key={a.label} to={a.to} className="glass flex items-center gap-3 p-3.5 active:scale-[0.98]">
              <IconWell tone={a.tone}>{a.icon}</IconWell>
              <span className="text-sm font-semibold">{a.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {last && (
        <section className="glass flex items-center gap-3 p-4" aria-label="آخر تمرين">
          <IconWell><IconX.flame /></IconWell>
          <div className="flex-1">
            <div className="text-xs text-muted">آخر تمرين</div>
            <div className="font-semibold">{program.days.find((d) => d.id === last.dayId)?.name ?? last.dayId}</div>
          </div>
          <div className="text-left text-xs text-muted">
            <div>{fmtDate(last.startedAt)}</div>
            <div className="ltr num">{fmtDuration((last.finishedAt ?? last.startedAt) - last.startedAt)}</div>
          </div>
        </section>
      )}
    </div>
  )
}
