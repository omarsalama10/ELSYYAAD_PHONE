# ELSYYAAD Life OS — Architecture

Personal life operating system. iPhone PWA, Arabic/RTL, offline-first, no server.
Version 2.0.0 (the gym tracker from 1.x lives on as the health module).

## 1. Layers

| Layer | Where | Responsibility |
|---|---|---|
| 1. Data | `src/life/domain/types.ts`, `src/life/db/` | Tasks, projects, milestones, goals, commitments, habits, time logs, notes/decisions, plans, templates, attachments, snapshots — all editable |
| 2. Planning engine | `src/life/domain/scheduler.ts`, `priority.ts` | Capacity, priority, dependency-aware scheduling, deadline risk, overload, what-if |
| 3. Execution tracking | `src/life/db/repo.ts` (timers, status), `progress.ts` | Started/finished/late, actual time per task, project & goal progress |
| 4. Accountability | `domain/reminders.ts`, `lib/reminderEngine.tsx`, `domain/ics.ts` | Reminders by level, follow-ups, inbox, calendar export |
| 5. Evolution | `domain/planFile.ts`, `domain/report.ts`, snapshots | Claude works from exported state and returns validated plan files; upgrades are snapshot-protected |

`src/life/domain/` is pure TypeScript: no DOM, no Dexie, no clock reads (time is a parameter).
Everything there is unit-tested and deterministic.

```
src/life/
  domain/      pure logic (types, time, recurrence, priority, scheduler, progress, habits,
               analytics, reminders, planFile, report, ics, text, factory, data)
  db/          Dexie database "elsyyaad-life" + repository (the only writer)
  state.tsx    LifeProvider: live data + clock + derived plan, shared by all screens
  lib/         runtime services (reminder engine)
  ui/          shared components (kit, timeline, task rows, quick add, plan actions)
  screens/     one file per screen
```

The gym tracker keeps its own database (`gym-tracker`) and code in `src/screens`, `src/db`, `src/domain`.
Both databases travel in the same zip backup.

## 2. Data model (summary)

- **Task**: title, description, notes, links, project/milestone/goal, category, tags, importance 1–5,
  optional manual priority (0–100), status (new / planned / in_progress / paused / done / cancelled),
  progress %, start date, deadline, estimate + confidence (firm/rough), energy (deep/routine/study/light),
  max session, weight, dependencies, checklist, recurrence, pinned slot, top-3 star, postpone count,
  actual minutes (from time logs), soft-delete timestamp.
- **TaskEvent**: full history (created, field changes, status, postponed + reason, rescheduled, comments, import).
- **Recurring tasks**: the series is a template; concrete instances (`seriesId` + `occurrence`) are
  materialized for the next 7 days on launch and whenever a series is created/edited/imported.
- **Commitment**: fixed block (work, class, appointment, gym…), weekly/daily/once, validity window,
  per-occurrence skips. The planner never moves these.
- **DayPlan**: an approved plan for a day. New approvals create a new revision; history is kept
  (feeds the schedule-stability metric and plan-vs-actual).
- **TimeLog**: one contiguous work segment. Pause closes a segment; resume opens a new one.
- **Goal** with metric (`tasks` | `numeric` | `milestones`) and a change log; every change to target,
  metric, status or criteria records a reason.
- **Note**: idea / note / decision / risk / issue, linkable to project, goal, task or date.

## 3. Planning engine

Deterministic: same input → same plan. Steps (`plan()`):

1. **Capacity per day**: window `dayStartMin…dayEndMin` (today starts at "now", rounded up to 5 min)
   minus commitment occurrences and pinned tasks = free time. Rest days have no free time.
2. **Contingency**: `bufferPct` of free time is never filled → daily budget.
3. **Priority** (`priorityScores`), weighted mean of normalized factors, 0–100:
   - importance `(importance − 1) / 4`
   - urgency: 1 if overdue, else `1 − slack/14` where slack = days left − days of work left
     (at `maxDeepMinPerDay`/day); 0.1 with no deadline
   - blocking: open tasks waiting on this one (transitive), capped at 5
   - delay: postpone count, capped at 5
   - manual override replaces the score (factors still shown)
4. **Placement**: repeatedly take the highest-priority task whose dependencies are closed or already
   placed; fill the earliest free slots after `max(now, startDate, dependency finish)`, split into
   sessions ≤ `maxSessionMin` (default `defaultSessionMin`), at least `minChunkMin`, `gapMin` between
   blocks, deep-work capped per day.
