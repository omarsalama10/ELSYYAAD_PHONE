import { Link } from 'react-router-dom'
import type { Achievement, Challenge } from '../../domain/achievements'
import type { ProgressAnalysis } from '../../domain/plateau'
import type { ExerciseReport } from '../../domain/report'
import { fmtDate, fmtNum, UNIT } from '../../lib/format'

const STATUS: Record<ProgressAnalysis['status'], { label: string; cls: string; icon: string }> = {
  progressing: { label: 'بيتقدّم', cls: 'bg-accent/15 text-accent', icon: '📈' },
  plateau: { label: 'ثابت', cls: 'bg-warn/15 text-warn', icon: '⏸️' },
  regressing: { label: 'بينزل', cls: 'bg-danger/10 text-danger', icon: '📉' },
  insufficient: { label: 'بيانات قليلة', cls: 'bg-white/70 text-muted', icon: '⏳' },
}

export function AnalysisCard({ analysis, title }: { analysis: ProgressAnalysis; title?: string }) {
  const st = STATUS[analysis.status]
  return (
    <div className="glass space-y-2 p-4" data-testid="analysis">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{title ?? 'تحليل المدرب'}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>{st.icon} {st.label}</span>
      </div>
      <p className="text-sm text-muted"><b className="text-ink">ليه؟</b> {analysis.why}</p>
      <p className="text-sm"><b>الخطوة الجاية:</b> {analysis.recommendation}</p>
    </div>
  )
}

export function recordLine(r: ExerciseReport): string {
  const { records: rec, exercise: e } = r
  if (rec.e1rm) return `أقصى قوة ${fmtNum(rec.e1rm.value)} كجم • أتقل وزن ${fmtNum(rec.weight?.value)} كجم`
  if (rec.weight) return `أتقل وزن ${fmtNum(rec.weight.value)} كجم`
  if (rec.value) return `أفضل أداء ${fmtNum(rec.value.value)} ${UNIT[e.metric]}`
  return '—'
}

export function RecordsList({ reports }: { reports: ExerciseReport[] }) {
  const withRecords = reports.filter((r) => r.records.e1rm || r.records.weight || r.records.value)
  if (withRecords.length === 0) return <p className="text-sm text-muted">لسه مفيش أرقام — كمّل تمرين وهتظهر هنا.</p>
  return (
    <ul className="divide-y divide-white/70" data-testid="records">
      {withRecords.map((r) => {
        const at = r.records.e1rm?.at ?? r.records.weight?.at ?? r.records.value?.at
        return (
          <li key={r.exercise.id}>
            <Link to={`/exercises/${encodeURIComponent(r.exercise.id)}`} className="flex items-center gap-3 py-2.5">
              <span className="text-lg">🏆</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{r.exercise.nameAr}</span>
                <span className="block text-xs text-muted">{recordLine(r)}</span>
              </span>
              {at !== undefined && <span className="text-[11px] text-muted">{fmtDate(at)}</span>}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export function Challenges({ items }: { items: Challenge[] }) {
  return (
    <ul className="space-y-3">
      {items.map((c) => (
        <li key={c.id} className="text-sm">
          <div className="mb-1 flex justify-between"><span>{c.title}</span><span className="num">{c.value}/{c.goal}{c.value >= c.goal ? ' ✅' : ''}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-accent/10">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(c.value / c.goal) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function AchievementsGrid({ items }: { items: Achievement[] }) {
  return (
    <ul className="grid grid-cols-3 gap-2.5" data-testid="achievements">
      {items.map((a) => (
        <li key={a.id} className={`rounded-2xl border border-white/80 p-2.5 text-center ${a.unlocked ? 'bg-white/80 shadow-glass' : 'bg-white/35'}`} aria-label={`${a.title}: ${a.unlocked ? 'مفتوح' : 'مقفول'}`}>
          <div className={`text-2xl ${a.unlocked ? '' : 'opacity-30 grayscale'}`}>{a.icon}</div>
          <div className="mt-1 text-xs font-semibold leading-tight">{a.title}</div>
          <div className="text-[10px] leading-tight text-muted">{a.desc}</div>
          {!a.unlocked && (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-accent/10">
              <div className="h-full bg-accent/60" style={{ width: `${a.progress * 100}%` }} />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
