import { LIFE_SCHEMA, LIFE_TABLES, mergeSettings, validateLifeData, type AttachmentMeta, type LifeData } from '../domain/data'
import { newCommitment, newGoal, newHabit, newMilestone, newNote, newProject, newTask } from '../domain/factory'
import type { PlanChange } from '../domain/planFile'
import { pendingOccurrences } from '../domain/recurrence'
import { addDays, at, dayKey } from '../domain/time'
import type {
  Attachment, Commitment, DayKey, DayLog, DayPlan, Goal, Habit, HabitMark, ID, LifeSettings, Milestone, Note, PlanBlock, Project,
  ProjectTemplatePayload, ReminderLogEntry, Snapshot, Task, TaskEvent, TaskEventType, TaskStatus, Template, TimeKind, TimeLog,
} from '../domain/types'
import { lifeDb as db } from './db'

export const uid = () => crypto.randomUUID()
const KV_SETTINGS = 'settings'
export const KV = { appVersion: 'appVersion', lastLifeBackupAt: 'lastLifeBackupAt', notifyAsked: 'notifyAsked' } as const

// ---------- settings / kv ----------

export async function getSettings(): Promise<LifeSettings> {
  return mergeSettings((await db.kv.get(KV_SETTINGS))?.value as Partial<LifeSettings> | undefined)
}

export async function saveSettings(patch: Partial<LifeSettings>): Promise<LifeSettings> {
  const next = mergeSettings({ ...(await getSettings()), ...patch })
  await db.kv.put({ key: KV_SETTINGS, value: next })
  return next
}

export async function getKV<T>(key: string): Promise<T | undefined> {
  return (await db.kv.get(key))?.value as T | undefined
}
export async function setKV(key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value })
}

// ---------- task events ----------

function event(taskId: ID, type: TaskEventType, x: Partial<TaskEvent> = {}, now = Date.now()): TaskEvent {
  return { id: uid(), taskId, at: now, type, ...x }
}

export async function taskEvents(taskId: ID): Promise<TaskEvent[]> {
  return (await db.events.where('taskId').equals(taskId).toArray()).sort((a, b) => b.at - a.at)
}

export async function addComment(taskId: ID, text: string, now = Date.now()): Promise<void> {
  if (!text.trim()) return
  await db.events.add(event(taskId, 'comment', { text: text.trim() }, now))
}

// ---------- tasks ----------

export async function createTask(f: Partial<Task> & Pick<Task, 'title'>, now = Date.now()): Promise<Task> {
  const t = newTask(uid(), now, { ...f, title: f.title.trim() })
  await db.transaction('rw', db.tasks, db.events, async () => {
    await db.tasks.add(t)
    await db.events.add(event(t.id, 'created', {}, now))
  })
  return t
}

/** Fields whose changes are recorded in the task's history. */
const TRACKED: (keyof Task)[] = ['title', 'status', 'importance', 'priorityOverride', 'dueAt', 'startDate', 'estimateMin', 'progress', 'projectId', 'milestoneId', 'goalId', 'pinned', 'dependsOn', 'category', 'confidence', 'energy']

/** Applies status side effects: done ↔ completedAt/progress. */
function withStatusRules(before: Task, next: Task, now: number): Task {
  if (next.status === 'done' && before.status !== 'done') { next.completedAt = now; next.progress = 100; delete next.pinned }
  if (next.status !== 'done' && before.status === 'done') { delete next.completedAt; if (next.progress === 100) next.progress = 90 }
  if (next.progress >= 100 && next.status !== 'done' && next.status !== 'cancelled' && before.progress < 100) { next.status = 'done'; next.completedAt = now }
  return next
}

