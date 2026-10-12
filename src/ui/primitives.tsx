import { useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass p-4 ${className}`}>{children}</div>
}

type Variant = 'primary' | 'ghost' | 'danger' | 'soft'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-onaccent font-semibold shadow-lift active:brightness-95',
  ghost: 'bg-white/40 text-ink border border-white/80 active:bg-white/70',
  danger: 'bg-danger/10 text-danger border border-danger/25 active:bg-danger/20',
  soft: 'bg-white/70 text-ink border border-white/80 shadow-glass active:bg-white',
}

export function Button({ variant = 'primary', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`rounded-2xl px-4 py-3 text-base transition disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  )
}

export function Banner({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'ok'; children: ReactNode }) {
  const c = tone === 'warn' ? 'bg-warn/10 text-warn' : tone === 'ok' ? 'bg-accent/10 text-accent' : 'bg-white/60 text-ink'
  const dot = tone === 'warn' ? 'bg-warn' : 'bg-accent'
  return (
    <div className={`flex gap-2.5 rounded-2xl border border-white/70 px-3.5 py-3 text-sm leading-relaxed backdrop-blur ${c}`}>
      <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <div>{children}</div>
    </div>
  )
}

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between pt-safe pb-4">
      <h1 className="text-[1.7rem] font-bold tracking-tight">{children}</h1>
      {action}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="glass p-8 text-center text-sm leading-relaxed text-muted">{children}</div>
}

export function NumberInput({ value, onChange, placeholder, className = '', step = 'any', ariaLabel }: {
  value: number | undefined
  onChange: (v: number | undefined) => void
  placeholder?: string
  className?: string
  step?: string
  ariaLabel?: string
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      aria-label={ariaLabel}
      className={`ltr text-center w-full ${className}`}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => {
        const v = e.target.value.replace(',', '.')
        onChange(v === '' ? undefined : Number(v))
      }}
    />
  )
}

/** Edits locally and commits on blur, so clearing the field while typing doesn't snap back. */
export function CommitNumber({ value, onCommit, ariaLabel, min = 0 }: {
  value: number
  onCommit: (v: number) => void
  ariaLabel: string
  min?: number
}) {
  const [text, setText] = useState<string>()
  const commit = () => {
    if (text === undefined) return
    const v = Number(text.replace(',', '.'))
    if (text.trim() !== '' && Number.isFinite(v) && v >= min && v !== value) onCommit(v)
    setText(undefined)
  }
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={ariaLabel}
      className="ltr w-full text-center"
      value={text ?? String(value)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    />
  )
}
