import { useEffect, useState } from 'react'

export type OfflineState = 'unsupported' | 'preparing' | 'failed' | 'ready'

const IMAGE_CACHE = 'exercise-images'

/**
 * Ready = a service worker controls this page AND the app shell (index.html + the
 * running JS bundle) is in Cache Storage. Only then does a cold offline launch work.
 * Failed = the worker was registered but its install ended up redundant.
 */
export async function offlineState(): Promise<OfflineState> {
  if (!('serviceWorker' in navigator) || !('caches' in window)) return 'unsupported'
  const reg = await navigator.serviceWorker.getRegistration()
  if (!navigator.serviceWorker.controller) {
    if (reg && !reg.installing && !reg.waiting && !reg.active) return 'failed'
    return 'preparing'
  }
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src
  const shell = await caches.match('index.html', { ignoreSearch: true })
  const bundle = script ? await caches.match(script, { ignoreSearch: true }) : shell
  return shell && bundle ? 'ready' : 'preparing'
}

export function useOfflineState(): OfflineState | undefined {
  const [state, setState] = useState<OfflineState>()
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      const s = await offlineState().catch(() => 'preparing' as const)
      if (!alive) return
      setState(s)
      if (s !== 'ready' && s !== 'unsupported') timer = setTimeout(tick, 1500)
    }
    void tick()
    navigator.serviceWorker?.addEventListener('controllerchange', tick)
    return () => {
      alive = false
      clearTimeout(timer)
      navigator.serviceWorker?.removeEventListener('controllerchange', tick)
    }
  }, [])
  return state
}

export interface ImageProgress { done: number; total: number }

/** Counts which of the given image URLs are already in the runtime image cache. */
export async function imageProgress(urls: string[]): Promise<ImageProgress> {
  if (!('caches' in window)) return { done: 0, total: urls.length }
  const cache = await caches.open(IMAGE_CACHE)
  const keys = new Set((await cache.keys()).map((r) => new URL(r.url).pathname))
  const done = urls.filter((u) => keys.has(new URL(u, location.href).pathname)).length
  return { done, total: urls.length }
}

/**
 * Fetches missing images through the service worker (which stores them CacheFirst),
 * a few at a time. Safe to call repeatedly; failures are retried on the next call.
 */
export async function warmImages(urls: string[], onProgress?: (p: ImageProgress) => void): Promise<ImageProgress> {
  if (!navigator.serviceWorker?.controller || !navigator.onLine) return imageProgress(urls)
  const cache = await caches.open(IMAGE_CACHE)
  const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname))
  const missing = urls.filter((u) => !have.has(new URL(u, location.href).pathname))
  let done = urls.length - missing.length
  onProgress?.({ done, total: urls.length })
  const queue = [...missing]
  const worker = async () => {
    for (let u = queue.shift(); u; u = queue.shift()) {
      try {
        const res = await fetch(u)
        if (res.ok) done++
      } catch { /* offline or flaky: picked up next time */ }
      onProgress?.({ done, total: urls.length })
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  return { done, total: urls.length }
}

export interface Diagnostics {
  online: boolean
  standalone: boolean
  swSupported: boolean
  controller: boolean
  installing?: string
  waiting?: string
  active?: string
  caches: { name: string; entries: number }[]
}

export async function diagnostics(): Promise<Diagnostics> {
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
  const names = 'caches' in window ? await caches.keys() : []
  const list = await Promise.all(names.map(async (name) => ({ name, entries: (await (await caches.open(name)).keys()).length })))
  return {
    online: navigator.onLine,
    standalone: window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    swSupported: 'serviceWorker' in navigator,
    controller: !!navigator.serviceWorker?.controller,
    installing: reg?.installing?.state,
    waiting: reg?.waiting?.state,
    active: reg?.active?.state,
    caches: list,
  }
}

/** Last resort: drop the worker and every cache (not user data), then reload online. */
export async function repairOffline(): Promise<void> {
  const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? []
  await Promise.all(regs.map((r) => r.unregister()))
  if ('caches' in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)))
  location.reload()
}

// ---- background warmup (one runner per page) ----

let warmUrls: string[] = []
let warmProgress: ImageProgress = { done: 0, total: 0 }
let warming = false
const listeners = new Set<(p: ImageProgress) => void>()
const emit = (p: ImageProgress) => { warmProgress = p; listeners.forEach((l) => l(p)) }

async function runWarmup() {
  if (warming || warmUrls.length === 0) return
  warming = true
  try {
    emit(await warmImages(warmUrls, emit))
  } finally {
    warming = false
  }
}

/** Starts warming once the worker controls the page, and again whenever we come back online. */
export function startImageWarmup(urls: string[]) {
  warmUrls = urls
  warmProgress = { done: 0, total: urls.length }
  void imageProgress(urls).then(emit).catch(() => {})
  navigator.serviceWorker?.addEventListener('controllerchange', () => void runWarmup())
  window.addEventListener('online', () => void runWarmup())
  if (navigator.serviceWorker?.controller) void runWarmup()
}

export function useImageWarmup(): ImageProgress {
  const [p, setP] = useState(warmProgress)
  useEffect(() => {
    listeners.add(setP)
    setP(warmProgress)
    return () => { listeners.delete(setP) }
  }, [])
  return p
}