export async function updateTask(id: ID, patch: Partial<Task>, opt: { reason?: string; now?: number } = {}): Promise<Task> {
  const now = opt.now ?? Date.now()
  return db.transaction('rw', db.tasks, db.events, async () => {
    const before = await db.tasks.get(id)
    if (!before) throw new Error('المهمة غير موجودة')
    const next = withStatusRules(before, { ...before, ...patch, updatedAt: now }, now)
    for (const k of Object.keys(patch) as (keyof Task)[]) if (patch[k] === undefined) delete next[k]
    const evs: TaskEvent[] = []
    const statusChanged = before.status !== next.status
    for (const k of TRACKED) {
      if (JSON.stringify(before[k]) === JSON.stringify(next[k])) continue
      // Progress jumps implied by a status change aren't separate history entries.
      if (k === 'progress' && statusChanged) continue
      let type: TaskEventType = k === 'status' ? 'status' : k === 'pinned' ? 'rescheduled' : 'updated'
      if (k === 'dueAt' && before.dueAt !== undefined && next.dueAt !== undefined && next.dueAt > before.dueAt) {
        type = 'postponed'
        next.postponeCount = before.postponeCount + 1
      }
      evs.push(event(id, type, { field: k, from: before[k], to: next[k], reason: opt.reason }, now))
    }
    await db.tasks.put(next)
    if (evs.length) await db.events.bulkAdd(evs)
    return next
  })
}

/** Moves a task to a later day/time and records why (feeds the postponement analysis). */
export async function postponeTask(id: ID, toDay: DayKey, reason: string, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.tasks, db.events, async () => {
    const t = await db.tasks.get(id)
    if (!t) return
    const next: Task = { ...t, startDate: toDay, postponeCount: t.postponeCount + 1, updatedAt: now }
    delete next.pinned
    if (t.dueAt !== undefined && t.dueAt < at(toDay, 23 * 60 + 59)) next.dueAt = at(toDay, 23 * 60 + 59)
    await db.tasks.put(next)
    await db.events.add(event(id, 'postponed', { field: 'startDate', from: t.startDate, to: toDay, reason: reason || undefined }, now))
  })
}

export async function setStatus(id: ID, status: TaskStatus, reason?: string): Promise<void> {
  await updateTask(id, { status }, { reason })
}

export async function bulkUpdate(ids: ID[], patch: Partial<Task>, reason?: string): Promise<void> {
  for (const id of ids) await updateTask(id, patch, { reason })
}

export async function deleteTasks(ids: ID[], now = Date.now()): Promise<void> {
  await db.transaction('rw', db.tasks, db.events, async () => {
    for (const id of ids) {
      await db.tasks.update(id, { deletedAt: now, updatedAt: now })
      await db.events.add(event(id, 'deleted', {}, now))
    }
  })
}

export async function restoreTask(id: ID, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.tasks, db.events, async () => {
    const t = await db.tasks.get(id)
    if (!t) return
    const next = { ...t, updatedAt: now }
    delete next.deletedAt
    await db.tasks.put(next)
    await db.events.add(event(id, 'restored', {}, now))
  })
}

export async function duplicateTask(id: ID, now = Date.now()): Promise<Task | undefined> {
  const t = await db.tasks.get(id)
  if (!t) return undefined
  const { id: _i, createdAt: _c, updatedAt: _u, completedAt: _d, deletedAt: _x, seriesId: _s, occurrence: _o, ...rest } = t
  return createTask({ ...rest, title: `${t.title} (نسخة)`, status: 'new', progress: 0, actualMin: 0, postponeCount: 0, checklist: t.checklist.map((c) => ({ ...c, id: uid(), done: false })) }, now)
}

/** Creates instances of recurring series for the next `days` days (idempotent). */
export async function materializeRecurring(now = Date.now(), days = 7): Promise<number> {
  const from = dayKey(now)
  return db.transaction('rw', db.tasks, db.events, async () => {
    const all = await db.tasks.toArray()
    const series = all.filter((t) => t.recurrence && !t.deletedAt)
    let created = 0
    for (const s of series) {
      for (const day of pendingOccurrences(s, all, from, days)) {
        const { id: _i, recurrence: _r, createdAt: _c, updatedAt: _u, startDate: _sd, dueAt, ...rest } = s
        const due = dueAt !== undefined ? new Date(dueAt) : undefined
        const t = newTask(uid(), now, {
          ...rest, seriesId: s.id, occurrence: day, startDate: day, status: 'new', progress: 0, actualMin: 0, postponeCount: 0,
          dueAt: due ? at(day, due.getHours() * 60 + due.getMinutes()) : at(day, 23 * 60 + 59),
          checklist: s.checklist.map((c) => ({ ...c, id: uid(), done: false })),
        })
        await db.tasks.add(t)
        await db.events.add(event(t.id, 'created', { text: 'من مهمة متكررة' }, now))
        created++
      }
    }
    return created
  })
}

