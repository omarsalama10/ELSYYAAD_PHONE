import type {
  Commitment, DayLog, DayPlan, Goal, Habit, HabitLog, LifeSettings, Milestone, Note, Project, ReminderLogEntry, Task, TaskEvent, Template, TimeLog,
} from './types'
import { DEFAULT_SETTINGS } from './types'

/** Serializable snapshot of all Life OS data (attachment blobs travel separately). */
export interface AttachmentMeta { id: string; taskId?: string; projectId?: string; name: string; mime: string; size: number; createdAt: number; file: string }

export interface LifeData {
  schema: typeof LIFE_SCHEMA
  exportedAt: number
  settings: LifeSettings
  tasks: Task[]
  events: TaskEvent[]
  projects: Project[]
  milestones: Milestone[]
  goals: Goal[]
  commitments: Commitment[]
  logs: TimeLog[]
  habits: Habit[]
  habitLogs: HabitLog[]
  dayLogs: DayLog[]
  notes: Note[]
  plans: DayPlan[]
  templates: Template[]
  reminders: ReminderLogEntry[]
  attachments: AttachmentMeta[]
}

export const LIFE_SCHEMA = 1

export const LIFE_TABLES = [
  'tasks', 'events', 'projects', 'milestones', 'goals', 'commitments', 'logs', 'habits', 'habitLogs', 'dayLogs', 'notes', 'plans', 'templates', 'reminders', 'attachments',
] as const
export type LifeTable = (typeof LIFE_TABLES)[number]

const KEY: Partial<Record<LifeTable, string>> = { dayLogs: 'day' }

/** Shape check before a destructive restore. Throws a user-facing Arabic message. */
export function validateLifeData(x: unknown): LifeData {
  if (typeof x !== 'object' || x === null) throw new Error('بيانات Life OS غير صالحة')
  const o = x as Record<string, unknown>
  if (o.schema !== LIFE_SCHEMA) throw new Error(`إصدار بيانات Life OS غير مدعوم (${String(o.schema)})`)
  for (const t of LIFE_TABLES) {
    const rows = o[t] ?? []
    if (!Array.isArray(rows)) throw new Error(`بيانات Life OS ناقصة: ${t}`)
    const key = KEY[t] ?? 'id'
    for (const r of rows)
      if (typeof r !== 'object' || r === null || typeof (r as Record<string, unknown>)[key] !== 'string') throw new Error(`بيانات تالفة في: ${t}`)
    o[t] = rows
  }
  o.settings = { ...DEFAULT_SETTINGS, ...(typeof o.settings === 'object' && o.settings ? o.settings : {}) }
  return o as unknown as LifeData
}

export function mergeSettings(s: Partial<LifeSettings> | undefined): LifeSettings {
  return { ...DEFAULT_SETTINGS, ...(s ?? {}), weights: { ...DEFAULT_SETTINGS.weights, ...(s?.weights ?? {}) } }
}
