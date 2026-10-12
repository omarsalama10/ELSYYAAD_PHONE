import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { beep, unlockAudio } from '../lib/sound'
import { fmtDuration } from '../lib/format'

interface Rest { endAt: number; total: number }
interface Api { start: (sec: number) => void; stop: () => void }
const Ctx = createContext<Api>({ start: () => {}, stop: () => {} })
export const useRest = () => useContext(Ctx)

/** Timestamp-based so it stays correct when iOS throttles a backgrounded page. */
export function RestTimerProvider({ children }: { children: ReactNode }) {
  const [rest, setRest] = useState<Rest>()
  const [now, setNow] = useState(Date.now())
  const fired = useRef(false)

  const start = useCallback((sec: number) => {
    unlockAudio()
    if (sec <= 0) return
    fired.current = false
    setRest({ endAt: Date.now() + sec * 1000, total: sec })
    setNow(Date.now())
  }, [])
  const stop = useCallback(() => setRest(undefined), [])

  useEffect(() => {
    if (!rest) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [rest])

  const left = rest ? rest.endAt - now : 0
  useEffect(() => {
    if (rest && left <= 0 && !fired.current) {
      fired.current = true
      beep()
      const t = setTimeout(() => setRest(undefined), 4000)
      return () => clearTimeout(t)
    }
  }, [rest, left])

  return (
    <Ctx.Provider value={{ start, stop }}>
      {children}
      {rest && (
        <div className="fixed inset-x-0 bottom-0 z-50 pb-safe px-3">
          <div className={`mx-auto mb-2 max-w-xl rounded-3xl border p-4 shadow-glass backdrop-blur-xl ${left <= 0 ? 'border-accent/40 bg-accent/15' : 'border-white/80 bg-white/85'}`}>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="text-xs text-muted">{left <= 0 ? 'يلا المجموعة الجاية 💪' : 'راحة'}</div>
                <div className="ltr text-3xl font-bold tabular-nums text-right" data-testid="rest-left">{fmtDuration(Math.max(0, left))}</div>
              </div>
              <button type="button" className="rounded-xl bg-white px-3 py-2 text-sm shadow-glass" onClick={() => setRest((r) => r && { ...r, endAt: r.endAt + 15_000, total: r.total + 15 })}>+15ث</button>
              <button type="button" className="rounded-xl bg-white px-3 py-2 text-sm shadow-glass" onClick={stop}>تخطي</button>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-accent/10">
              <div className="h-full rounded-full bg-gradient-to-l from-accent to-[#5cc9ad] transition-[width] duration-200" style={{ width: `${Math.max(0, Math.min(100, (left / (rest.total * 1000)) * 100))}%` }} />
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}