// ---------- time tracking ----------

export async function runningLog(): Promise<TimeLog | undefined> {
  return (await db.logs.toArray()).find((l) => l.end === undefined)
}

async function closeLog(l: TimeLog, now: number): Promise<void> {
  await db.logs.update(l.id, { end: Math.max(l.start, now) })
  if (l.taskId) await recomputeActual(l.taskId)
}

async function recomputeActual(taskId: ID): Promise<void> {
  const logs = await db.logs.where('taskId').equals(taskId).toArray()
  const min = Math.round(logs.filter((l) => l.end).reduce((a, l) => a + (l.end! - l.start) / 60_000, 0))
  await db.tasks.update(taskId, { actualMin: min })
}

const KIND_OF: Record<Task['energy'], TimeKind> = { deep: 'deep', routine: 'routine', study: 'study', light: 'other' }

/** Starts (or switches) the single running timer. */
export async function startTimer(taskId: ID | undefined, opt: { kind?: TimeKind; focusId?: ID; now?: number } = {}): Promise<TimeLog> {
  const now = opt.now ?? Date.now()
  return db.transaction('rw', db.logs, db.tasks, db.events, async () => {
    const running = await runningLog()
    if (running) await closeLog(running, now)
    const t = taskId ? await db.tasks.get(taskId) : undefined
    const log: TimeLog = { id: uid(), taskId, projectId: t?.projectId, kind: opt.kind ?? (t ? KIND_OF[t.energy] : 'other'), start: now, focusId: opt.focusId, interruptions: 0 }
    await db.logs.add(log)
    if (t && t.status !== 'in_progress') await updateTask(t.id, { status: 'in_progress' }, { now })
    return log
  })
}

export async function pauseTimer(now = Date.now()): Promise<void> {
  await db.transaction('rw', db.logs, db.tasks, db.events, async () => {
    const running = await runningLog()
    if (!running) return
    await closeLog(running, now)
    if (running.taskId) {
      const t = await db.tasks.get(running.taskId)
      if (t && t.status === 'in_progress') await updateTask(t.id, { status: 'paused' }, { now })
    }
  })
}

export async function stopTimer(now = Date.now()): Promise<void> {
  await db.transaction('rw', db.logs, db.tasks, async () => {
    const running = await runningLog()
    if (running) await closeLog(running, now)
  })
}

export async function finishTask(taskId: ID, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.logs, db.tasks, db.events, async () => {
    const running = await runningLog()
    if (running?.taskId === taskId) await closeLog(running, now)
    await updateTask(taskId, { status: 'done' }, { now })
  })
}

export async function addInterruption(): Promise<void> {
  const l = await runningLog()
  if (l) await db.logs.update(l.id, { interruptions: l.interruptions + 1 })
}

export async function addManualLog(taskId: ID | undefined, start: number, minutes: number, kind: TimeKind, note?: string): Promise<void> {
  const t = taskId ? await db.tasks.get(taskId) : undefined
  await db.logs.add({ id: uid(), taskId, projectId: t?.projectId, kind, start, end: start + minutes * 60_000, interruptions: 0, note })
  if (taskId) await recomputeActual(taskId)
}

export async function deleteLog(id: ID): Promise<void> {
  const l = await db.logs.get(id)
  await db.logs.delete(id)
  if (l?.taskId) await recomputeActual(l.taskId)
}

// ---------- projects / milestones / goals ----------

export async function createProject(f: Partial<Project> & Pick<Project, 'name'>, now = Date.now()): Promise<Project> {
  const p = newProject(uid(), now, f, await db.projects.count())
  await db.projects.add(p)
  return p
}

export async function updateProject(id: ID, patch: Partial<Project>, now = Date.now()): Promise<void> {
  const next = { ...patch, updatedAt: now }
  if (patch.status === 'archived') next.archivedAt = now
  await db.projects.update(id, next)
}

export async function deleteProject(id: ID, now = Date.now()): Promise<void> {
  await db.projects.update(id, { deletedAt: now, updatedAt: now })
}

export async function restoreProject(id: ID): Promise<void> {
  const p = await db.projects.get(id)
  if (!p) return
  delete p.deletedAt
  await db.projects.put(p)
}

