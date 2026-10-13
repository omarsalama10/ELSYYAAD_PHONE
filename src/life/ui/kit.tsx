import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { LI } from './icons'

/** Bottom sheet modal. Closes on backdrop tap and Escape. */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="إغلاق" className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]" onClick={onClose} />
      <div className="glass-strong relative flex max-h-[88vh] w-full max-w-xl flex-col rounded-b-none pb-safe">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" aria-label="إغلاق" onClick={onClose} className="rounded-xl p-1.5 text-muted active:bg-white/70">{LI.close()}</button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <div className="border-t border-white/70 px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-muted">{label}</span>
      {children}
      {hint && <span className="block text-[11px] leading-relaxed text-muted">{hint}</span>}
    </label>
  )
}

export function Chip({ children, tone = 'muted', className = '' }: { children: ReactNode; tone?: 'muted' | 'accent' | 'warn' | 'danger' | 'coral'; className?: string }) {
  const c = { muted: 'bg-white/70 text-muted', accent: 'bg-accent/12 text-accent', warn: 'bg-warn/12 text-warn', danger: 'bg-danger/10 text-danger', coral: 'bg-accent2/12 text-accent2' }[tone]
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] ${c} ${className}`}>{children}</span>
}

export function Bar({ value, tone = 'accent', label, className = '' }: { value: number; tone?: 'accent' | 'warn' | 'danger'; label?: string; className?: string }) {
  const v = Math.max(0, Math.min(1, value))
  const c = { accent: 'bg-accent', warn: 'bg-warn', danger: 'bg-danger' }[tone]
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-ink/[0.07] ${className}`} role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={`h-full rounded-full ${c} transition-[width] duration-500`} style={{ width: `${v * 100}%` }} />
    </div>
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'warn' | 'danger' | 'accent' }) {
  const c = tone === 'warn' ? 'text-warn' : tone === 'danger' ? 'text-danger' : tone === 'accent' ? 'text-accent' : ''
  return (
    <div className="glass px-3 py-2.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`text-lg font-bold num leading-tight ${c}`}>{value}</div>
      {sub && <div className="text-[10.5px] text-muted">{sub}</div>}
    </div>
  )
}

export function Section({ title, action, children, className = '' }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Header({ title, back, action, sub }: { title: ReactNode; back?: boolean | string; action?: ReactNode; sub?: ReactNode }) {
  const nav = useNavigate()
  return (
    <header className="flex items-center gap-2 pb-3 pt-safe">
      {back && (
        <button type="button" aria-label="رجوع" className="glass-strong flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))}>
          {LI.back()}
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[1.5rem] font-bold leading-tight tracking-tight">{title}</h1>
        {sub && <p className="truncate text-xs text-muted">{sub}</p>}
      </div>
      {action}
    </header>
  )
}

export function IconBtn({ label, onClick, children, tone = 'glass', className = '' }: { label: string; onClick: () => void; children: ReactNode; tone?: 'glass' | 'accent'; className?: string }) {
  const c = tone === 'accent' ? 'bg-accent text-onaccent shadow-lift' : 'glass-strong text-ink'
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl active:scale-95 ${c} ${className}`}>
      {children}
    </button>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-accent' : 'bg-ink/15'}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'right-0.5' : 'right-[1.375rem]'}`} />
    </button>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={t.value === value} onClick={() => onChange(t.value)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition ${t.value === value ? 'bg-ink text-white' : 'bg-white/60 text-muted'}`}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

/** Text input that commits on blur/enter (avoids writing to the DB on every keystroke). */
export function CommitText({ value, onCommit, placeholder, multiline, className = '', ariaLabel }: {
  value: string; onCommit: (v: string) => void; placeholder?: string; multiline?: boolean; className?: string; ariaLabel?: string
}) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const commit = () => { if (text !== value) onCommit(text) }
  return multiline ? (
    <textarea aria-label={ariaLabel} className={`w-full ${className}`} rows={3} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={commit} />
  ) : (
    <input aria-label={ariaLabel} className={`w-full ${className}`} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
  )
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="glass space-y-3 p-6 text-center text-sm leading-relaxed text-muted">
      <div>{children}</div>
      {action}
    </div>
  )
}

/** Browser share sheet (Save to Files) when available, plain download otherwise. */
export async function deliverFile(file: File): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
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

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
