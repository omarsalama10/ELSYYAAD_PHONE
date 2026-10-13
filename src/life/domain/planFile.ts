import { newCommitment, newGoal, newHabit, newMilestone, newNote, newProject, newTask } from './factory'
import { normalize } from './text'
import { at, isDayKey, parseHHMM } from './time'
import type {
  ChecklistItem, Commitment, CommitmentRepeat, Goal, GoalMetric, Habit, HabitSchedule, LifeSettings, Milestone, Note, Project, Recurrence, Task,
} from './types'

/**
 * Plan files are how Claude (outside the app) proposes changes. They are validated in
 * full, turned into a reviewable list of changes, and only applied after the user
 * confirms. Nothing is ever hard-deleted from a plan file: `"delete": true` moves the
 * record to the trash (milestones are removed, habits archived).
 */

export const PLAN_SCHEMA = 'elsyyaad.lifeos.plan/v1'

export type Entity = 'project' | 'goal' | 'milestone' | 'task' | 'commitment' | 'habit' | 'note' | 'settings'
export interface FieldChange { field: string; from: unknown; to: unknown }

export type PlanChange =
  | { entity: 'project'; action: Action; id: string; title: string; fields: FieldChange[]; record: Project }
  | { entity: 'goal'; action: Action; id: string; title: string; fields: FieldChange[]; record: Goal }
  | { entity: 'milestone'; action: Action; id: string; title: string; fields: FieldChange[]; record: Milestone }
  | { entity: 'task'; action: Action; id: string; title: string; fields: FieldChange[]; record: Task }
  | { entity: 'commitment'; action: Action; id: string; title: string; fields: FieldChange[]; record: Commitment }
  | { entity: 'habit'; action: Action; id: string; title: string; fields: FieldChange[]; record: Habit }
  | { entity: 'note'; action: Action; id: string; title: string; fields: FieldChange[]; record: Note }
  | { entity: 'settings'; action: 'update'; id: 'settings'; title: string; fields: FieldChange[]; record: LifeSettings }
type Action = 'create' | 'update' | 'delete'

export interface PlanPreview {
  title?: string
  summary?: string
  changes: PlanChange[]
  errors: string[]
  warnings: string[]
}

export interface ExistingData {
  tasks: Task[]
  projects: Project[]
  goals: Goal[]
  milestones: Milestone[]
  commitments: Commitment[]
  habits: Habit[]
  notes: Note[]
  settings: LifeSettings
}

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)

class Ctx {
  errors: string[] = []
  warnings: string[] = []
  err(path: string, msg: string) { this.errors.push(`${path}: ${msg}`) }

  str(o: Obj, k: string, path: string, max = 2000): string | undefined {
    const v = o[k]
    if (v === undefined) return undefined
    if (typeof v !== 'string') { this.err(`${path}.${k}`, 'لازم يكون نص'); return undefined }
    if (v.length > max) { this.err(`${path}.${k}`, `أطول من ${max} حرف`); return undefined }
    return v.trim()
  }
  req(o: Obj, k: string, path: string, max = 300): string | undefined {
    const v = this.str(o, k, path, max)
    if (!v) { if (o[k] === undefined || v === '') this.err(`${path}.${k}`, 'مطلوب'); return undefined }
    return v
  }
  num(o: Obj, k: string, path: string, min: number, max: number, int = true): number | undefined {
    const v = o[k]
    if (v === undefined) return undefined
    if (typeof v !== 'number' || !Number.isFinite(v) || (int && !Number.isInteger(v)) || v < min || v > max) {
      this.err(`${path}.${k}`, `لازم يكون رقم${int ? ' صحيح' : ''} بين ${min} و ${max}`)
      return undefined
    }
    return v
  }
  oneOf<T extends string>(o: Obj, k: string, path: string, values: readonly T[]): T | undefined {
    const v = o[k]
    if (v === undefined) return undefined
    if (!values.includes(v as T)) { this.err(`${path}.${k}`, `قيمة غير مسموحة (${values.join(' | ')})`); return undefined }
    return v as T
  }
  day(o: Obj, k: string, path: string): string | undefined | null {
    const v = o[k]
    if (v === undefined) return undefined
    if (v === null) return null
    if (!isDayKey(v)) { this.err(`${path}.${k}`, 'تاريخ لازم يكون بصيغة YYYY-MM-DD'); return undefined }
    return v
  }
  time(o: Obj, k: string, path: string): number | undefined {
    const v = o[k]
    if (v === undefined) return undefined
    const m = typeof v === 'string' ? parseHHMM(v) : undefined
    if (m === undefined) { this.err(`${path}.${k}`, 'وقت لازم يكون بصيغة HH:mm'); return undefined }
    return m
  }
  strings(o: Obj, k: string, path: string): string[] | undefined {
    const v = o[k]
    if (v === undefined) return undefined
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) { this.err(`${path}.${k}`, 'لازم يكون قائمة نصوص'); return undefined }
    return (v as string[]).map((x) => x.trim()).filter(Boolean)
  }
  weekdays(v: unknown, path: string): number[] | undefined {
    if (!Array.isArray(v) || !v.length || v.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) { this.err(path, 'أيام الأسبوع أرقام من 0 (الأحد) إلى 6 (السبت)'); return undefined }
    return [...new Set(v as number[])].sort()
  }
}

