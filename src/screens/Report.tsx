import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { allWeights } from '../db/nutritionRepo'
import { fmtDateLong, fmtNum, todayISO } from '../lib/format'
import { useCoachReport } from '../lib/coach'
import { buildSummaryText } from '../lib/exportData'
import { Icon } from '../ui/icons'
import { Bare } from '../ui/Layout'
import { Button, Card } from '../ui/primitives'
import { useSafe, useToast } from '../ui/Toast'
import { recordLine } from './coach/CoachParts'

const STATUS: Record<string, string> = { progressing: '📈 بيتقدّم', plateau: '⏸️ ثابت', regressing: '📉 بينزل', insufficient: '⏳ بيانات قليلة' }

/** Printable progress report (Save as PDF from the print/share sheet) + ChatGPT summary. */
export function ReportScreen() {
  const nav = useNavigate()
  const toast = useToast()
  const safe = useSafe()
  const report = useCoachReport()
  const data = useLiveQuery(async () => ({
    inbody: await db.inbody.orderBy('date').toArray(),
    weights: await allWeights(),
    sessions: (await db.sessions.toArray()).filter((s) => s.finishedAt),
  }), [])
  const [summary, setSummary] = useState<string>()
  useEffect(() => { void buildSummaryText().then(setSummary) }, [])
  if (!report || !data) return null

  const first = data.inbody[0], last = data.inbody.at(-1)
  const copy = () => safe(async () => {
    if (!summary) return
    await navigator.clipboard.writeText(summary)
    toast('اتنسخ — الصقه في ChatGPT ✅')
  })
  const share = () => safe(async () => {
    if (!summary) return
    if (navigator.share) await navigator.share({ text: summary, title: 'ملخص تمريني' }).catch(() => {})
    else await copy()
  })

  return (
    <Bare>
      <div className="no-print flex items-center gap-3 pb-4 pt-safe">
        <button type="button" onClick={() => nav(-1)} aria-label="رجوع" className="glass-strong flex h-10 w-10 items-center justify-center rounded-2xl text-muted"><Icon.back /></button>
        <h1 className="text-2xl font-bold">التقرير</h1>
      </div>
      <div className="no-print mb-4 grid grid-cols-2 gap-2">
        <Button onClick={() => window.print()}>طباعة / حفظ PDF</Button>
        <Button variant="soft" onClick={() => void copy()} disabled={!summary}>انسخ ملخص ChatGPT</Button>
      </div>

      <article className="space-y-4" data-testid="report">
        <header className="print-only hidden">
          <h1 className="text-2xl font-bold">تقرير التقدم — جيمي</h1>
        </header>
        <p className="text-sm text-muted">تاريخ التقرير: {fmtDateLong(todayISO())}</p>

        <div className="grid grid-cols-3 gap-2 text-center">
          <Card className="p-3"><div className="text-[11px] text-muted">تمارين</div><div className="text-xl font-bold num">{data.sessions.length}</div></Card>
          <Card className="p-3"><div className="text-[11px] text-muted">أرقام قياسية</div><div className="text-xl font-bold num">{report.prCount}</div></Card>
          <Card className="p-3"><div className="text-[11px] text-muted">أسابيع التزام</div><div className="text-xl font-bold num">{report.streak}</div></Card>
        </div>

        {last && (
          <Card>
            <h2 className="mb-2 font-semibold">الجسم (InBody)</h2>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted"><tr><th className="text-right font-normal">القياس</th><th className="font-normal">{first?.date}</th><th className="font-normal">{last.date}</th></tr></thead>
              <tbody>
                {([['الوزن', 'weight', 'كجم'], ['العضل SMM', 'smm', 'كجم'], ['الدهون', 'pbf', '%'], ['كتلة الدهون', 'bfm', 'كجم']] as const).map(([label, k, unit]) => (
                  <tr key={k} className="border-t border-line/60"><td className="py-1.5">{label}</td><td className="text-center num">{fmtNum(first?.[k])}</td><td className="text-center font-semibold num">{fmtNum(last[k])} {unit}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        <Card>
          <h2 className="mb-2 font-semibold">التمارين: الأرقام والتحليل</h2>
          <ul className="space-y-2.5">
            {report.exercises.map((r) => (
              <li key={r.exercise.id} className="text-sm">
                <div className="flex justify-between gap-2"><b>{r.exercise.nameAr}</b><span className="text-xs">{STATUS[r.analysis.status]}</span></div>
                <div className="text-xs text-muted">{recordLine(r)} • {r.sessions} حصة</div>
                {r.analysis.status !== 'insufficient' && <div className="text-xs">{r.analysis.recommendation}</div>}
              </li>
            ))}
            {report.exercises.length === 0 && <li className="text-sm text-muted">لسه مفيش تمارين متسجلة.</li>}
          </ul>
        </Card>

        <Card className="no-print">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">ملخص لـ ChatGPT</h2>
            <button type="button" className="text-sm text-accent" onClick={() => void share()}>شارك</button>
          </div>
          <textarea readOnly value={summary ?? '...'} className="h-64 w-full text-xs leading-relaxed" aria-label="ملخص ChatGPT" data-testid="ai-summary" />
        </Card>
      </article>
    </Bare>
  )
}