export async function createMilestone(f: Partial<Milestone> & Pick<Milestone, 'title'>, now = Date.now()): Promise<Milestone> {
  const siblings = await db.milestones.filter((m) => m.projectId === f.projectId && m.goalId === f.goalId).count()
  const m = newMilestone(uid(), now, { order: siblings, ...f })
  await db.milestones.add(m)
  return m
}

export async function updateMilestone(id: ID, patch: Partial<Milestone>): Promise<void> {
  await db.milestones.update(id, patch)
}

export async function deleteMilestone(id: ID): Promise<void> {
  await db.transaction('rw', db.milestones, db.tasks, async () => {
    await db.milestones.delete(id)
    const ts = await db.tasks.where('milestoneId').equals(id).toArray()
    for (const t of ts) { delete t.milestoneId; await db.tasks.put(t) }
  })
}

export async function createGoal(f: Partial<Goal> & Pick<Goal, 'title'>, now = Date.now()): Promise<Goal> {
  const g = newGoal(uid(), now, f)
  await db.goals.add(g)
  return g
}

/** Changes to the target, metric or status always record a reason. */
export async function updateGoal(id: ID, patch: Partial<Goal>, reason?: string, now = Date.now()): Promise<void> {
  const g = await db.goals.get(id)
  if (!g) return
  const changes = [...g.changes]
  for (const k of ['targetDate', 'metric', 'status', 'successCriteria', 'outcome', 'startDate'] as const) {
    if (patch[k] !== undefined && JSON.stringify(patch[k]) !== JSON.stringify(g[k]))
      changes.push({ at: now, field: k, from: g[k], to: patch[k], reason: reason?.trim() || 'بدون سبب مسجل' })
  }
  await db.goals.put({ ...g, ...patch, changes, updatedAt: now })
}

export async function deleteGoal(id: ID, now = Date.now()): Promise<void> {
  await db.goals.update(id, { deletedAt: now })
}

export async function restoreGoal(id: ID): Promise<void> {
  const g = await db.goals.get(id)
  if (!g) return
  delete g.deletedAt
  await db.goals.put(g)
}

// ---------- commitments ----------

export async function saveCommitment(c: Partial<Commitment> & Pick<Commitment, 'title' | 'startMin' | 'endMin'>, now = Date.now()): Promise<Commitment> {
  if (c.endMin <= c.startMin) throw new Error('وقت النهاية لازم يكون بعد البداية')
  const rec = c.id ? { ...(await db.commitments.get(c.id))!, ...c } as Commitment : newCommitment(uid(), now, c)
  await db.commitments.put(rec)
  return rec
}

export async function deleteCommitment(id: ID, now = Date.now()): Promise<void> {
  await db.commitments.update(id, { deletedAt: now })
}

export async function toggleCommitmentSkip(id: ID, day: DayKey): Promise<void> {
  const c = await db.commitments.get(id)
  if (!c) return
  const skipDays = c.skipDays.includes(day) ? c.skipDays.filter((d) => d !== day) : [...c.skipDays, day]
  await db.commitments.update(id, { skipDays })
}

// ---------- habits / day logs ----------

export async function createHabit(f: Partial<Habit> & Pick<Habit, 'title'>, now = Date.now()): Promise<Habit> {
  const h = newHabit(uid(), now, f)
  await db.habits.add(h)
  return h
}

export async function updateHabit(id: ID, patch: Partial<Habit>): Promise<void> {
  await db.habits.update(id, patch)
}

/** Cycles none → done → skipped → none, or sets an explicit mark. */
export async function markHabit(habitId: ID, day: DayKey, mark?: HabitMark | null): Promise<void> {
  await db.transaction('rw', db.habitLogs, async () => {
    const cur = await db.habitLogs.where('[habitId+day]').equals([habitId, day]).first()
    const next = mark === undefined ? (!cur ? 'done' : cur.mark === 'done' ? 'skipped' : null) : mark
    if (cur) await db.habitLogs.delete(cur.id)
    if (next) await db.habitLogs.add({ id: uid(), habitId, day, mark: next })
  })
}

export async function saveDayLog(day: DayKey, patch: Partial<DayLog>): Promise<void> {
  const cur = (await db.dayLogs.get(day)) ?? { day }
  await db.dayLogs.put({ ...cur, ...patch, day })
}

// ---------- notes ----------

