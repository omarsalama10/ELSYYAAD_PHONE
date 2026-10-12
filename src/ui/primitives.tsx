import { useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-surface border border-line p-4 ${className}`}>{children}</div>
}

type Variant = 'primary' | 'ghost' | 'danger' | 'soft'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-bg font-bold active:brightness-90',
  ghost: 'bg-transparent text-ink border border-line active:bg-surface2',
  danger: 'bg-danger/15 text-danger border border-danger/40 active:bg-danger/25',
  soft: 'bg-surface2 text-ink active:bg-line',
}

export function Button({ variant = 'primary', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`rounded-xl px-4 py-3 text-base transition disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  )
}

export function Banner({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'ok'; children: ReactNode }) {
  const c = tone === 'warn' ? 'border-warn/40 bg-warn/10 text-warn' : tone === 'ok' ? 'border-accent/40 bg-accent/10 text-accent' : 'border-accent2/40 bg-accent2/10 text-accent2'
  return <div className={`rounded-xl border px-3 py-2 text-sm leading-relaxed ${c}`}>{children}</div>
}

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between pt-safe pb-3">
      <h1 className="text-2xl font-bold">{children}</h1>
      {action}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line p-6 text-center text-muted text-sm">{children}</div>
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
