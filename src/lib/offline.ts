import { useEffect, useState } from 'react'

export type OfflineState = 'unsupported' | 'preparing' | 'ready'

/**
 * Ready = a service worker controls this page AND the app shell (index.html + the
 * running JS bundle) is in Cache Storage. Only then does a cold offline launch work.
 */
export async function offlineState(): Promise<OfflineState> {
  if (!('serviceWorker' in navigator) || !('caches' in window)) return 'unsupported'
  if (!navigator.serviceWorker.controller) return 'preparing'
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
      if (s === 'preparing') timer = setTimeout(tick, 1500)
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