const ENTITY_KEYS: Record<Exclude<Entity, 'settings'>, string> = {
  project: 'projects', goal: 'goals', milestone: 'milestones', task: 'tasks', commitment: 'commitments', habit: 'habits', note: 'notes',
}
const labelOf = (r: { title?: string; name?: string }) => r.title ?? r.name ?? ''

export function previewPlanFile(raw: unknown, data: ExistingData, opt: { now: number; newId: () => string }): PlanPreview {
  const c = new Ctx()
  const preview: PlanPreview = { changes: [], errors: c.errors, warnings: c.warnings }
  if (!isObj(raw)) { c.err('الملف', 'لازم يكون JSON object'); return preview }
  if (raw.schema !== PLAN_SCHEMA) { c.err('schema', `لازم تكون "${PLAN_SCHEMA}"`); return preview }
  preview.title = typeof raw.title === 'string' ? raw.title : undefined
  preview.summary = typeof raw.summary === 'string' ? raw.summary : undefined
  const { now } = opt

  const existing = {
    project: data.projects, goal: data.goals, milestone: data.milestones, task: data.tasks,
    commitment: data.commitments, habit: data.habits, note: data.notes,
  } as Record<Exclude<Entity, 'settings'>, { id: string; title?: string; name?: string; deletedAt?: number }[]>

  // Pass 1: assign ids to refs so items can reference each other in any order.
  const refs: Record<string, Map<string, string>> = {}
  const items: Record<string, { o: Obj; path: string; id: string; isNew: boolean; del: boolean }[]> = {}
  for (const [entity, key] of Object.entries(ENTITY_KEYS) as [Exclude<Entity, 'settings'>, string][]) {
    refs[entity] = new Map()
    items[entity] = []
    const arr = raw[key]
    if (arr === undefined) continue
    if (!Array.isArray(arr)) { c.err(key, 'لازم تكون قائمة'); continue }
    arr.forEach((o, i) => {
      const path = `${key}[${i}]`
      if (!isObj(o)) { c.err(path, 'لازم يكون object'); return }
      const del = o.delete === true
      let id: string | undefined
      if (o.id !== undefined) {
        if (typeof o.id !== 'string' || !existing[entity].some((x) => x.id === o.id)) { c.err(`${path}.id`, `مش موجود في البيانات الحالية (${String(o.id)})`); return }
        id = o.id
      }
      if (o.ref !== undefined) {
        if (typeof o.ref !== 'string' || !o.ref) { c.err(`${path}.ref`, 'لازم يكون نص'); return }
        if (refs[entity]!.has(o.ref)) { c.err(`${path}.ref`, `مكرر (${o.ref})`); return }
      }
      if (!id && del) {
        const byName = findByName(existing[entity], o.title ?? o.name)
        if (byName === 'ambiguous') { c.err(path, 'الاسم مطابق لأكثر من عنصر؛ استخدم id'); return }
        if (!byName) { c.err(path, 'الحذف يحتاج id أو اسم موجود'); return }
        id = byName
      }
      const isNew = !id
      id ??= opt.newId()
      if (typeof o.ref === 'string') refs[entity]!.set(o.ref, id)
      items[entity]!.push({ o, path, id, isNew, del })
    })
  }

  const resolve = (entity: Exclude<Entity, 'settings'>, v: unknown, path: string): string | undefined | null => {
    if (v === undefined) return undefined
    if (v === null) return null
    if (typeof v !== 'string' || !v) { c.err(path, 'مرجع لازم يكون نص'); return undefined }
    const fromRef = refs[entity]!.get(v)
    if (fromRef) return fromRef
    if (existing[entity].some((x) => x.id === v)) return v
    const byName = findByName(existing[entity], v)
    if (byName === 'ambiguous') { c.err(path, `الاسم "${v}" مطابق لأكثر من عنصر`); return undefined }
    if (byName) return byName
    c.err(path, `مرجع غير معروف: "${v}"`)
    return undefined
  }

  const push = (ch: PlanChange) => preview.changes.push(ch)
  const diff = <T extends object>(before: T | undefined, after: T, keys: string[]): FieldChange[] =>
    keys
      .filter((k) => JSON.stringify((before as Obj | undefined)?.[k]) !== JSON.stringify((after as Obj)[k]))
      .map((k) => ({ field: k, from: (before as Obj | undefined)?.[k], to: (after as Obj)[k] }))
  const setIf = <T extends object>(rec: T, k: keyof T, v: unknown) => {
    if (v === null) delete rec[k]
    else if (v !== undefined) (rec as Obj)[k as string] = v
  }
  const keysOf = (o: Obj, map: Record<string, string>) => Object.keys(o).map((k) => map[k] ?? k).filter((k) => !['ref', 'id', 'delete'].includes(k))

  // ---- projects ----
  for (const { o, path, id, isNew, del } of items.project!) {
    const before = data.projects.find((p) => p.id === id)
    if (del) { push({ entity: 'project', action: 'delete', id, title: before!.name, fields: [], record: { ...before!, deletedAt: now, updatedAt: now } }); continue }
    const name = isNew ? c.req(o, 'name', path) : c.str(o, 'name', path, 300)
    const rec: Project = isNew ? newProject(id, now, { name: name ?? '' }, data.projects.length + preview.changes.length) : { ...before!, updatedAt: now }
    setIf(rec, 'name', name)
    setIf(rec, 'description', c.str(o, 'description', path))
    setIf(rec, 'status', c.oneOf(o, 'status', path, ['active', 'paused', 'done', 'archived'] as const))
    setIf(rec, 'color', c.str(o, 'color', path, 20))
    setIf(rec, 'category', c.str(o, 'category', path, 100))
    setIf(rec, 'goalId', resolve('goal', o.goal, `${path}.goal`))
    setIf(rec, 'startDate', c.day(o, 'startDate', path))
    setIf(rec, 'targetDate', c.day(o, 'targetDate', path))
    setIf(rec, 'weighting', c.oneOf(o, 'weighting', path, ['equal', 'estimate', 'custom'] as const))
    push({ entity: 'project', action: isNew ? 'create' : 'update', id, title: rec.name, fields: diff(before, rec, keysOf(o, { goal: 'goalId' })), record: rec })
  }

  // ---- goals ----
  for (const { o, path, id, isNew, del } of items.goal!) {
    const before = data.goals.find((g) => g.id === id)
    if (del) { push({ entity: 'goal', action: 'delete', id, title: before!.title, fields: [], record: { ...before!, deletedAt: now, updatedAt: now } }); continue }
    const title = isNew ? c.req(o, 'title', path) : c.str(o, 'title', path, 300)
    const rec: Goal = isNew ? newGoal(id, now, { title: title ?? '' }) : { ...before!, updatedAt: now, changes: [...before!.changes] }
    setIf(rec, 'title', title)
    setIf(rec, 'outcome', c.str(o, 'outcome', path))
    setIf(rec, 'successCriteria', c.str(o, 'successCriteria', path))
    setIf(rec, 'kind', c.oneOf(o, 'kind', path, ['project', 'learning', 'work', 'habit', 'personal'] as const))
    setIf(rec, 'horizon', c.oneOf(o, 'horizon', path, ['monthly', 'quarterly', 'yearly', 'custom'] as const))
    const sd = c.day(o, 'startDate', path), td = c.day(o, 'targetDate', path)
    if (sd) rec.startDate = sd
    if (td) rec.targetDate = td
    setIf(rec, 'status', c.oneOf(o, 'status', path, ['active', 'paused', 'achieved', 'dropped'] as const))
    if (o.metric !== undefined) { const m = parseMetric(c, o.metric, `${path}.metric`); if (m) rec.metric = m }
    if (rec.targetDate < rec.startDate) c.err(path, 'targetDate قبل startDate')
    const fields = diff(before, rec, keysOf(o, {}).filter((k) => k !== 'reason'))
    if (!isNew) {
      const reason = c.str(o, 'reason', path) || `تعديل من خطة مستوردة${preview.title ? `: ${preview.title}` : ''}`
      for (const f of fields) if (['targetDate', 'metric', 'status', 'successCriteria', 'outcome'].includes(f.field)) rec.changes.push({ at: now, field: f.field, from: f.from, to: f.to, reason })
    }
    push({ entity: 'goal', action: isNew ? 'create' : 'update', id, title: rec.title, fields, record: rec })
  }

  // ---- milestones ----
  for (const { o, path, id, isNew, del } of items.milestone!) {
    const before = data.milestones.find((m) => m.id === id)
    if (del) { push({ entity: 'milestone', action: 'delete', id, title: before!.title, fields: [], record: before! }); continue }
    const title = isNew ? c.req(o, 'title', path) : c.str(o, 'title', path, 300)
    const rec: Milestone = isNew ? newMilestone(id, now, { title: title ?? '' }) : { ...before! }
    setIf(rec, 'title', title)
    setIf(rec, 'projectId', resolve('project', o.project, `${path}.project`))
    setIf(rec, 'goalId', resolve('goal', o.goal, `${path}.goal`))
    setIf(rec, 'parentId', resolve('milestone', o.parent, `${path}.parent`))
    setIf(rec, 'dueDate', c.day(o, 'dueDate', path))
    setIf(rec, 'order', c.num(o, 'order', path, 0, 10_000))
    setIf(rec, 'status', c.oneOf(o, 'status', path, ['open', 'done'] as const))
    if (o.dependsOn !== undefined) rec.dependsOn = resolveList('milestone', o.dependsOn, `${path}.dependsOn`)
    if (isNew && !rec.projectId && !rec.goalId) c.warnings.push(`${path}: مرحلة غير مرتبطة بمشروع أو هدف`)
    push({ entity: 'milestone', action: isNew ? 'create' : 'update', id, title: rec.title, fields: diff(before, rec, keysOf(o, { project: 'projectId', goal: 'goalId', parent: 'parentId' })), record: rec })
  }

  function resolveList(entity: Exclude<Entity, 'settings'>, v: unknown, path: string): string[] {
    if (!Array.isArray(v)) { c.err(path, 'لازم تكون قائمة'); return [] }
    return v.map((x, i) => resolve(entity, x, `${path}[${i}]`)).filter((x): x is string => typeof x === 'string')
  }

  // ---- tasks ----
  for (const { o, path, id, isNew, del } of items.task!) {
    const before = data.tasks.find((t) => t.id === id)
    if (del) { push({ entity: 'task', action: 'delete', id, title: before!.title, fields: [], record: { ...before!, deletedAt: now, updatedAt: now } }); continue }
    const title = isNew ? c.req(o, 'title', path) : c.str(o, 'title', path, 300)
    const rec: Task = isNew ? newTask(id, now, { title: title ?? '' }) : { ...before!, updatedAt: now }
    setIf(rec, 'title', title)
    setIf(rec, 'description', c.str(o, 'description', path))
    setIf(rec, 'notes', c.str(o, 'notes', path))
    setIf(rec, 'links', c.strings(o, 'links', path))
    setIf(rec, 'tags', c.strings(o, 'tags', path))
    setIf(rec, 'category', c.str(o, 'category', path, 100))
    setIf(rec, 'projectId', resolve('project', o.project, `${path}.project`))
    setIf(rec, 'milestoneId', resolve('milestone', o.milestone, `${path}.milestone`))
    setIf(rec, 'goalId', resolve('goal', o.goal, `${path}.goal`))
    setIf(rec, 'importance', c.num(o, 'importance', path, 1, 5))
    if (o.priorityOverride === null) delete rec.priorityOverride
    else setIf(rec, 'priorityOverride', c.num(o, 'priorityOverride', path, 0, 100))
    const status = c.oneOf(o, 'status', path, ['new', 'planned', 'in_progress', 'paused', 'done', 'cancelled'] as const)
    if (status) { rec.status = status; if (status === 'done') { rec.progress = 100; rec.completedAt ??= now } }
    setIf(rec, 'progress', c.num(o, 'progress', path, 0, 100))
    setIf(rec, 'startDate', c.day(o, 'startDate', path))
    if (o.due !== undefined) {
      if (o.due === null) delete rec.dueAt
      else if (typeof o.due === 'string' && isDayKey(o.due)) rec.dueAt = at(o.due, 23 * 60 + 59)
      else if (typeof o.due === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(o.due) && isDayKey(o.due.slice(0, 10)) && parseHHMM(o.due.slice(11)) !== undefined)
        rec.dueAt = at(o.due.slice(0, 10), parseHHMM(o.due.slice(11))!)
      else c.err(`${path}.due`, 'لازم YYYY-MM-DD أو YYYY-MM-DDTHH:mm')
    }
    const est = c.num(o, 'estimateMin', path, 1, 10_000)
    setIf(rec, 'estimateMin', est)
    // An explicit estimate is firm unless the file marks it rough.
    setIf(rec, 'confidence', c.oneOf(o, 'confidence', path, ['firm', 'rough'] as const) ?? (est !== undefined ? 'firm' : undefined))
    setIf(rec, 'energy', c.oneOf(o, 'energy', path, ['deep', 'routine', 'study', 'light'] as const))
    setIf(rec, 'maxSessionMin', c.num(o, 'maxSessionMin', path, 10, 600))
    setIf(rec, 'weight', c.num(o, 'weight', path, 0, 1000, false))
    if (o.dependsOn !== undefined) rec.dependsOn = resolveList('task', o.dependsOn, `${path}.dependsOn`)
    if (o.checklist !== undefined) {
      if (!Array.isArray(o.checklist)) c.err(`${path}.checklist`, 'لازم تكون قائمة')
      else rec.checklist = o.checklist.flatMap((x, i): ChecklistItem[] => {
        if (typeof x === 'string' && x.trim()) return [{ id: `${id}:${i}`, title: x.trim(), done: false }]
        if (isObj(x) && typeof x.title === 'string') return [{ id: `${id}:${i}`, title: x.title.trim(), done: x.done === true }]
        c.err(`${path}.checklist[${i}]`, 'عنصر غير صالح'); return []
      })
    }
    if (o.recurrence !== undefined) {
      if (o.recurrence === null) delete rec.recurrence
      else { const r = parseRecurrence(c, o.recurrence, `${path}.recurrence`); if (r) rec.recurrence = r }
    }
    if (o.pinned !== undefined) {
      if (o.pinned === null) delete rec.pinned
      else if (isObj(o.pinned)) {
        const d = c.day(o.pinned, 'day', `${path}.pinned`), t = c.time(o.pinned, 'time', `${path}.pinned`)
        if (d && t !== undefined) rec.pinned = { day: d, startMin: t }
        else if (!d || t === undefined) c.err(`${path}.pinned`, 'لازم day و time')
      } else c.err(`${path}.pinned`, 'لازم { day, time }')
    }
    if (rec.dependsOn.includes(id)) c.err(`${path}.dependsOn`, 'المهمة لا تعتمد على نفسها')
    push({ entity: 'task', action: isNew ? 'create' : 'update', id, title: rec.title, fields: diff(before, rec, keysOf(o, { project: 'projectId', milestone: 'milestoneId', goal: 'goalId', due: 'dueAt' })), record: rec })
  }

  // ---- commitments ----
  for (const { o, path, id, isNew, del } of items.commitment!) {
    const before = data.commitments.find((x) => x.id === id)
    if (del) { push({ entity: 'commitment', action: 'delete', id, title: before!.title, fields: [], record: { ...before!, deletedAt: now } }); continue }
    const title = isNew ? c.req(o, 'title', path) : c.str(o, 'title', path, 300)
    const start = c.time(o, 'start', path), end = c.time(o, 'end', path)
    if (isNew && (start === undefined || end === undefined)) c.err(path, 'start و end مطلوبين')
    const rec: Commitment = isNew ? newCommitment(id, now, { title: title ?? '', startMin: start ?? 0, endMin: end ?? 0 }) : { ...before! }
    setIf(rec, 'title', title)
    setIf(rec, 'startMin', start)
    setIf(rec, 'endMin', end)
    if (rec.endMin <= rec.startMin) c.err(path, 'end لازم يكون بعد start (نفس اليوم)')
    setIf(rec, 'kind', c.oneOf(o, 'kind', path, ['work', 'class', 'appointment', 'sleep', 'meal', 'gym', 'prayer', 'other'] as const))
    if (o.repeat !== undefined) { const r = parseRepeat(c, o.repeat, `${path}.repeat`); if (r) rec.repeat = r }
    setIf(rec, 'validFrom', c.day(o, 'validFrom', path))
    setIf(rec, 'validUntil', c.day(o, 'validUntil', path))
    setIf(rec, 'remindBeforeMin', c.num(o, 'remindBeforeMin', path, 0, 1440))
    if (o.skipDays !== undefined) {
      const xs = c.strings(o, 'skipDays', path)
      if (xs?.every(isDayKey)) rec.skipDays = xs
      else if (xs) c.err(`${path}.skipDays`, 'تواريخ بصيغة YYYY-MM-DD')
    }
    push({ entity: 'commitment', action: isNew ? 'create' : 'update', id, title: rec.title, fields: diff(before, rec, keysOf(o, { start: 'startMin', end: 'endMin' })), record: rec })
  }

  // ---- habits ----
  for (const { o, path, id, isNew, del } of items.habit!) {
    const before = data.habits.find((x) => x.id === id)
    if (del) { push({ entity: 'habit', action: 'delete', id, title: before!.title, fields: [], record: { ...before!, archived: true } }); continue }
    const title = isNew ? c.req(o, 'title', path) : c.str(o, 'title', path, 300)
    const rec: Habit = isNew ? newHabit(id, now, { title: title ?? '' }) : { ...before! }
    setIf(rec, 'title', title)
    if (o.schedule !== undefined) { const sch = parseSchedule(c, o.schedule, `${path}.schedule`); if (sch) rec.schedule = sch }
    setIf(rec, 'goalId', resolve('goal', o.goal, `${path}.goal`))
    if (typeof o.archived === 'boolean') rec.archived = o.archived
    push({ entity: 'habit', action: isNew ? 'create' : 'update', id, title: rec.title, fields: diff(before, rec, keysOf(o, { goal: 'goalId' })), record: rec })
  }

  // ---- notes ----
  for (const { o, path, id, isNew, del } of items.note!) {
    const before = data.notes.find((x) => x.id === id)
    if (del) { push({ entity: 'note', action: 'delete', id, title: before!.title, fields: [], record: { ...before!, deletedAt: now, updatedAt: now } }); continue }
    const title = isNew ? c.req(o, 'title', path) : c.str(o, 'title', path, 300)
    const kind = c.oneOf(o, 'kind', path, ['note', 'idea', 'decision', 'risk', 'issue'] as const)
    const rec: Note = isNew ? newNote(id, now, { title: title ?? '', kind: kind ?? 'note' }) : { ...before!, updatedAt: now }
    setIf(rec, 'title', title)
    setIf(rec, 'kind', kind)
    setIf(rec, 'body', c.str(o, 'body', path, 20_000))
    setIf(rec, 'projectId', resolve('project', o.project, `${path}.project`))
    setIf(rec, 'goalId', resolve('goal', o.goal, `${path}.goal`))
    setIf(rec, 'taskId', resolve('task', o.task, `${path}.task`))
    setIf(rec, 'day', c.day(o, 'day', path))
    setIf(rec, 'tags', c.strings(o, 'tags', path))
    setIf(rec, 'severity', c.num(o, 'severity', path, 1, 3))
    if (typeof o.open === 'boolean') rec.open = o.open
    push({ entity: 'note', action: isNew ? 'create' : 'update', id, title: rec.title, fields: diff(before, rec, keysOf(o, { project: 'projectId', goal: 'goalId', task: 'taskId' })), record: rec })
  }

  // ---- settings ----
  if (raw.settings !== undefined) {
    if (!isObj(raw.settings)) c.err('settings', 'لازم يكون object')
    else {
      const o = raw.settings
      const s: LifeSettings = { ...data.settings, weights: { ...data.settings.weights } }
      setIf(s, 'dayStartMin', c.time(o, 'dayStart', 'settings'))
      setIf(s, 'dayEndMin', c.time(o, 'dayEnd', 'settings'))
      setIf(s, 'quietStartMin', c.time(o, 'quietStart', 'settings'))
      setIf(s, 'quietEndMin', c.time(o, 'quietEnd', 'settings'))
      setIf(s, 'morningSummaryMin', c.time(o, 'morningSummary', 'settings'))
      setIf(s, 'eveningReviewMin', c.time(o, 'eveningReview', 'settings'))
      setIf(s, 'deepStartMin', c.time(o, 'deepStart', 'settings'))
      setIf(s, 'deepEndMin', c.time(o, 'deepEnd', 'settings'))
      setIf(s, 'bufferPct', c.num(o, 'bufferPct', 'settings', 0, 0.5, false))
      setIf(s, 'gapMin', c.num(o, 'gapMin', 'settings', 0, 120))
      setIf(s, 'defaultSessionMin', c.num(o, 'defaultSessionMin', 'settings', 15, 480))
      setIf(s, 'maxDeepMinPerDay', c.num(o, 'maxDeepMinPerDay', 'settings', 30, 960))
      setIf(s, 'planHorizonDays', c.num(o, 'planHorizonDays', 'settings', 1, 60))
      setIf(s, 'remindBeforeMin', c.num(o, 'remindBeforeMin', 'settings', 0, 240))
      setIf(s, 'accountability', c.oneOf(o, 'accountability', 'settings', ['calm', 'balanced', 'firm'] as const))
      if (o.restWeekdays !== undefined) { const w = Array.isArray(o.restWeekdays) && o.restWeekdays.length === 0 ? [] : c.weekdays(o.restWeekdays, 'settings.restWeekdays'); if (w) s.restWeekdays = w }
      if (s.dayEndMin <= s.dayStartMin) c.err('settings', 'dayEnd لازم يكون بعد dayStart')
      if (s.deepStartMin !== undefined && s.deepEndMin !== undefined && s.deepEndMin <= s.deepStartMin) c.err('settings', 'deepEnd لازم يكون بعد deepStart')
      const fields = diff(data.settings, s, Object.keys(s))
      if (fields.length) push({ entity: 'settings', action: 'update', id: 'settings', title: 'الإعدادات', fields, record: s })
    }
  }

  // Dependency cycles across existing + incoming tasks.
  const merged = new Map(data.tasks.map((t) => [t.id, t]))
  for (const ch of preview.changes) if (ch.entity === 'task') merged.set(ch.id, ch.record)
  const cyc = findCycle([...merged.values()])
  if (cyc) c.err('tasks', `اعتماديات دائرية: ${cyc.map((id) => labelOf(merged.get(id)!)).join(' ← ')}`)

  for (const k of Object.keys(raw)) if (!['schema', 'title', 'summary', 'generatedAt', 'source', 'settings', ...Object.values(ENTITY_KEYS)].includes(k)) c.warnings.push(`مفتاح غير معروف تم تجاهله: ${k}`)
  return preview
}

