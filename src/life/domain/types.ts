/**
 * Life OS data model. Everything here is plain JSON (except attachment blobs) so it can be
 * exported, diffed and re-imported deterministically.
 *
 * Time conventions:
 *  - `DayKey` is a local calendar date 'YYYY-MM-DD'.
 *  - Minutes-of-day (`startMin`, `endMin`) are local minutes from midnight (0..1440).
 *  - Absolute instants (`dueAt`, `createdAt`, timer starts…) are epoch milliseconds.
 */

export type ID = string
export type DayKey = string

export type TaskStatus = 'new' | 'planned' | 'in_progress' | 'paused' | 'done' | 'cancelled'
export const OPEN_STATUSES: readonly TaskStatus[] = ['new', 'planned', 'in_progress', 'paused']

/** How heavy the work is; used for daily caps and focus-session classification. */
export type Energy = 'deep' | 'routine' | 'study' | 'light'

/** Firm = known duration; rough = guess, inflated by `roughFactor` when planning. */
export type Confidence = 'firm' | 'rough'

export type Recurrence =
  | { type: 'daily'; every: number }
  | { type: 'weekly'; weekdays: number[] } // 0 = Sunday … 6 = Saturday
  | { type: 'monthly'; day: number } // day of month; clamps to month length

export interface ChecklistItem { id: ID; title: string; done: boolean }

export interface Task {
  id: ID
  title: string
  description?: string
  notes?: string
  links: string[]
  projectId?: ID
  milestoneId?: ID
  goalId?: ID
  category?: string
  tags: string[]
  /** 1 (trivial) … 5 (critical). */
  importance: number
  /** 0..100. When set, replaces the computed priority score. */
  priorityOverride?: number
  status: TaskStatus
  /** 0..100. */
  progress: number
  /** Earliest day the task may be scheduled. */
  startDate?: DayKey
  dueAt?: number
  estimateMin?: number
  confidence: Confidence
  energy: Energy
  /** Planner splits work into sessions no longer than this (falls back to settings). */
  maxSessionMin?: number
  /** Relative weight inside its project when the project uses custom weights. */
  weight?: number
  dependsOn: ID[]
  checklist: ChecklistItem[]
  /** Recurring series template. Instances carry `seriesId` + `occurrence`. */
  recurrence?: Recurrence
  seriesId?: ID
  occurrence?: DayKey
  /** User-pinned slot. The planner treats it like a fixed commitment. */
  pinned?: { day: DayKey; startMin: number }
  /** Allowed time of day for this task (e.g. recording only at home 11:30–15:00). */
  window?: { startMin: number; endMin: number }
  /** Manually starred into "top 3" for that day. */
  topDay?: DayKey
  postponeCount: number
  /** Total minutes from finished time logs (cached for fast lists). */
  actualMin: number
  createdAt: number
  updatedAt: number
  completedAt?: number
  deletedAt?: number
}

export type TaskEventType =
  | 'created' | 'updated' | 'status' | 'postponed' | 'rescheduled' | 'deleted' | 'restored' | 'comment' | 'imported'

export interface TaskEvent {
  id: ID
  taskId: ID
  at: number
  type: TaskEventType
  field?: string
  from?: unknown
  to?: unknown
  reason?: string
  text?: string
}

export type ProjectStatus = 'active' | 'paused' | 'done' | 'archived'
export type ProgressWeighting = 'equal' | 'estimate' | 'custom'

export interface Project {
  id: ID
  name: string
  description?: string
  status: ProjectStatus
  color: string
  category?: string
  goalId?: ID
  startDate?: DayKey
  targetDate?: DayKey
  weighting: ProgressWeighting
  createdAt: number
  updatedAt: number
  archivedAt?: number
  deletedAt?: number
}

export type MilestoneStatus = 'open' | 'done'

export interface Milestone {
  id: ID
  title: string
  projectId?: ID
  goalId?: ID
  /** Sub-milestone support. */
  parentId?: ID
  dueDate?: DayKey
  order: number
  status: MilestoneStatus
  dependsOn: ID[]
  createdAt: number
}

export type GoalKind = 'project' | 'learning' | 'work' | 'habit' | 'personal'
export type GoalHorizon = 'monthly' | 'quarterly' | 'yearly' | 'custom'
export type GoalStatus = 'active' | 'paused' | 'achieved' | 'dropped'

