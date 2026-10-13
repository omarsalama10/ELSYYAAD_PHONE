import { useMemo, useState } from 'react'
import { buildReport, fmtMetric, type Breakdown, type Metric } from '../domain/analytics'
import { toCSV } from '../domain/text'
import { addDays, dayKey, fmtMinutes } from '../domain/time'
import type { Task, TimeLog } from '../domain/types'
import { useLife } from '../state'
import { Button } from '../../ui/primitives'
import { useSafe } from '../../ui/Toast'
import { fmtDayShort, STATUS_LABEL, WEEKDAY_SHORT } from '../ui/format'
import { Chip, deliverFile, Empty, Header, Section, Tabs } from '../ui/kit'
import { parseDay } from '../domain/time'

type RangeKey = '7' | '28' | '90'

export function InsightsScreen() {
  const { data, now, today } = useLife()
  const safe = useSafe()
  const [range, setRange] = useState<RangeKey>('28')
  const r = { from: addDays(today, -Number(range) + 1), to: addDays(today, 1) }
  const rep = useMemo(() => buildReport({ ...data, now }, r), [data, now, range]) // r derives from range + today
  const maxHour = Math.max(1, ...rep.hours)
  const best = rep.hours.map((m, h) => ({ h, m })).filter((x) => x.m > 0).sort((a, b) => b.m - a.m).slice(0, 3)
  const pva = rep.planVsActual.slice(-14)
  const maxPva = Math.max(1, ...pva.flatMap((d) => [d.planned, d.actual]))
  const projName = new Map(data.projects.map((p) => [p.id, p.name]))

  const exportTasks = () => safe(async () => {
    const csv = toCSV<Task>(data.tasks.filter((t) => !t.deletedAt), [
      { key: 'id', label: 'id', get: (t) => t.id }, { key: 'title', label: 'العنوان', get: (t) => t.title },
      { key: 'project', label: 'المشروع', get: (t) => (t.projectId ? projName.get(t.projectId) : '') }, { key: 'status', label: 'الحالة', get: (t) => STATUS_LABEL[t.status] },
      { key: 'importance', label: 'الأهمية', get: (t) => t.importance }, { key: 'progress', label: 'الإنجاز %', get: (t) => t.progress },
      { key: 'due', label: 'الموعد', get: (t) => (t.dueAt ? new Date(t.dueAt).toISOString() : '') }, { key: 'estimate', label: 'المقدّر (د)', get: (t) => t.estimateMin ?? '' },
      { key: 'actual', label: 'الفعلي (د)', get: (t) => t.actualMin }, { key: 'postponed', label: 'مرات التأجيل', get: (t) => t.postponeCount },
      { key: 'category', label: 'التصنيف', get: (t) => t.category ?? '' }, { key: 'completed', label: 'اكتملت', get: (t) => (t.completedAt ? new Date(t.completedAt).toISOString() : '') },
    ])
    await deliverFile(new File([csv], `elsyyaad-tasks-${today}.csv`, { type: 'text/csv' }))
  })
  const exportLogs = () => safe(async () => {
    const byId = new Map(data.tasks.map((t) => [t.id, t]))
    const csv = toCSV<TimeLog>(data.logs.filter((l) => l.end), [
      { key: 'start', label: 'البداية', get: (l) => new Date(l.start).toISOString() }, { key: 'end', label: 'النهاية', get: (l) => new Date(l.end!).toISOString() },
      { key: 'min', label: 'الدقائق', get: (l) => Math.round((l.end! - l.start) / 60_000) }, { key: 'task', label: 'المهمة', get: (l) => (l.taskId ? byId.get(l.taskId)?.title : '') },
      { key: 'project', label: 'المشروع', get: (l) => { const p = l.projectId ?? (l.taskId ? byId.get(l.taskId)?.projectId : undefined); return p ? projName.get(p) : '' } },
      { key: 'kind', label: 'النوع', get: (l) => l.kind }, { key: 'interruptions', label: 'مقاطعات', get: (l) => l.interruptions },
    ])
    await deliverFile(new File([csv], `elsyyaad-time-${today}.csv`, { type: 'text/csv' }))
  })
  const exportJson = () => safe(async () => {
    const json = JSON.stringify({ ...rep, overruns: rep.overruns.map((o) => ({ taskId: o.task.id, title: o.task.title, overMin: o.overMin, ratio: o.ratio })) }, null, 2)
    await deliverFile(new File([json], `elsyyaad-report-${today}.json`, { type: 'application/json' }))
  })

  return (
    <div className="space-y-4 pb-6">
      <Header back title="التحليلات" sub="كل رقم ليه تعريف ومصدر — مفيش «درجة إنتاجية» من غير أساس" />
      <Tabs<RangeKey> value={range} onChange={setRange} tabs={[{ value: '7', label: '7 أيام' }, { value: '28', label: '28 يوم' }, { value: '90', label: '90 يوم' }]} />

      <div className="grid grid-cols-2 gap-2">{rep.metrics.map((m) => <MetricCard key={m.key} m={m} />)}</div>
      {rep.estimationBias !== null && (
        <p className="rounded-2xl bg-white/60 p-3 text-sm">بالمتوسط (الوسيط) مهامك بتاخد <b className="num">{rep.estimationBias.toFixed(2)}×</b> من وقتها المقدّر{rep.estimationBias > 1.15 ? ' — فكّر تزوّد تقديراتك أو تخليها «تقديرية».' : rep.estimationBias < 0.85 ? ' — تقديراتك أكبر من اللازم.' : '.'}</p>
      )}

      <Section title="الوقت المسجل" action={<span className="text-xs text-muted num">{fmtMinutes(rep.focusMin)} • {rep.interruptions} مقاطعة</span>}>
        {rep.focusMin === 0 ? <Empty>شغّل المؤقت أو جلسات التركيز عشان الوقت يتقاس.</Empty> : (
          <div className="grid gap-3">
            <Bars title="حسب المشروع" xs={rep.byProject} />
            <Bars title="حسب التصنيف" xs={rep.byCategory} />
            <Bars title="حسب نوع الجلسة" xs={rep.byKind} />
          </div>
        )}
      </Section>

      {rep.focusMin > 0 && (
        <Section title="أوقات الإنجاز" action={best.length ? <span className="text-xs text-muted">الأفضل: {best.map((b) => `${b.h}:00`).join('، ')}</span> : undefined}>
          <div className="glass p-4">
            <div className="flex h-24 items-end gap-[2px]" role="img" aria-label="الدقائق المسجلة حسب ساعة اليوم">
              {rep.hours.map((m, h) => <div key={h} className={`flex-1 rounded-t ${m ? 'bg-accent' : 'bg-ink/[0.05]'}`} style={{ height: `${Math.max(4, (m / maxHour) * 100)}%` }} title={`${h}:00 — ${m} د`} />)}
            </div>
            <div className="ltr mt-1 flex justify-between text-[10px] text-muted num"><span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></div>
            <p className="mt-2 text-[11px] text-muted">مبني على جلساتك المسجلة فعلًا. استخدمه لتحديد أوقات المهام الثقيلة.</p>
          </div>
        </Section>
      )}

      <Section title="المخطط مقابل الفعلي (آخر 14 يوم)">
        <div className="glass p-4">
          <div className="flex h-28 items-end gap-1" role="img" aria-label="دقائق مخططة مقابل مسجلة لكل يوم">
            {pva.map((d) => (
              <div key={d.day} className="flex flex-1 items-end gap-[1px]" title={`${d.day}: مخطط ${d.planned} د، فعلي ${d.actual} د`}>
                <div className="flex-1 rounded-t bg-ink/15" style={{ height: `${(d.planned / maxPva) * 100}%` }} />
                <div className="flex-1 rounded-t bg-accent" style={{ height: `${(d.actual / maxPva) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted">{pva.filter((_, i) => i % 2 === 0).map((d) => <span key={d.day}>{WEEKDAY_SHORT[parseDay(d.day).getDay()]}</span>)}</div>
          <div className="mt-2 flex gap-3 text-[11px] text-muted"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-ink/15" />مخطط (خطط معتمدة)</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-accent" />فعلي (مؤقت)</span></div>
        </div>
      </Section>

      {rep.velocityWeeks.length > 1 && (
        <Section title="الإنجاز الأسبوعي">
          <div className="glass space-y-1.5 p-4 text-sm">
            {rep.velocityWeeks.map((w) => (
              <div key={w.week} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-xs text-muted">{fmtDayShort(w.week)}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/[0.06]"><div className="h-full rounded-full bg-accent" style={{ width: `${(w.count / Math.max(1, ...rep.velocityWeeks.map((x) => x.count))) * 100}%` }} /></div>
                <span className="w-16 shrink-0 text-left text-xs num">{w.count} مهمة</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {(rep.postpone.length > 0 || rep.lowOutput.length > 0) && (
        <Section title="أسباب التأجيل وانخفاض الإنجاز">
          <div className="glass space-y-2 p-4 text-sm">
            {rep.postpone.map((p) => <div key={p.reason} className="flex justify-between"><span>{p.reason}</span><Chip tone="warn">{p.count} تأجيل</Chip></div>)}
            {rep.lowOutput.map((p) => <div key={p.reason} className="flex justify-between"><span>{p.reason}</span><Chip>{p.count} يوم (تقييم ذاتي)</Chip></div>)}
          </div>
        </Section>
      )}

      {rep.overruns.length > 0 && (
        <Section title="مهام استنزفت وقت أكتر من المتوقع">
          <ul className="glass divide-y divide-white/70 text-sm">
            {rep.overruns.map((o) => (
              <li key={o.task.id} className="flex items-center gap-2 px-4 py-2">
                <a href={`#/tasks/${o.task.id}`} className="flex-1 truncate">{o.task.title}</a>
                <span className="text-xs text-warn num">+{fmtMinutes(o.overMin)} ({o.ratio.toFixed(1)}×)</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {rep.avgEnergy !== null && <p className="px-1 text-sm text-muted">متوسط الطاقة (تقييم ذاتي): <b className="num">{rep.avgEnergy.toFixed(1)}/5</b></p>}

      <Section title="تصدير">
        <div className="grid grid-cols-3 gap-2">
          <Button variant="soft" className="text-sm" onClick={() => void exportTasks()}>المهام CSV</Button>
          <Button variant="soft" className="text-sm" onClick={() => void exportLogs()}>الوقت CSV</Button>
          <Button variant="soft" className="text-sm" onClick={() => void exportJson()}>التقرير JSON</Button>
        </div>
      </Section>
      <p className="text-center text-[11px] text-muted">الفترة: {fmtDayShort(r.from)} ← {fmtDayShort(dayKey(now))}</p>
    </div>
  )
}

function MetricCard({ m }: { m: Metric }) {
  const [open, setOpen] = useState(false)
  return (
    <button type="button" className="glass space-y-1 p-3 text-right" onClick={() => setOpen(!open)} aria-expanded={open} data-testid={`metric-${m.key}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs text-muted">{m.label}</span>
        <span className={`rounded-full px-1.5 text-[9.5px] ${m.basis === 'measured' ? 'bg-accent/10 text-accent' : 'bg-warn/10 text-warn'}`}>{m.basis === 'measured' ? 'مقاس' : m.basis === 'estimated' ? 'تقديري' : 'ذاتي'}</span>
      </div>
      <div className="text-2xl font-bold num">{fmtMetric(m)}</div>
      <div className="text-[11px] text-muted num">{m.value === null ? 'مفيش بيانات كفاية' : `${m.num} / ${m.den}`}</div>
      {open && <p className="pt-1 text-[11px] leading-relaxed text-muted">{m.definition}</p>}
    </button>
  )
}

function Bars({ title, xs }: { title: string; xs: Breakdown[] }) {
  const max = Math.max(1, ...xs.map((x) => x.minutes))
  return (
    <div className="glass space-y-1.5 p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {xs.slice(0, 6).map((x) => (
        <div key={x.key} className="flex items-center gap-2 text-sm">
          <span className="w-24 shrink-0 truncate">{x.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/[0.06]"><div className="h-full rounded-full bg-accent2" style={{ width: `${(x.minutes / max) * 100}%` }} /></div>
          <span className="w-14 shrink-0 text-left text-xs text-muted num">{fmtMinutes(x.minutes)}</span>
        </div>
      ))}
    </div>
  )
}
