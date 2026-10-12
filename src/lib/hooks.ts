import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Exercise } from '../domain/types'

export function useExercises(): Map<string, Exercise> | undefined {
  return useLiveQuery(async () => new Map((await db.exercises.toArray()).map((e) => [e.id, e])), [])
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

/** Keeps the screen on while mounted (iOS 16.4+); silently no-ops elsewhere. */
export function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | undefined
    let cancelled = false
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
          lock = await navigator.wakeLock.request('screen')
          if (cancelled) await lock.release()
        }
      } catch {
        /* not supported or denied: the workout still works */
      }
    }
    const onVis = () => { if (document.visibilityState === 'visible') void acquire() }
    void acquire()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      void lock?.release().catch(() => {})
    }
  }, [])
}

export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) { setUrl(undefined); return }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}
