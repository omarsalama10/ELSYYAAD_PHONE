import { dayKey, addDays } from './time'
import type { Commitment, Goal, Habit, Milestone, Note, Project, Task } from './types'

/** Record constructors with complete defaults, shared by the UI, repo and plan importer. */

export const PROJECT_COLORS = ['#1f8f76', '#e2654f', '#3b6fd8', '#c47812', '#8a4fd8', '#d64593', '#2a9bb5', '#5b7a2e']

export function newTask(id: string, now: number, f: Partial<Task> & Pick<Task, 'title'>): Task {
  return {
    links: [], tags: [], importance: 3, status: 'new', progress: 0, confidence: 'rough', energy: 'routine',
    dependsOn: [], checklist: [], postponeCount: 0, actualMin: 0,
    ...f, id, createdAt: now, updatedAt: now,
  }
}

export function newProject(id: string, now: number, f: Partial<Project> & Pick<Project, 'name'>, colorIndex = 0): Project {
  return {
    status: 'active', color: PROJECT_COLORS[colorIndex % PROJECT_COLORS.length]!, weighting: 'equal', startDate: dayKey(now),
    ...f, id, createdAt: now, updatedAt: now,
  }
}

export function newGoal(id: string, now: number, f: Partial<Goal> & Pick<Goal, 'title'>): Goal {
  const start = dayKey(now)
  return {
    outcome: '', successCriteria: '', kind: 'personal', horizon: 'monthly', startDate: start, targetDate: addDays(start, 30),
    metric: { type: 'tasks' }, status: 'active', changes: [],
    ...f, id, createdAt: now, updatedAt: now,
  }
}

export function newMilestone(id: string, now: number, f: Partial<Milestone> & Pick<Milestone, 'title'>): Milestone {
  return { order: 0, status: 'open', dependsOn: [], ...f, id, createdAt: now }
}

export function newCommitment(id: string, now: number, f: Partial<Commitment> & Pick<Commitment, 'title' | 'startMin' | 'endMin'>): Commitment {
  return { kind: 'other', repeat: { type: 'weekly', weekdays: [0, 1, 2, 3, 4] }, skipDays: [], ...f, id, createdAt: now }
}

export function newHabit(id: string, now: number, f: Partial<Habit> & Pick<Habit, 'title'>): Habit {
  return { schedule: { type: 'daily' }, archived: false, order: now, ...f, id, createdAt: now }
}

export function newNote(id: string, now: number, f: Partial<Note> & Pick<Note, 'title'>): Note {
  const risky = f.kind === 'risk' || f.kind === 'issue'
  return { kind: 'note', body: '', tags: [], ...(risky ? { open: true, severity: 2 as const } : {}), ...f, id, createdAt: now, updatedAt: now }
}