5. **Remaining work** = estimate × (1 − progress) × `roughFactor` for rough/missing estimates.
6. **Outputs**: blocks, per-day capacity, unscheduled tasks with a reason (no capacity / dependency
   unscheduled / starts after horizon), deadline risks (late / tight < 4h / unscheduled),
   overload (first day where work due by then exceeds cumulative budget), projected finish per task.

**Re-planning** never applies itself: the review sheet shows a task-level diff (`diffPlans`:
added / removed / moved / resized) plus risks, and only "approve" writes a new revision.
Dragging a block (handle ✥, 15-min snap) pins the task and rewrites the affected approved days.

**What-if** (`whatIf`) runs the planner twice and compares finish times and risks for:
lost time, cancelling one commitment occurrence, reserving N hours for a project,
changing an estimate, or blocking a time range. Nothing is saved unless you apply
(only "cancel this occurrence" has a one-tap apply).

## 4. Metrics (all in `domain/analytics.ts`)

Every metric returns value, numerator, denominator, definition and basis (measured / estimated /
self-reported). An empty denominator returns `null`, shown as "—".

| Metric | Definition |
|---|---|
| Execution rate | done ÷ tasks whose deadline fell in the period (cancelled excluded) |
| Deadline reliability | done before deadline ÷ tasks whose deadline fell in the period |
| Estimation accuracy | 1 − median(\|actual − estimate\| ÷ estimate), tasks with timer data; bias = median(actual ÷ estimate) |
| Velocity | completed tasks per week |
| Schedule stability | planned tasks never moved/postponed ÷ tasks in approved plans |
| Workload balance | planned minutes ÷ available minutes (window − commitments), approved days only — *estimated* |

Plus: time by project/category/session kind, hour-of-day profile, plan vs actual, postpone reasons,
self-reported low-output reasons, energy average (self-reported), overruns.

## 5. Habits

"Never miss twice": one missed scheduled day pauses a streak, two consecutive misses reset it.
Excused days (rest, travel) are neutral. Today never breaks a streak until marked.
`timesPerWeek` habits count streaks in weeks.

## 6. Offline matrix

| Capability | Offline |
|---|---|
| View/edit everything, plan, re-plan, what-if, timers, analytics | Yes (IndexedDB + local engine) |
| Reminders while the app is open or briefly backgrounded | Yes (service-worker notification if permitted, otherwise in-app) |
| Reminders while the app is closed | Not possible for iOS PWAs without a push server. Missed follow-ups appear in the inbox on next open. **Use "📅 للتقويم" (ICS with alarms) for guaranteed alerts.** |
| Claude planning | Outside the app (needs internet); the app exports state and imports plan files offline |
| Web Push / sync / app updates | Need network (push and sync are not implemented) |

## 7. How changes are made (three kinds)

1. **Settings & rules** — Settings → "التخطيط والتذكير": day window, rest days, buffer, session
   sizes, deep-work cap, rough factor, priority weights, accountability level, quiet hours, reminder
   kinds, muted categories, focus durations. No code change. Plan files may also patch settings.
2. **Plans & data** — plan files (`docs/lifeos/PLAN_FILE.md`) produced by Claude from the exported
   state. Full validation, field-level preview, per-change opt-out, automatic snapshot before apply,
   one-tap rollback. Deletes go to the trash; nothing is hard-deleted.
3. **New features** — code changes in this repo, tested (`npm run check`) and deployed. Editing code
   locally does not update the installed PWA until a new build is deployed; the app checks for updates
   on foreground and hourly.

### Upgrade safety rules

- The first launch of a new version takes an automatic snapshot (`snapshotOnUpgrade`).
- Schema changes are new Dexie versions with additive upgrades only; never reseed personal data.
- Backups are validated completely before anything is replaced.
- Snapshots (last 12) can be restored from "Claude والبيانات"; restoring snapshots the current state first.
- Keep tests green: unit (Vitest) for domain + repository, Playwright for flows.

## 8. Not implemented (deliberately or pending)

- Web Push from a server, multi-device sync, encrypted cloud backup.
- Calendar *import* and Google/Apple Calendar two-way sync (export via ICS works).
- iOS Shortcuts integration.
- In-app AI chat (by design: planning with Claude happens outside the app).
- Reordering checklist/milestones by drag (buttons are provided); timeline drag-and-drop works.
- Editing a recurring series does not rewrite already-materialized instances.
