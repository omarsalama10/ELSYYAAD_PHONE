import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { lifeDb } from '../db/db'
import { exportLifeBackup, importLifeBackup } from '../db/backup'
import { getKV, KV } from '../db/repo'
import { dayKey } from '../domain/time'
import { diagnostics, repairOffline, useOfflineState, type Diagnostics } from '../../lib/offline'
import { Banner, Button, Card, PageTitle } from '../../ui/primitives'
import { useSafe, useToast } from '../../ui/Toast'
import { fmtDayLong } from '../ui/format'
import { deliverFile } from '../ui/kit'

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export function LifeSettingsScreen() {
  const safe = useSafe()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const offline = useOfflineState()
  const [diag, setDiag] = useState<Diagnostics>()
  const lastBackupAt = useLiveQuery(() => getKV<number>(KV.lastLifeBackupAt), [])
  const counts = useLiveQuery(async () => ({ tasks: await lifeDb.tasks.count(), projects: await lifeDb.projects.count(), attachments: await lifeDb.attachments.count() }), [])
  const [persisted, setPersisted] = useState<boolean>()
  const [usage, setUsage] = useState<string>()

  const refreshStorage = async () => {
    try {
      setPersisted(await navigator.storage?.persisted?.())
      const est = await navigator.storage?.estimate?.()
      if (est?.usage !== undefined) setUsage(`${(est.usage / 1024 / 1024).toFixed(1)} ميجا`)
    } catch { /* unsupported */ }
  }
  useEffect(() => { void refreshStorage() }, [])

  const doExport = () => safe(async () => {
    const file = new File([await exportLifeBackup()], `elsyyaad-life-backup-${dayKey(Date.now())}.zip`, { type: 'application/zip' })
    const r = await deliverFile(file)
    if (r === 'shared') toast('النسخة اتبعتت — اختار "Save to Files" وحطها على iCloud')
    if (r === 'downloaded') toast('النسخة اتنزلت')
  })

  const doImport = (f: File | undefined) => safe(async () => {
    if (!f) return
    if (!confirm('الاسترجاع هيمسح كل بيانات Life OS الحالية ويحط مكانها اللي في النسخة. متأكد؟')) return
    const data = await importLifeBackup(new Uint8Array(await f.arrayBuffer()))
    toast(`تم الاسترجاع: ${data.tasks.length} مهمة، ${data.projects.length} مشروع`)
  })

  const requestPersist = () => safe(async () => {
    const ok = await navigator.storage?.persist?.()
    await refreshStorage()
    toast(ok ? 'التخزين بقى دائم ✅' : 'Safari رفض — ثبّت التطبيق على الشاشة الرئيسية وجرب تاني', ok ? 'ok' : 'error')
  })

  const wipe = () => safe(async () => {
    if (!confirm('هتمسح كل حاجة: المهام والمشاريع والأهداف والعادات والمرفقات. متأكد؟')) return
    if (!confirm('آخر تأكيد — مفيش رجوع. عملت نسخة احتياطية؟')) return
    await lifeDb.delete()
    location.reload()
  })

  return (
    <div className="space-y-4">
      <PageTitle>الإعدادات</PageTitle>

      {!isStandalone() && (
        <Banner tone="warn">
          عشان يشتغل من غير نت وميتمسحش: افتح الموقع من Safari ← زرار المشاركة (⬆️) ← <b>Add to Home Screen</b>، وبعدين افتحه من الأيقونة.
        </Banner>
      )}

      <Link to="/settings/planner" className="glass flex items-center justify-between p-4">
        <span>
          <span className="block font-bold">التخطيط والتذكير</span>
          <span className="block text-sm text-muted">ساعات اليوم، هامش الطوارئ، الأولويات، مستوى المتابعة، الإشعارات</span>
        </span>
        <span className="text-muted">←</span>
      </Link>
      <div className="grid grid-cols-2 gap-2">
        <Link to="/data" className="glass p-3 text-sm font-semibold">Claude والبيانات ←</Link>
        <Link to="/trash" className="glass p-3 text-sm font-semibold">سلة المحذوفات ←</Link>
      </div>

      <Card className="space-y-3">
        <h2 className="font-bold">النسخة الاحتياطية</h2>
        <p className="text-sm text-muted">
          البيانات متخزنة على الموبايل بس. اعمل نسخة كل أسبوعين واحفظها على iCloud Drive.
          {counts && <> عندك {counts.tasks} مهمة، {counts.projects} مشروع، {counts.attachments} مرفق.</>}
        </p>
        <p className="text-sm">آخر نسخة: {lastBackupAt ? fmtDayLong(dayKey(lastBackupAt)) : <span className="text-warn">لسه معملتش</span>}</p>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => void doExport()}>اعمل نسخة</Button>
          <Button variant="soft" className="flex-1" onClick={() => fileRef.current?.click()}>استرجاع نسخة</Button>
        </div>
        <input ref={fileRef} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => { void doImport(e.target.files?.[0]); e.target.value = '' }} />
      </Card>

      <Card className="space-y-2">
        <h2 className="font-bold">التخزين</h2>
        <p className="text-sm" data-testid="offline-state">
          الشغل من غير نت:{' '}
          {offline === 'ready' ? <span className="text-accent">جاهز ✅</span>
            : offline === 'preparing' ? <span className="text-warn">بيتجهّز… خليك متصل بالنت</span>
            : offline === 'failed' ? <span className="text-danger">التجهيز فشل — اضغط "إصلاح" تحت</span>
            : offline === 'unsupported' ? <span className="text-danger">المتصفح ده مش بيدعمه</span> : '—'}
        </p>
        <div className="flex gap-2">
          <Button variant="soft" className="flex-1 py-2 text-sm" onClick={() => void diagnostics().then(setDiag)}>تفاصيل فنية</Button>
          <Button variant="soft" className="flex-1 py-2 text-sm" onClick={() => { if (confirm('هيمسح النسخة المتخزنة للتطبيق (مش الداتا بتاعتك) ويحمّلها من جديد. لازم تكون متصل بالنت. تكمّل؟')) void repairOffline() }}>إصلاح</Button>
        </div>
        {diag && (
          <pre className="ltr overflow-x-auto rounded-xl bg-white/70 p-2 text-left text-[11px] leading-relaxed text-muted" data-testid="diagnostics">
{`online: ${diag.online}  standalone: ${diag.standalone}
sw: ${diag.swSupported}  controller: ${diag.controller}
installing: ${diag.installing ?? '-'}  waiting: ${diag.waiting ?? '-'}  active: ${diag.active ?? '-'}
${diag.caches.map((c) => `${c.name}: ${c.entries}`).join('\n') || 'no caches'}`}
          </pre>
        )}
        <p className="text-sm">
          تخزين دائم: {persisted === undefined ? '—' : persisted ? <span className="text-accent">مفعّل ✅</span> : <span className="text-warn">مش مفعّل</span>}
          {usage && <span className="text-muted"> • مستخدم {usage}</span>}
        </p>
        {persisted === false && <Button variant="soft" onClick={() => void requestPersist()}>فعّل التخزين الدائم</Button>}
      </Card>

      <Card className="space-y-2">
        <h2 className="font-bold text-danger">منطقة الخطر</h2>
        <Button variant="danger" className="w-full" onClick={() => void wipe()}>امسح كل الداتا</Button>
      </Card>

      <p className="pb-4 text-center text-xs text-muted">ELSYYAAD Life OS v{__APP_VERSION__} • كل البيانات على جهازك</p>
    </div>
  )
}
