import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { lifeDb } from '../db/db'
import { applyPlanChanges, createSnapshot, loadAll, restoreSnapshot, uid } from '../db/repo'
import { buildReport } from '../domain/analytics'
import { previewPlanFile, type PlanChange, type PlanPreview } from '../domain/planFile'
import { buildStateExport, claudePrompt, PLAN_FILE_GUIDE, stateMarkdown } from '../domain/report'
import { addDays } from '../domain/time'
import { fmtDateTime, fmtTime } from '../ui/format'
import { useLife } from '../state'
import { Button } from '../../ui/primitives'
import { useSafe, useToast } from '../../ui/Toast'
import { Chip, copyText, deliverFile, Header, Section, Sheet } from '../ui/kit'

const ENTITY_LABEL: Record<PlanChange['entity'], string> = { project: 'مشروع', goal: 'هدف', milestone: 'مرحلة', task: 'مهمة', commitment: 'التزام', habit: 'عادة', note: 'ملاحظة', settings: 'إعدادات' }
const ACTION_LABEL = { create: 'جديد', update: 'تعديل', delete: 'حذف' } as const

/**
 * The bridge to Claude outside the app: export the real state, bring back a plan file,
 * review every change, apply with an automatic snapshot, roll back if needed.
 */
export function DataCenter() {
  const { data, proposal, now, today } = useLife()
  const safe = useSafe()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [paste, setPaste] = useState('')
  const [preview, setPreview] = useState<PlanPreview | null>(null)
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const snapshots = useLiveQuery(() => lifeDb.snapshots.orderBy('createdAt').reverse().toArray(), [])

  const report = () => buildReport({ ...data, now }, { from: addDays(today, -27), to: addDays(today, 1) })

  const copyPrompt = () => safe(async () => {
    const md = stateMarkdown(await loadAll(), proposal, report(), now)
    if (await copyText(claudePrompt(md))) toast('اتنسخ — الصقه في Claude واكتب طلبك في الآخر')
    else await deliverFile(new File([claudePrompt(md)], `elsyyaad-prompt-${today}.md`, { type: 'text/markdown' }))
  })
  const exportJson = () => safe(async () => {
    const st = buildStateExport(await loadAll(), proposal, report(), now)
    await deliverFile(new File([JSON.stringify(st, null, 2)], `elsyyaad-state-${today}.json`, { type: 'application/json' }))
  })
  const exportMd = () => safe(async () => {
    const md = stateMarkdown(await loadAll(), proposal, report(), now)
    await deliverFile(new File([md], `elsyyaad-state-${today}.md`, { type: 'text/markdown' }))
  })

  const parse = (text: string) => {
    let raw: unknown
    const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    try { raw = JSON.parse(trimmed) } catch { toast('ده مش JSON صالح — انسخ ملف الخطة بس', 'error'); return }
    const p = previewPlanFile(raw, data, { now: Date.now(), newId: uid })
    setExcluded(new Set())
    setPreview(p)
  }
  const apply = () => safe(async () => {
    if (!preview) return
    const changes = preview.changes.filter((_, i) => !excluded.has(i))
    await applyPlanChanges(changes, preview.title ?? 'خطة', __APP_VERSION__)
    toast(`اتطبق ${changes.length} تغيير — في نسخة قبل الاستيراد لو حبيت ترجع`)
    setPreview(null)
    setPaste('')
  })

  return (
    <div className="space-y-4 pb-8">
      <Header back title="Claude والبيانات" sub="صدّر حالتك الحقيقية، واستورد الخطة اللي Claude يجهزها بعد مراجعتها" />

      <Section title="1. صدّر حالتك لـ Claude">
        <div className="glass space-y-2 p-4">
          <p className="text-sm text-muted">بيصدّر المشاريع والأهداف والمهام المفتوحة والالتزامات والقرارات والمؤشرات — كلها من بياناتك الفعلية، مع تعليمات صيغة ملف الخطة.</p>
          <Button className="w-full" onClick={() => void copyPrompt()}>انسخ البرومبت + الحالة</Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="soft" className="text-sm" onClick={() => void exportMd()}>الحالة Markdown</Button>
            <Button variant="soft" className="text-sm" onClick={() => void exportJson()}>الحالة JSON (بالمعرّفات)</Button>
          </div>
          <button type="button" className="text-xs font-semibold text-accent" onClick={() => void copyText(PLAN_FILE_GUIDE).then((ok) => ok && toast('صيغة ملف الخطة اتنسخت'))}>انسخ صيغة ملف الخطة بس</button>
        </div>
      </Section>

      <Section title="2. استورد خطة من Claude">
        <div className="glass space-y-2 p-4">
          <textarea aria-label="ملف الخطة" className="ltr w-full font-mono text-xs" rows={6} placeholder='{ "schema": "elsyyaad.lifeos.plan/v1", ... }' value={paste} onChange={(e) => setPaste(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => parse(paste)} disabled={!paste.trim()}>راجع التغييرات</Button>
            <Button variant="soft" onClick={() => fileRef.current?.click()}>من ملف</Button>
          </div>
          <input ref={fileRef} type="file" accept=".json,application/json,text/plain" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then(parse); e.target.value = '' }} />
          <p className="text-[11px] text-muted">مفيش أي حاجة بتتغير قبل ما توافق. قبل التطبيق بيتعمل snapshot تلقائي تقدر ترجعله.</p>
        </div>
      </Section>

      <Section title="نسخ الرجوع (Snapshots)" action={<button type="button" className="text-sm font-semibold text-accent" onClick={() => void safe(() => createSnapshot('يدوي', __APP_VERSION__), 'اتعملت نسخة')}>+ نسخة الآن</button>}>
        <ul className="space-y-1.5">
          {snapshots?.length === 0 && <li className="px-1 text-sm text-muted">بتتعمل تلقائيًا قبل الاستيراد والترقيات والاسترجاع (آخر 12).</li>}
          {snapshots?.map((s) => (
            <li key={s.id} className="glass flex items-center gap-2 px-3.5 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{s.reason}</span>
                <span className="text-[11px] text-muted">{new Date(s.createdAt).toLocaleString('ar-EG-u-nu-latn')} • v{s.appVersion} • {Math.round(s.json.length / 1024)}KB</span>
              </span>
              <Button variant="soft" className="px-3 py-1.5 text-xs" onClick={() => void safe(async () => {
                if (!confirm('ترجع لنسخة دي؟ هيتعمل snapshot للحالة الحالية الأول.')) return
                await restoreSnapshot(s.id, __APP_VERSION__)
              }, 'رجعت للنسخة')}>رجوع</Button>
            </li>
          ))}
        </ul>
        <p className="px-1 text-[11px] text-muted">الـ snapshots جوه الموبايل. للحماية من ضياع الموبايل اعمل نسخة احتياطية zip من الإعدادات واحفظها على iCloud.</p>
      </Section>

      {preview && (
        <Sheet open onClose={() => setPreview(null)} title={preview.title ?? 'مراجعة الخطة'} footer={
          preview.errors.length ? <p className="text-center text-sm text-danger">صلّح الأخطاء في الملف الأول (أو اطلب من Claude يصلحها)</p>
            : <Button className="w-full" disabled={preview.changes.length === excluded.size} onClick={() => void apply()}>طبّق {preview.changes.length - excluded.size} تغيير</Button>
        }>
          {preview.summary && <p className="text-sm text-muted">{preview.summary}</p>}
          {preview.errors.length > 0 && (
            <div className="space-y-1 rounded-2xl bg-danger/10 p-3 text-xs text-danger" data-testid="plan-errors">
              {preview.errors.map((e) => <p key={e} className="ltr text-left">{e}</p>)}
            </div>
          )}
          {preview.warnings.map((w) => <p key={w} className="text-xs text-warn">{w}</p>)}
          {!preview.errors.length && (
            <>
              <ul className="space-y-1.5" data-testid="plan-preview">
                {preview.changes.map((c, i) => (
                  <li key={`${c.entity}${c.id}`} className={`glass space-y-1 px-3 py-2 text-sm ${excluded.has(i) ? 'opacity-40' : ''}`}>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={!excluded.has(i)} onChange={() => setExcluded((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })} />
                      <Chip tone={c.action === 'delete' ? 'danger' : c.action === 'create' ? 'accent' : 'warn'}>{ACTION_LABEL[c.action]}</Chip>
                      <span className="text-xs text-muted">{ENTITY_LABEL[c.entity]}</span>
                      <span className="flex-1 truncate font-medium">{c.title}</span>
                    </label>
                    {c.action === 'update' && c.fields.length > 0 && (
                      <ul className="mr-7 space-y-0.5 text-[11px] text-muted">
                        {c.fields.slice(0, 8).map((f) => <li key={f.field}><b>{f.field}</b>: {short(f.field, f.from)} ← {short(f.field, f.to)}</li>)}
                      </ul>
                    )}
                    {c.entity === 'commitment' && c.action !== 'delete' && <p className="mr-7 text-[11px] text-warn">⚠️ التزام ثابت — اتأكد إنك طالب ده</p>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Sheet>
      )}
    </div>
  )
}

function short(field: string, v: unknown): string {
  if (v === undefined || v === null) return '—'
  if (field.endsWith('Min') && typeof v === 'number' && (field.startsWith('day') || field.startsWith('quiet') || field.startsWith('start') || field.startsWith('end'))) return fmtTime(v)
  if (field === 'dueAt' && typeof v === 'number') return fmtDateTime(v)
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return s.length > 40 ? `${s.slice(0, 40)}…` : s
}
