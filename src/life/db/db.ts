import Dexie, { type EntityTable } from 'dexie'
import type {
  Attachment, Commitment, DayLog, DayPlan, Goal, Habit, HabitLog, Milestone, Note, Project, ReminderLogEntry, Snapshot, Task, TaskEvent, Template, TimeLog,
} from '../domain/types'

export interface KV { key: string; value: unknown }

/**
 * Life OS lives in its own IndexedDB database so it can evolve (and be restored)
 * independently from the gym tracker. Schema changes are additive Dexie versions;
 * an automatic snapshot is taken before the first launch of a new app version.
 */
export class LifeDB extends Dexie {
  tasks!: EntityTable<Task, 'id'>
  events!: EntityTable<TaskEvent, 'id'>
  projects!: EntityTable<Project, 'id'>
  milestones!: EntityTable<Milestone, 'id'>
  goals!: EntityTable<Goal, 'id'>
  commitments!: EntityTable<Commitment, 'id'>
  logs!: EntityTable<TimeLog, 'id'>
  habits!: EntityTable<Habit, 'id'>
  habitLogs!: EntityTable<HabitLog, 'id'>
  dayLogs!: EntityTable<DayLog, 'day'>
  notes!: EntityTable<Note, 'id'>
  plans!: EntityTable<DayPlan, 'id'>
  templates!: EntityTable<Template, 'id'>
  reminders!: EntityTable<ReminderLogEntry, 'id'>
  attachments!: EntityTable<Attachment, 'id'>
  snapshots!: EntityTable<Snapshot, 'id'>
  kv!: EntityTable<KV, 'key'>

  constructor(name = 'elsyyaad-life') {
    super(name)
    this.version(1).stores({
      tasks: 'id, projectId, goalId, milestoneId, status, seriesId, dueAt',
      events: 'id, taskId, at',
      projects: 'id, status, goalId',
      milestones: 'id, projectId, goalId',
      goals: 'id',
      commitments: 'id',
      logs: 'id, taskId, start',
      habits: 'id',
      habitLogs: 'id, habitId, day, &[habitId+day]',
      dayLogs: 'day',
      notes: 'id, kind, projectId, goalId, taskId, day',
      plans: 'id, day, [day+current]',
      templates: 'id, kind',
      reminders: 'id, dueAt, status',
      attachments: 'id, taskId, projectId',
      snapshots: 'id, createdAt',
      kv: 'key',
    })
  }
}

export const lifeDb = new LifeDB()
