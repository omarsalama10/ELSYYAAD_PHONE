import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addPhoto, deletePhoto, listPhotos } from '../../db/repo'
import type { Pose, ProgressPhoto } from '../../domain/types'
import { fmtDate, todayISO } from '../../lib/format'
import { useObjectUrl } from '../../lib/hooks'
import { downscaleImage } from '../../lib/image'
import { Icon } from '../../ui/icons'
import { Button, Card, Empty } from '../../ui/primitives'
import { useSafe } from '../../ui/Toast'
import { Segmented } from '../../ui/viz'

const POSES: { value: Pose; label: string }[] = [
  { value: 'front', label: 'أمامي' },
  { value: 'side', label: 'جانبي' },
  { value: 'back', label: 'خلفي' },
]

function Img({ photo, className = '', style }: { photo?: ProgressPhoto; className?: string; style?: React.CSSProperties }) {
  const url = useObjectUrl(photo?.blob)
  if (!url) return <div className={`flex items-center justify-center bg-white/50 text-xs text-muted ${className}`} style={style}>مفيش صورة</div>
  return <img src={url} alt={photo ? `${photo.pose} ${photo.date}` : ''} className={`object-cover ${className}`} style={style} />
}

/** Before/after with a draggable divider; both images share the same box so framing lines up. */
function Slider({ before, after }: { before?: ProgressPhoto; after?: ProgressPhoto }) {
  const [pos, setPos] = useState(50)
  return (
    <div className="space-y-2">
      <div className="relative aspect-[3/4] overflow-hidden rounded-3xl bg-white ltr" data-testid="photo-slider">
        <Img photo={after} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
          <Img photo={before} className="absolute inset-0 h-full max-w-none" style={{ width: `${10000 / Math.max(pos, 1)}%` }} />
        </div>
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${pos}%` }} />
        <span className="absolute left-2 top-2 rounded-full bg-ink/70 px-2 py-0.5 text-[11px] text-white">{before ? fmtDate(before.date) : 'قبل'}</span>
        <span className="absolute right-2 top-2 rounded-full bg-ink/70 px-2 py-0.5 text-[11px] text-white">{after ? fmtDate(after.date) : 'بعد'}</span>
      </div>
      <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} className="w-full accent-[#1f8f76]" aria-label="اسحب للمقارنة" />
    </div>
  )
}

export function BodyPhotos() {
  const safe = useSafe()
  const fileRef = useRef<HTMLInputElement>(null)
  const photos = useLiveQuery(() => listPhotos(), [])
  const [pose, setPose] = useState<Pose>('front')
  const [mode, setMode] = useState<'slider' | 'side'>('slider')
  const ofPose = useMemo(() => (photos ?? []).filter((p) => p.pose === pose), [photos, pose])
  const [beforeId, setBeforeId] = useState<string>()
  const [afterId, setAfterId] = useState<string>()
  if (!photos) return null

  const before = ofPose.find((p) => p.id === beforeId) ?? ofPose[0]
  const after = ofPose.find((p) => p.id === afterId) ?? ofPose.at(-1)

  const onFile = (f: File | undefined) =>
    safe(async () => {
      if (!f) return
      await addPhoto(todayISO(), pose, await downscaleImage(f))
      setAfterId(undefined)
    }, 'الصورة اتحفظت على الموبايل ✅')

  const byDate = new Map<string, ProgressPhoto[]>()
  for (const p of [...photos].reverse()) byDate.set(p.date, [...(byDate.get(p.date) ?? []), p])

  return (
    <div className="space-y-3">
      <Segmented options={POSES} value={pose} onChange={(p) => { setPose(p); setBeforeId(undefined); setAfterId(undefined) }} />
      <Card className="space-y-2">
        <Button className="flex w-full items-center justify-center gap-2" onClick={() => fileRef.current?.click()}><Icon.plus />صورة {POSES.find((p) => p.value === pose)!.label} النهارده</Button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} aria-label="رفع صورة" />
        <p className="text-[11px] leading-relaxed text-muted">عشان المقارنة تبقى صح: نفس المكان والإضاءة، الصبح قبل الأكل، نفس المسافة والزاوية، والعضل مرتاح. الصور متخزنة على موبايلك بس.</p>
      </Card>

      {ofPose.length < 2 ? (
        <Empty>محتاج صورتين {POSES.find((p) => p.value === pose)!.label} على الأقل عشان تقارن (عندك {ofPose.length}).</Empty>
      ) : (
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold">المقارنة</h2>
            <div className="w-40"><Segmented options={[{ value: 'slider', label: 'سحب' }, { value: 'side', label: 'جنب بعض' }]} value={mode} onChange={setMode} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted">
            <label className="space-y-1">قبل
              <select className="w-full" value={before?.id} onChange={(e) => setBeforeId(e.target.value)} aria-label="صورة قبل">
                {ofPose.map((p) => <option key={p.id} value={p.id}>{fmtDate(p.date)}</option>)}
              </select>
            </label>
            <label className="space-y-1">بعد
              <select className="w-full" value={after?.id} onChange={(e) => setAfterId(e.target.value)} aria-label="صورة بعد">
                {ofPose.map((p) => <option key={p.id} value={p.id}>{fmtDate(p.date)}</option>)}
              </select>
            </label>
          </div>
          {mode === 'slider' ? <Slider before={before} after={after} /> : (
            <div className="grid grid-cols-2 gap-2" data-testid="photo-side">
              {[before, after].map((p, i) => (
                <figure key={i} className="space-y-1 text-center">
                  <Img photo={p} className="aspect-[3/4] w-full rounded-2xl" />
                  <figcaption className="text-[11px] text-muted">{p ? fmtDate(p.date) : ''}</figcaption>
                </figure>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted">المقارنة بالعين بس — مفيش قياس دهون أو عضل من الصورة، لأن ده بيطلع أرقام غلط.</p>
        </Card>
      )}

      {byDate.size > 0 && (
        <Card>
          <h2 className="mb-2 text-[15px] font-semibold">كل الصور</h2>
          <div className="space-y-3">
            {[...byDate.entries()].map(([date, list]) => (
              <div key={date}>
                <div className="mb-1 text-xs text-muted">{fmtDate(date)}</div>
                <div className="grid grid-cols-3 gap-2">
                  {list.map((p) => (
                    <div key={p.id} className="relative">
                      <Img photo={p} className="aspect-[3/4] w-full rounded-xl" />
                      <span className="absolute bottom-1 right-1 rounded-full bg-ink/60 px-1.5 text-[10px] text-white">{POSES.find((x) => x.value === p.pose)!.label}</span>
                      <button type="button" aria-label="مسح الصورة" className="absolute left-1 top-1 rounded-full bg-white/85 p-1 text-danger" onClick={() => { if (confirm('تمسح الصورة دي؟')) void safe(() => deletePhoto(p.id)) }}><Icon.trash /></button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
