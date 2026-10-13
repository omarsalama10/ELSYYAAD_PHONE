import type { CheckIn, InBody, Pose, Program, Session, SetLog, Setting, Tape } from './types'
import type { DayLog, Food, MealEntry, WeightLog } from './nutrition/types'

export const BACKUP_VERSION = 4
const SUPPORTED = [1, 2, 3, 4]

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
  checkins: CheckIn[]
  foods: Food[]
  meals: MealEntry[]
  days: DayLog[]
  weights: WeightLog[]
  photos: PhotoMeta[]
}

export interface PhotoMeta { id: string; date: string; pose: Pose; mime: string; at: number; file: string }

const TABLES = ['programs', 'sessions', 'sets', 'inbody', 'tape', 'settings', 'media', 'checkins', 'foods', 'meals', 'days', 'weights', 'photos'] as const
/** Tables added after v1, defaulted to empty when importing an older backup. */
const LATER: Record<string, number> = { checkins: 2, foods: 3, meals: 3, days: 3, weights: 3, photos: 4 }

/** Shape check before any destructive import; throws a user-facing Arabic message. */
export function validateBackup(x: unknown): BackupData {
  if (typeof x !== 'object' || x === null) throw new Error('الملف مش نسخة احتياطية صالحة')
  const o = x as Record<string, unknown>
  if (!SUPPORTED.includes(o.version as number)) throw new Error(`إصدار النسخة غير مدعوم (${String(o.version)})`)
  for (const [t, since] of Object.entries(LATER)) if ((o.version as number) < since && o[t] === undefined) o[t] = []
  for (const t of TABLES) {
    const rows = o[t]
    if (!Array.isArray(rows)) throw new Error(`النسخة ناقصة: ${t}`)
    const key = t === 'settings' ? 'key' : 'id'
    for (const r of rows)
      if (typeof r !== 'object' || r === null || typeof (r as Record<string, unknown>)[key] !== 'string')
        throw new Error(`بيانات تالفة في: ${t}`)
  }
  return { ...(x as BackupData), version: BACKUP_VERSION }
}