export async function saveNote(n: Partial<Note> & Pick<Note, 'title'>, now = Date.now()): Promise<Note> {
  const rec = n.id ? { ...(await db.notes.get(n.id))!, ...n, updatedAt: now } as Note : newNote(uid(), now, n)
  await db.notes.put(rec)
  return rec
}

export async function deleteNote(id: ID, now = Date.now()): Promise<void> {
  await db.notes.update(id, { deletedAt: now })
}

export async function restoreNote(id: ID): Promise<void> {
  const n = await db.notes.get(id)
  if (!n) return
  delete n.deletedAt
  await db.notes.put(n)
}

// ---------- plans ----------

/** Approves blocks per day as a new revision; earlier revisions stay for history. */
export async function approvePlan(blocks: PlanBlock[], days: DayKey[], reason?: string, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.plans, db.tasks, db.events, async () => {
    for (const day of days) {
      const prev = await db.plans.where('[day+current]').equals([day, 1]).first()
      if (prev) await db.plans.update(prev.id, { current: 0 })
      await db.plans.add({ id: uid(), day, revision: (prev?.revision ?? 0) + 1, approvedAt: now, blocks: blocks.filter((b) => b.day === day), reason, current: 1 })
    }
    const ids = new Set(blocks.filter((b) => b.taskId && days.includes(b.day)).map((b) => b.taskId!))
    for (const id of ids) {
      const t = await db.tasks.get(id)
      if (t?.status === 'new') await updateTask(id, { status: 'planned' }, { now })
    }
  })
}

export async function currentPlans(from: DayKey, to: DayKey): Promise<DayPlan[]> {
  return (await db.plans.where('day').between(from, to, true, false).toArray()).filter((p) => p.current === 1)
}

// ---------- templates ----------

export async function saveTemplate(t: Template): Promise<void> {
  await db.templates.put(t)
}

export async function projectAsTemplate(projectId: ID, name: string, now = Date.now()): Promise<Template> {
  const p = await db.projects.get(projectId)
  if (!p) throw new Error('المشروع غير موجود')
  const ms = (await db.milestones.where('projectId').equals(projectId).toArray()).sort((a, b) => a.order - b.order)
  const ts = (await db.tasks.where('projectId').equals(projectId).toArray()).filter((t) => !t.deletedAt && !t.seriesId)
  const start = p.startDate ?? dayKey(p.createdAt)
  const off = (d?: DayKey) => (d ? Math.max(0, Math.round((at(d, 0) - at(start, 0)) / 86_400_000)) : undefined)
  const payload: ProjectTemplatePayload = {
    name: p.name, description: p.description, category: p.category,
    milestones: ms.map((m) => ({ title: m.title, offsetDays: off(m.dueDate) })),
    tasks: ts.map((t) => ({
      title: t.title, description: t.description, estimateMin: t.estimateMin, importance: t.importance, energy: t.energy, category: t.category,
      checklist: t.checklist.map((c) => c.title), milestone: t.milestoneId ? ms.findIndex((m) => m.id === t.milestoneId) : undefined,
      offsetDays: t.dueAt ? off(dayKey(t.dueAt)) : undefined,
      dependsOn: t.dependsOn.map((d) => ts.findIndex((x) => x.id === d)).filter((i) => i >= 0),
    })),
  }
  const tpl: Template = { id: uid(), kind: 'project', name, payload, createdAt: now }
  await db.templates.add(tpl)
  return tpl
}

export async function instantiateProjectTemplate(templateId: ID, name: string, startDay: DayKey, now = Date.now()): Promise<Project> {
  const tpl = await db.templates.get(templateId)
  if (!tpl || tpl.kind !== 'project') throw new Error('القالب غير موجود')
  const pl = tpl.payload
  const p = await createProject({ name, description: pl.description, category: pl.category, startDate: startDay }, now)
  const msIds: ID[] = []
  for (const [i, m] of pl.milestones.entries()) msIds.push((await createMilestone({ title: m.title, projectId: p.id, order: i, dueDate: m.offsetDays !== undefined ? addDays(startDay, m.offsetDays) : undefined }, now)).id)
  const taskIds: string[] = pl.tasks.map(() => uid())
  await db.transaction('rw', db.tasks, db.events, async () => {
    for (const [i, t] of pl.tasks.entries()) {
      const rec = newTask(taskIds[i]!, now, {
        title: t.title, description: t.description, estimateMin: t.estimateMin, importance: t.importance ?? 3, energy: t.energy ?? 'routine', category: t.category,
        projectId: p.id, milestoneId: t.milestone !== undefined && t.milestone >= 0 ? msIds[t.milestone] : undefined,
        dueAt: t.offsetDays !== undefined ? at(addDays(startDay, t.offsetDays), 23 * 60 + 59) : undefined,
        dependsOn: (t.dependsOn ?? []).map((d) => taskIds[d]).filter((x): x is string => !!x),
        checklist: t.checklist.map((c) => ({ id: uid(), title: c, done: false })),
        confidence: t.estimateMin ? 'firm' : 'rough',
      })
      await db.tasks.add(rec)
      await db.events.add(event(rec.id, 'created', { text: `من قالب: ${tpl.name}` }, now))
    }
  })
  return p
}

