import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { lifeDb } from '../life/db/db'
import { db } from '../db/db'
import { exportBackup, importBackup } from '../db/backup'
import { getActiveProgram, getSetting, saveProgram, SETTING } from '../db/repo'
import { createDefaultProgram } from '../data/defaultProgram'
import { fmtDateLong, todayISO } from '../lib/format'
import { diagnostics, repairOffline, useImageWarmup, useOfflineState, type Diagnostics } from '../lib/offline'
import { Banner, Button, Card, PageTitle } from '../ui/primitives'
import { useSafe, useToast } from '../ui/Toast'

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** iOS share sheet (Save to Files / iCloud) when available, plain download otherwise. */
async function deliver(file: File): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // NotAllowedError (gesture expired) etc. → fall back to download
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

export function SettingsScreen() {
  const safe = useSafe()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const offline = useOfflineState()
  const images = useImageWarmup()
  const [diag, setDiag] = useState<Diagnostics>()
  const lastBackupAt = useLiveQuery(() => getSetting<number>(SETTING.lastBackupAt), [])
  const counts = useLiveQuery(async () => ({ sessions: await db.sessions.count(), inbody: await db.inbody.count(), media: await db.media.count(), tasks: await lifeDb.tasks.count(), projects: await lifeDb.projects.count() }), [])
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

  const doExport = () =>
    safe(async () => {
      const bytes = await exportBackup()
      const file = new File([bytes], `elsyyaad-backup-${todayISO()}.zip`, { type: 'application/zip' })
      const r = await deliver(file)
      if (r === 'shared') toast('النسخة اتبعتت — اختار "Save to Files" وحطها على iCloud')
      if (r === 'downloaded') toast('النسخة اتنزلت')
    })

  const doImport = (f: File | undefined) =>
    safe(async () => {
      if (!f) return
      if (!confirm('الاسترجاع هيمسح كل الداتا الحالية ويحط مكانها اللي في النسخة. متأكد؟')) return
      const data = await importBackup(new Uint8Array(await f.arrayBuffer()))
      toast(`تم الاسترجاع: ${data.sessions.length} تمرين، ${data.inbody.length} قياس${data.life ? `، ${data.life.tasks.length} مهمة، ${data.life.projects.length} مشروع` : ''}`)
    })

  const requestPersist = () =>
    safe(async () => {
      const ok = await navigator.storage?.persist?.()
      await refreshStorage()
      toast(ok ? 'التخزين بقى دائم ✅' : 'Safari رفض — ثبّت التطبيق على الشاشة الرئيسية وجرب تاني', ok ? 'ok' : 'error')
    })

  const resetProgram = () =>
    safe(async () => {
      if (!confirm('ترجّع البرنامج الافتراضي؟ تعديلاتك على البرنامج هتتمسح، لكن سجل التمارين والقياسات هيفضل.')) return
      const current = await getActiveProgram()
      const fresh = createDefaultProgram(Date.now())
      if (current && current.id !== fresh.id) await db.programs.update(current.id, { active: 0 })
      await saveProgram(fresh)
    }, 'البرنامج الافتراضي رجع')

  const wipe = () =>
    safe(async () => {
      if (!confirm('هتمسح كل حاجة: المهام والمشاريع والأهداف والتمارين والقياسات والفيديوهات. متأكد؟')) return
      if (!confirm('آخر تأكيد — مفيش رجوع. عملت نسخة احتياطية؟')) return
      await db.delete()
      await lifeDb.delete()
      location.reload()
    })

  return (
    <div className="space-y-4">
      <PageTitle>الإعدادات</PageTitle>

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

      {!isStandalone() && (
        <Banner tone="warn">
          عشان يشتغل من غير نت وميتمسحش: افتح الموقع من Safari ← زرار المشاركة (⬆️) ← <b>Add to Home Screen</b>، وبعدين افتحه من الأيقونة.
        </Banner>
      )}

      <Card className="space-y-3">
        <h2 className="font-bold">النسخة الاحتياطية</h2>
        <p className="text-sm text-muted">
          الداتا متخزنة على الموبايل بس. النسخة بتشمل Life OS (المهام والمشاريع والأهداف والمرفقات) والجيم. اعملها كل أسبوعين واحفظها على iCloud Drive.
          {counts && <> عندك {counts.tasks} مهمة، {counts.projects} مشروع، {counts.sessions} تمرين، {counts.inbody} قياس InBody، {counts.media} فيديو.</>}
        </p>
        <p className="text-sm">آخر نسخة: {lastBackupAt ? fmtDateLong(lastBackupAt) : <span className="text-warn">لسه معملتش</span>}</p>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={doExport}>اعمل نسخة</Button>
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
        {images.total > 0 && (
          <div className="space-y-1" data-testid="image-progress">
            <p className="text-sm">صور التمارين: <span className="num">{images.done}/{images.total}</span>{images.done >= images.total ? ' ✅' : ''}</p>
            <div className="h-1.5 overflow-hidden rounded-full bg-accent/10">
              <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(images.done / images.total) * 100}%` }} />
            </div>
          </div>
        )}
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
        {persisted === false && <Button variant="soft" onClick={requestPersist}>فعّل التخزين الدائم</Button>}
      </Card>

      <Card className="space-y-2">
        <h2 className="font-bold">برنامج الجيم</h2>
        <Button variant="soft" className="w-full" onClick={resetProgram}>رجّع البرنامج الافتراضي</Button>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-bold text-danger">منطقة الخطر</h2>
        <Button variant="danger" className="w-full" onClick={wipe}>امسح كل الداتا</Button>
      </Card>

      <p className="pb-4 text-center text-xs text-muted">
        ELSYYAAD Life OS v{__APP_VERSION__} • صور التمارين من free-exercise-db (Public Domain) • التطبيق مش بديل عن رأي دكتور
      </p>
    </div>
  )
}
