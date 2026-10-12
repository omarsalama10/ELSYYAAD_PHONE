import type { InBody, Program, Session, SetLog, Setting, Tape } from './types'

export const BACKUP_VERSION = 1

export interface MediaMeta {
  id: string
  exerciseId: string
  mime: string
  createdAt: number
  /** Path of the blob inside the zip. */
  file: string
}

export interface BackupData {
  version: typeof BACKUP_VERSION
  exportedAt: number
  programs: Program[]
  sessions: Session[]
  sets: SetLog[]
  inbody: InBody[]
  tape: Tape[]
  settings: Setting[]
  media: MediaMeta[]
}

const TABLES = ['programs', 'sessions', 'sets', 'inbody', 'tape', 'settings', 'media'] as const

/** Shape check before any destructive import; throws a user-facing Arabic message. */
export function validateBackup(x: unknown): BackupData {
  if (typeof x !== 'object' || x === null) throw new Error('الملف مش نسخة احتياطية صالحة')
  const o = x as Record<string, unknown>
  if (o.version !== BACKUP_VERSION) throw new Error(`إصدار النسخة غير مدعوم (${String(o.version)})`)
  for (const t of TABLES) {
    const rows = o[t]
    if (!Array.isArray(rows)) throw new Error(`النسخة ناقصة: ${t}`)
    const key = t === 'settings' ? 'key' : 'id'
    for (const r of rows)
      if (typeof r !== 'object' || r === null || typeof (r as Record<string, unknown>)[key] !== 'string')
        throw new Error(`بيانات تالفة في: ${t}`)
  }
  return x as BackupData
}
