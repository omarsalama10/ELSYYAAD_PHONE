import { useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../db/db'
import { deleteMedia, exerciseHistory, getMedia, putMedia } from '../db/repo'
import { bestPerSession, sideTotals } from '../domain/stats'
import { MUSCLE_AR } from '../data/catalog'
import { fmtDate, fmtNum, UNIT } from '../lib/format'
import { ExerciseDemo } from '../ui/ExerciseDemo'
import { Icon } from '../ui/icons'
import { Bare } from '../ui/Layout'
import { LineChart } from '../ui/LineChart'
import { Button, Card } from '../ui/primitives'
import { useSafe } from '../ui/Toast'
import { fromLog } from '../lib/setValues'

const MAX_VIDEO_MB = 200

export function ExerciseDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const safe = useSafe()
  const fileRef = useRef<HTMLInputElement>(null)
  const exercise = useLiveQuery(() => db.exercises.get(id), [id])
  const media = useLiveQuery(() => getMedia(id), [id])
  const history = useLiveQuery(() => exerciseHistory(id, 50), [id])

  if (exercise === undefined) return null
  if (!exercise) return <Bare><p className="pt-safe text-muted">التمرين مش موجود</p></Bare>
  const e = exercise
  const chronological = [...(history ?? [])].reverse()
  const isLoaded = e.metric === 'reps' && chronological.some((h) => h.sets.some((s) => s.weight))
  const series = e.unilateral
    ? (['L', 'R'] as const).map((side) => ({
        name: side === 'L' ? 'شمال' : 'يمين',
        points: bestPerSession(e, chronological.map((h) => ({ at: h.session.startedAt, sets: h.sets.filter((s) => s.side === side) }))),
      }))
    : [{ name: e.nameAr, points: bestPerSession(e, chronological.map((h) => ({ at: h.session.startedAt, sets: h.sets }))) }]

  const onFile = (f: File | undefined) =>
    safe(async () => {
      if (!f) return
      if (f.size > MAX_VIDEO_MB * 1024 * 1024) throw new Error(`الفيديو أكبر من ${MAX_VIDEO_MB} ميجا — قصّه الأول`)
      await putMedia(e.id, f)
    }, 'الفيديو اتحفظ على الموبايل')

  return (
    <Bare>
      <div className="flex items-center gap-2 pb-3 pt-safe">
        <button type="button" onClick={() => nav(-1)} className="rounded-lg p-1 text-muted" aria-label="رجوع"><Icon.back /></button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold">{e.nameAr}</h1>
          <div className="ltr truncate text-right text-xs text-muted">{e.name}</div>
        </div>
      </div>

      <div className="space-y-4">
        <ExerciseDemo exercise={e} />
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(ev) => { void onFile(ev.target.files?.[0]); ev.target.value = '' }} />
          <Button variant="soft" className="flex-1" onClick={() => fileRef.current?.click()}>{media ? 'غيّر الفيديو' : 'ضيف فيديو من الجاليري'}</Button>
          {media && <Button variant="danger" onClick={() => void safe(() => deleteMedia(e.id), 'الفيديو اتمسح')}>مسح</Button>}
        </div>

        <div className="flex flex-wrap gap-1.5 text-xs">
          {e.muscles.map((m) => <span key={m} className="rounded-full bg-surface2 px-2 py-0.5 text-muted">{MUSCLE_AR[m] ?? m}</span>)}
          {e.unilateral && <span className="rounded-full bg-accent2/15 px-2 py-0.5 text-accent2">شمال ويمين منفصل</span>}
        </div>

        <Card>
          <h2 className="mb-2 font-bold">إزاي تلعبه صح</h2>
          <ul className="list-disc space-y-1 pr-5 text-sm leading-relaxed">{e.cuesAr.map((c) => <li key={c}>{c}</li>)}</ul>
          {e.instructions.length > 0 && (
            <details className="mt-3 text-sm text-muted">
              <summary className="cursor-pointer text-accent2">شرح تفصيلي (إنجليزي)</summary>
              <ol className="ltr mt-2 list-decimal space-y-1 pl-5 text-left">{e.instructions.map((s) => <li key={s}>{s}</li>)}</ol>
            </details>
          )}
        </Card>

        <LineChart title={isLoaded ? 'أقصى قوة تقديرية (1RM)' : `أفضل أداء (${UNIT[e.metric]})`} unit={isLoaded ? 'كجم' : UNIT[e.metric]} series={series} />

        {e.unilateral && chronological.length > 0 && (() => {
          const t = sideTotals(e, chronological.at(-1)!.sets)
          return <Card className="text-sm">آخر حجم تمرين — شمال: <b>{fmtNum(t.L, 0)}</b> • يمين: <b>{fmtNum(t.R, 0)}</b></Card>
        })()}

        {history && history.length > 0 && (
          <Card>
            <h2 className="mb-2 font-bold">السجل</h2>
            <ul className="space-y-1.5 text-sm">
              {history.slice(0, 15).map((h) => (
                <li key={h.session.id} className="flex justify-between gap-3">
                  <span className="text-muted">{fmtDate(h.session.startedAt)}</span>
                  <span className="ltr text-left">
                    {h.sets.map((s) => {
                      const v = fromLog(e, s).value
                      return `${s.side ?? ''}${s.weight ? `${fmtNum(s.weight)}×` : ''}${fmtNum(v)}`
                    }).join('  ')}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </Bare>
  )
}