export async function taskFromTemplate(templateId: ID, overrides: Partial<Task> = {}, now = Date.now()): Promise<Task> {
  const tpl = await db.templates.get(templateId)
  if (!tpl || tpl.kind !== 'task') throw new Error('القالب غير موجود')
  const x = tpl.payload
  return createTask({
    title: x.title, description: x.description, estimateMin: x.estimateMin, importance: x.importance ?? 3, energy: x.energy ?? 'routine', category: x.category,
    checklist: x.checklist.map((c) => ({ id: uid(), title: c, done: false })), confidence: x.estimateMin ? 'firm' : 'rough', ...overrides,
  }, now)
}

// ---------- attachments ----------

export async function addAttachment(file: File, owner: { taskId?: ID; projectId?: ID }, now = Date.now()): Promise<void> {
  if (file.size > 25 * 1024 * 1024) throw new Error('الملف أكبر من 25 ميجا')
  const a: Attachment = { id: uid(), ...owner, name: file.name, mime: file.type || 'application/octet-stream', size: file.size, blob: file, createdAt: now }
  await db.attachments.add(a)
}

export async function deleteAttachment(id: ID): Promise<void> {
  await db.attachments.delete(id)
}

// ---------- reminders log ----------

export async function logReminder(r: ReminderLogEntry): Promise<void> {
  await db.reminders.put(r)
}

export async function handleReminder(id: string, now = Date.now()): Promise<void> {
  await db.reminders.update(id, { status: 'handled', handledAt: now })
}

// ---------- full data / snapshots / restore ----------

export async function loadAll(now = Date.now()): Promise<LifeData> {
  const [settings, tasks, events, projects, milestones, goals, commitments, logs, habits, habitLogs, dayLogs, notes, plans, templates, reminders, attachments] = await Promise.all([
    getSettings(), db.tasks.toArray(), db.events.toArray(), db.projects.toArray(), db.milestones.toArray(), db.goals.toArray(), db.commitments.toArray(),
    db.logs.toArray(), db.habits.toArray(), db.habitLogs.toArray(), db.dayLogs.toArray(), db.notes.toArray(), db.plans.toArray(), db.templates.toArray(),
    db.reminders.toArray(), db.attachments.toArray(),
  ])
  const meta: AttachmentMeta[] = attachments.map(({ blob: _b, ...a }) => ({ ...a, file: `life-media/${a.id}` }))
  return { schema: LIFE_SCHEMA, exportedAt: now, settings, tasks, events, projects, milestones, goals, commitments, logs, habits, habitLogs, dayLogs, notes, plans, templates, reminders, attachments: meta }
}

const DATA_TABLES = () => [db.tasks, db.events, db.projects, db.milestones, db.goals, db.commitments, db.logs, db.habits, db.habitLogs, db.dayLogs, db.notes, db.plans, db.templates, db.reminders]

/** Replaces all Life OS data. Attachments are replaced only when `blobs` is given. */
export async function replaceAll(raw: unknown, blobs?: Map<string, Blob>): Promise<LifeData> {
  const d = validateLifeData(raw)
  const atts: Attachment[] | undefined = blobs && d.attachments.map(({ file, ...a }) => {
    const blob = blobs.get(file)
    if (!blob) throw new Error(`مرفق ناقص في النسخة: ${a.name}`)
    return { ...a, blob }
  })
  const tables = [...DATA_TABLES(), db.kv, ...(atts ? [db.attachments] : [])]
  await db.transaction('rw', tables, async () => {
    for (const t of DATA_TABLES()) await t.clear()
    for (const name of LIFE_TABLES) {
      if (name === 'attachments') continue
      const rows = d[name] as unknown[]
      if (rows.length) await (db[name] as unknown as { bulkAdd: (r: unknown[]) => Promise<unknown> }).bulkAdd(rows)
    }
    await db.kv.put({ key: KV_SETTINGS, value: d.settings })
    if (atts) { await db.attachments.clear(); if (atts.length) await db.attachments.bulkAdd(atts) }
  })
  return d
}