function findByName(xs: { id: string; title?: string; name?: string; deletedAt?: number }[], v: unknown): string | 'ambiguous' | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined
  const n = normalize(v)
  const hits = xs.filter((x) => !x.deletedAt && normalize(labelOf(x)) === n)
  return hits.length > 1 ? 'ambiguous' : hits[0]?.id
}

function findCycle(tasks: Task[]): string[] | undefined {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const state = new Map<string, 1 | 2>()
  const stack: string[] = []
  const visit = (id: string): string[] | undefined => {
    if (state.get(id) === 2) return undefined
    if (state.get(id) === 1) return [...stack.slice(stack.indexOf(id)), id]
    state.set(id, 1)
    stack.push(id)
    for (const d of byId.get(id)?.dependsOn ?? []) if (byId.has(d)) { const c = visit(d); if (c) return c }
    stack.pop()
    state.set(id, 2)
    return undefined
  }
  for (const t of tasks) { const c = visit(t.id); if (c) return c }
  return undefined
}

function parseRecurrence(c: Ctx, v: unknown, path: string): Recurrence | undefined {
  if (!isObj(v)) { c.err(path, 'لازم object'); return undefined }
  if (v.type === 'daily') return { type: 'daily', every: typeof v.every === 'number' && v.every >= 1 ? Math.floor(v.every) : 1 }
  if (v.type === 'weekly') { const w = c.weekdays(v.weekdays, `${path}.weekdays`); return w && { type: 'weekly', weekdays: w } }
  if (v.type === 'monthly') {
    if (typeof v.day !== 'number' || v.day < 1 || v.day > 31) { c.err(`${path}.day`, 'من 1 إلى 31'); return undefined }
    return { type: 'monthly', day: Math.floor(v.day) }
  }
  c.err(`${path}.type`, 'daily | weekly | monthly')
  return undefined
}

