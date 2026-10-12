import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Tone = 'ok' | 'error'
interface ToastItem { id: number; text: string; tone: Tone }
const Ctx = createContext<(text: string, tone?: Tone) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((text: string, tone: Tone = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, text, tone }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3500)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 pt-safe px-4 pointer-events-none">
        {items.map((t) => (
          <div key={t.id} role="status" className={`rounded-xl px-4 py-2 text-sm shadow-lg ${t.tone === 'error' ? 'bg-danger text-white' : 'bg-surface2 text-ink border border-line'}`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)

/** Wraps an async action so failures always surface instead of failing silently. */
export function useSafe() {
  const toast = useToast()
  return useCallback(
    async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
      try {
        const r = await fn()
        if (ok) toast(ok)
        return r
      } catch (e) {
        toast(e instanceof Error ? e.message : 'حصل خطأ', 'error')
        return undefined
      }
    },
    [toast],
  )
}