export type GoalMetric =
  /** Progress = weighted progress of linked tasks and projects. */
  | { type: 'tasks' }
  /** e.g. "finish 20 lessons": start 0, target 20, unit 'درس'. */
  | { type: 'numeric'; unit: string; start: number; target: number; current: number }
  /** Progress = share of goal milestones completed. */
  | { type: 'milestones' }

export interface GoalChange { at: number; field: string; from: unknown; to: unknown; reason: string }

export interface Goal {
  id: ID
  title: string
  outcome: string
  successCriteria: string
  kind: GoalKind
  horizon: GoalHorizon
  startDate: DayKey
  targetDate: DayKey
  metric: GoalMetric
  status: GoalStatus
  changes: GoalChange[]
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export type CommitmentKind = 'work' | 'class' | 'appointment' | 'sleep' | 'meal' | 'gym' | 'prayer' | 'other'

export type CommitmentRepeat =
  | { type: 'once'; day: DayKey }
  | { type: 'weekly'; weekdays: number[] }
  | { type: 'daily' }

/** A fixed block the planner never moves (work, lectures, appointments…). */
export interface Commitment {
  id: ID
  title: string
  kind: CommitmentKind
  repeat: CommitmentRepeat
  startMin: number
  endMin: number
  validFrom?: DayKey
  validUntil?: DayKey
  /** Individual occurrences cancelled ("gym cancelled today"). */
  skipDays: DayKey[]
  /** Minutes before start for the reminder; undefined = settings default. */
  remindBeforeMin?: number
  createdAt: number
  deletedAt?: number
}

export type TimeKind = 'deep' | 'routine' | 'study' | 'other'

/** One contiguous work segment. A pause closes the segment; resume opens a new one. */
export interface TimeLog {
  id: ID
  taskId?: ID
  projectId?: ID
  kind: TimeKind
  start: number
  end?: number
  /** Focus (pomodoro) session this segment belongs to. */
  focusId?: ID
  interruptions: number
  note?: string
}

export type HabitSchedule =
  | { type: 'daily' }
  | { type: 'weekly'; weekdays: number[] }
  | { type: 'timesPerWeek'; times: number }

export interface Habit {
  id: ID
  title: string
  schedule: HabitSchedule
  goalId?: ID
  archived: boolean
  createdAt: number
  order: number
}

/** done = performed; skipped = excused (rest day, travel) — never breaks a streak. */
export type HabitMark = 'done' | 'skipped'

export interface HabitLog { id: ID; habitId: ID; day: DayKey; mark: HabitMark }

export type LowOutputReason = 'not_enough_time' | 'bigger_than_expected' | 'commitments_changed' | 'low_energy' | 'interruptions' | 'other'

/** Optional daily self-rating. Subjective by definition — reported as such. */
export interface DayLog {
  day: DayKey
  energy?: number // 1..5
  focus?: number // 1..5
  sleepHours?: number
  lowOutputReason?: LowOutputReason
  note?: string
  restDay?: boolean
}

export type NoteKind = 'note' | 'idea' | 'decision' | 'risk' | 'issue'

export interface Note {
  id: ID
  kind: NoteKind
  title: string
  body: string
  projectId?: ID
  goalId?: ID
  taskId?: ID
  day?: DayKey
  tags: string[]
  /** Risks/issues only. */
  severity?: 1 | 2 | 3
  open?: boolean
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export interface Attachment {
  id: ID
  taskId?: ID
  projectId?: ID
  name: string
  mime: string
  size: number
  blob: Blob
  createdAt: number
}

export type PlanBlockKind = 'task' | 'commitment' | 'pinned'

export interface PlanBlock {
  id: string
  day: DayKey
  startMin: number
  endMin: number
  kind: PlanBlockKind
  title: string
  taskId?: ID
  commitmentId?: ID
  /** 1-based session index when a task is split across several blocks. */
  part?: number
  parts?: number
  confidence?: Confidence
}

/** A plan the user approved for a day. Previous revisions are kept for stability metrics. */
export interface DayPlan {
  id: ID
  day: DayKey
  revision: number
  approvedAt: number
  blocks: PlanBlock[]
  reason?: string
  /** Superseded revisions stay for history. */
  current: 0 | 1
}

export type TemplateKind = 'task' | 'project'

export interface TaskTemplatePayload {
  title: string
  description?: string
  estimateMin?: number
  importance?: number
  energy?: Energy
  category?: string
  checklist: string[]
}

export interface ProjectTemplatePayload {
  name: string
  description?: string
  category?: string
  milestones: { title: string; offsetDays?: number }[]
  /** `milestone` and `dependsOn` are indexes into the arrays of this payload. */
  tasks: (TaskTemplatePayload & { milestone?: number; offsetDays?: number; dependsOn?: number[] })[]
}

export type Template =
  | { id: ID; kind: 'task'; name: string; payload: TaskTemplatePayload; createdAt: number }
  | { id: ID; kind: 'project'; name: string; payload: ProjectTemplatePayload; createdAt: number }

export type AccountabilityLevel = 'calm' | 'balanced' | 'firm'

export type ReminderKind =
  | 'before_start' | 'start' | 'overdue' | 'followup' | 'commitment' | 'morning' | 'evening' | 'overload' | 'deadline'

export interface LifeSettings {
  /** Planner working window (wake → wind-down). */
  dayStartMin: number
  dayEndMin: number
  /** Days with no flexible work at all (0 = Sunday). */
  restWeekdays: number[]
  /** First day of the week for weekly views (6 = Saturday). */
  weekStartsOn: number
  /** How times of day are shown in the app (data stays in minutes). */
  clock: '12h' | '24h'
  /** Share of free time kept empty as contingency, 0..0.5. */
  bufferPct: number
  /** Gap left between consecutive planned task blocks. */
  gapMin: number
  defaultSessionMin: number
  minChunkMin: number
  /** Cap on deep-work minutes per day. */
  maxDeepMinPerDay: number
  /** Optional window (minutes of day) where deep work may be placed, e.g. 11:30–15:00. */
  deepStartMin?: number
  deepEndMin?: number
  /** Rough estimates are multiplied by this when planning. */
  roughFactor: number
  defaultEstimateMin: number
  planHorizonDays: number
  weights: { importance: number; urgency: number; blocking: number; delay: number }
  accountability: AccountabilityLevel
  remindBeforeMin: number
  quietStartMin: number
  quietEndMin: number
  morningSummaryMin: number
  eveningReviewMin: number
  disabledReminderKinds: ReminderKind[]
  /** Categories whose tasks never trigger reminders. */
  mutedCategories: string[]
  snoozeMin: number
  focusWorkMin: number
  focusBreakMin: number
}

export const DEFAULT_SETTINGS: LifeSettings = {
  dayStartMin: 8 * 60,
  dayEndMin: 23 * 60,
  restWeekdays: [],
  weekStartsOn: 6,
  clock: '12h',
  bufferPct: 0.15,
  gapMin: 10,
  defaultSessionMin: 90,
  minChunkMin: 20,
  maxDeepMinPerDay: 300,
  roughFactor: 1.25,
  defaultEstimateMin: 30,
  planHorizonDays: 14,
  weights: { importance: 0.35, urgency: 0.4, blocking: 0.15, delay: 0.1 },
  accountability: 'balanced',
  remindBeforeMin: 10,
  quietStartMin: 23 * 60 + 30,
  quietEndMin: 7 * 60,
  morningSummaryMin: 8 * 60,
  eveningReviewMin: 21 * 60 + 30,
  disabledReminderKinds: [],
  mutedCategories: [],
  snoozeMin: 10,
  focusWorkMin: 50,
  focusBreakMin: 10,
}

export interface ReminderLogEntry {
  /** Deterministic key: kind + subject + scheduled time. */
  id: string
  kind: ReminderKind
  title: string
  body: string
  dueAt: number
  taskId?: ID
  /** shown_system = OS notification via service worker; shown_inapp = toast/inbox only. */
  status: 'pending' | 'shown_system' | 'shown_inapp' | 'missed' | 'snoozed' | 'handled'
  firedAt?: number
  handledAt?: number
}

export interface Snapshot {
  id: ID
  createdAt: number
  reason: string
  appVersion: string
  /** Serialized LifeData (without attachment blobs). */
  json: string
}
