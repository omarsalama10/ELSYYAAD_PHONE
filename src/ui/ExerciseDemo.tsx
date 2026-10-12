import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getMedia } from '../db/repo'
import { useObjectUrl } from '../lib/hooks'
import type { Exercise } from '../domain/types'
import { Icon } from './icons'

/** User video if attached, else a 2-frame start/end animation, else a placeholder. */
export function ExerciseDemo({ exercise, compact = false }: { exercise: Exercise; compact?: boolean }) {
  const media = useLiveQuery(() => getMedia(exercise.id), [exercise.id])
  const url = useObjectUrl(media?.blob)
  const [frame, setFrame] = useState(0)
  const frames = exercise.images

  useEffect(() => {
    if (url || frames.length < 2) return
    const t = setInterval(() => setFrame((f) => (f + 1) % frames.length), 1100)
    return () => clearInterval(t)
  }, [url, frames.length])

  const h = compact ? 'h-40' : 'h-56'
  if (url)
    return <video src={url} className={`w-full ${h} rounded-xl bg-black object-contain`} controls playsInline loop muted autoPlay />
  if (frames.length === 0)
    return (
      <div className={`flex ${compact ? 'h-24' : 'h-32'} flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-muted text-xs`}>
        <Icon.video />
        مفيش صورة — ضيف فيديو من صفحة التمرين
      </div>
    )
  return (
    <div className={`relative w-full ${h} overflow-hidden rounded-2xl bg-white`}>
      {frames.map((src, i) => (
        <img
          key={src}
          src={src}
          alt={i === 0 ? 'وضع البداية' : 'وضع النهاية'}
          loading="lazy"
          className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-500 ${i === frame ? 'opacity-100' : 'opacity-0'}`}
        />
      ))}
    </div>
  )
}