function parseRepeat(c: Ctx, v: unknown, path: string): CommitmentRepeat | undefined {
  if (!isObj(v)) { c.err(path, 'لازم object'); return undefined }
  if (v.type === 'daily') return { type: 'daily' }
  if (v.type === 'once') { if (!isDayKey(v.day)) { c.err(`${path}.day`, 'YYYY-MM-DD'); return undefined } return { type: 'once', day: v.day } }
  if (v.type === 'weekly') { const w = c.weekdays(v.weekdays, `${path}.weekdays`); return w && { type: 'weekly', weekdays: w } }
  c.err(`${path}.type`, 'once | weekly | daily')
  return undefined
}

function parseSchedule(c: Ctx, v: unknown, path: string): HabitSchedule | undefined {
  if (!isObj(v)) { c.err(path, 'لازم object'); return undefined }
  if (v.type === 'daily') return { type: 'daily' }
  if (v.type === 'weekly') { const w = c.weekdays(v.weekdays, `${path}.weekdays`); return w && { type: 'weekly', weekdays: w } }
  if (v.type === 'timesPerWeek') {
    if (typeof v.times !== 'number' || v.times < 1 || v.times > 7) { c.err(`${path}.times`, 'من 1 إلى 7'); return undefined }
    return { type: 'timesPerWeek', times: Math.floor(v.times) }
  }
  c.err(`${path}.type`, 'daily | weekly | timesPerWeek')
  return undefined
}

function parseMetric(c: Ctx, v: unknown, path: string): GoalMetric | undefined {
  if (!isObj(v)) { c.err(path, 'لازم object'); return undefined }
  if (v.type === 'tasks' || v.type === 'milestones') return { type: v.type }
  if (v.type === 'numeric') {
    const nums = ['start', 'target', 'current'].map((k) => v[k] ?? (k === 'current' ? v.start : undefined))
    if (nums.some((n) => typeof n !== 'number' || !Number.isFinite(n))) { c.err(path, 'numeric يحتاج start و target (و current اختياري) كأرقام'); return undefined }
    return { type: 'numeric', unit: typeof v.unit === 'string' ? v.unit : '', start: nums[0] as number, target: nums[1] as number, current: nums[2] as number }
  }
  c.err(`${path}.type`, 'tasks | numeric | milestones')
  return undefined
}