export async function createSnapshot(reason: string, appVersion: string, now = Date.now()): Promise<Snapshot> {
  const data = await loadAll(now)
  const snap: Snapshot = { id: uid(), createdAt: now, reason, appVersion, json: JSON.stringify(data) }
  await db.snapshots.add(snap)
  const all = await db.snapshots.orderBy('createdAt').toArray()
  if (all.length > 12) await db.snapshots.bulkDelete(all.slice(0, all.length - 12).map((s) => s.id))
  return snap
}

export async function restoreSnapshot(id: ID, appVersion: string): Promise<void> {
  const s = await db.snapshots.get(id)
  if (!s) throw new Error('النسخة غير موجودة')
  await createSnapshot('قبل الرجوع لنسخة سابقة', appVersion)
  await replaceAll(JSON.parse(s.json))
}

/** Auto-snapshot when the installed app version changes (upgrade safety net). */
export async function snapshotOnUpgrade(appVersion: string): Promise<boolean> {
  const prev = await getKV<string>(KV.appVersion)
  if (prev === appVersion) return false
  const hasData = (await db.tasks.count()) + (await db.projects.count()) + (await db.goals.count()) > 0
  if (prev && hasData) await createSnapshot(`تلقائي قبل الترقية من ${prev} إلى ${appVersion}`, prev)
  await setKV(KV.appVersion, appVersion)
  return !!prev && hasData
}

/** Applies a previewed plan file after a safety snapshot. */
export async function applyPlanChanges(changes: PlanChange[], title: string, appVersion: string, now = Date.now()): Promise<void> {
  await createSnapshot(`قبل استيراد خطة: ${title}`, appVersion, now)
  await db.transaction('rw', [db.tasks, db.events, db.projects, db.milestones, db.goals, db.commitments, db.habits, db.notes, db.kv], async () => {
    for (const ch of changes) {
      switch (ch.entity) {
        case 'project': await db.projects.put(ch.record); break
        case 'goal': await db.goals.put(ch.record); break
        case 'milestone': if (ch.action === 'delete') await db.milestones.delete(ch.id); else await db.milestones.put(ch.record); break
        case 'commitment': await db.commitments.put(ch.record); break
        case 'habit': await db.habits.put(ch.record); break
        case 'note': await db.notes.put(ch.record); break
        case 'settings': await db.kv.put({ key: KV_SETTINGS, value: ch.record }); break
        case 'task':
          await db.tasks.put(ch.record)
          await db.events.add(event(ch.id, ch.action === 'delete' ? 'deleted' : 'imported', { text: `${ch.action === 'create' ? 'أُنشئت' : ch.action === 'delete' ? 'حُذفت' : 'عُدّلت'} من خطة: ${title}`, to: ch.fields.map((f) => f.field) }, now))
          break
      }
    }
  })
}

/** Removes trashed records older than `days`. */
export async function purgeTrash(days = 30, now = Date.now()): Promise<number> {
  const cutoff = now - days * 86_400_000
  let n = 0
  await db.transaction('rw', [db.tasks, db.projects, db.notes, db.goals, db.commitments, db.events], async () => {
    const old = (await db.tasks.toArray()).filter((t) => t.deletedAt && t.deletedAt < cutoff)
    await db.tasks.bulkDelete(old.map((t) => t.id))
    for (const t of old) await db.events.where('taskId').equals(t.id).delete()
    n += old.length
    for (const table of [db.projects, db.notes, db.goals, db.commitments] as const) {
      const xs = (await (table as typeof db.notes).toArray()).filter((r) => r.deletedAt && r.deletedAt < cutoff)
      await (table as typeof db.notes).bulkDelete(xs.map((r) => r.id))
      n += xs.length
    }
  })
  return n
}
