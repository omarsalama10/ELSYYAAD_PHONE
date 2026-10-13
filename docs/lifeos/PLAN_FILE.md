# Plan files and state export

How Claude (outside the app) reads your real state and proposes changes that the app can
validate, preview and apply safely.

## Flow

1. App → **المزيد ← Claude والبيانات ← "انسخ البرومبت + الحالة"**. This copies a Markdown
   briefing of the current state (projects, goals, open tasks with priority/estimates/deadlines,
   commitments, risks, decisions, metrics) plus the plan-file format below. Paste it into Claude
   and write what you want at the end.
   - "الحالة JSON" exports `elsyyaad.lifeos.state/v1` with every id, if Claude needs exact references.
2. Claude replies with one JSON plan file.
3. Paste it (or pick the file) → **راجع التغييرات**. The app validates everything and lists each
   create/update/delete with field-level diffs. Untick anything you don't want.
4. **طبّق** → automatic snapshot, then the changes are applied in one transaction. Roll back any
   time from the snapshots list.

## Format — `elsyyaad.lifeos.plan/v1`

All keys are optional except `schema`.

- New records use `ref` (a temporary name) and no `id`.
- Existing records use `id` from the state export; send only the fields that change.
- `"delete": true` with an `id` (or an exact current name) moves the record to the trash
  (milestones are removed, habits archived).
- References (`project`, `milestone`, `goal`, `parent`, `task`, `dependsOn`) accept a `ref` from the
  same file, an existing `id`, or the exact current name (ambiguous names are rejected).
- Dates `YYYY-MM-DD`, times `HH:mm`, task `due` is `YYYY-MM-DD` (end of day) or `YYYY-MM-DDTHH:mm`.
  Use `null` to clear `due`, `pinned`, `recurrence` or `priorityOverride`.
- Weekdays: 0 Sunday … 6 Saturday.
- An `estimateMin` is treated as firm unless `"confidence": "rough"` is given.
- Goal changes to `targetDate`, `metric`, `status`, `successCriteria` or `outcome` are logged with
  `reason` (or "imported from plan" if missing).

```json
{
  "schema": "elsyyaad.lifeos.plan/v1",
  "title": "خطة الإصدار الأول",
  "summary": "تقسيم الإصدار لمراحل وتوزيع 20 ساعة على أسبوعين",
  "goals": [
    { "ref": "g1", "title": "إطلاق الإصدار الأول", "successCriteria": "10 مستخدمين بدون أخطاء حرجة",
      "kind": "project", "startDate": "2026-10-12", "targetDate": "2026-11-12", "metric": { "type": "tasks" } }
  ],
  "projects": [{ "ref": "p1", "name": "برنامج المحاسبة", "goal": "g1", "targetDate": "2026-11-05" }],
  "milestones": [{ "ref": "m1", "title": "MVP", "project": "p1", "dueDate": "2026-10-25", "order": 1 }],
  "tasks": [
    { "ref": "t1", "title": "تصميم قاعدة البيانات", "project": "p1", "milestone": "m1",
      "estimateMin": 180, "importance": 5, "energy": "deep", "due": "2026-10-16" },
    { "ref": "t2", "title": "اختبارات التكامل", "project": "p1", "dependsOn": ["t1"],
      "estimateMin": 90, "confidence": "rough", "checklist": ["سيناريو الفواتير", "سيناريو المرتجعات"] },
    { "id": "EXISTING-TASK-ID", "importance": 2, "due": null },
    { "title": "مراجعة أسبوعية", "estimateMin": 30, "recurrence": { "type": "weekly", "weekdays": [5] } }
  ],
  "commitments": [
    { "ref": "c1", "title": "الشغل", "kind": "work", "repeat": { "type": "weekly", "weekdays": [0, 1, 2, 3, 4] },
      "start": "09:00", "end": "17:00" }
  ],
  "habits": [{ "title": "قراءة 20 دقيقة", "schedule": { "type": "daily" } }],
  "notes": [{ "kind": "decision", "title": "SQLite بدل Postgres للإصدار الأول", "body": "أبسط في النشر", "project": "p1" }],
  "settings": { "dayStart": "08:00", "dayEnd": "23:00", "bufferPct": 0.15, "restWeekdays": [5] }
}
```

### Field reference

| Entity | Fields |
|---|---|
| goals | title*, outcome, successCriteria, kind (project/learning/work/habit/personal), horizon (monthly/quarterly/yearly/custom), startDate, targetDate, metric ({type:tasks} / {type:numeric, unit, start, target, current} / {type:milestones}), status (active/paused/achieved/dropped), reason |
| projects | name*, description, status (active/paused/done/archived), color, category, goal, startDate, targetDate, weighting (equal/estimate/custom) |
| milestones | title*, project, goal, parent, dueDate, order, status (open/done), dependsOn |
| tasks | title*, description, notes, links[], tags[], category, project, milestone, goal, importance 1–5, priorityOverride 0–100, status, progress 0–100, startDate, due, estimateMin, confidence (firm/rough), energy (deep/routine/study/light), maxSessionMin, weight, dependsOn[], checklist[] (strings or {title, done}), recurrence ({type:daily, every} / {type:weekly, weekdays} / {type:monthly, day}), pinned ({day, time}) |
| commitments | title*, kind (work/class/appointment/sleep/meal/gym/prayer/other), repeat* ({type:once, day} / {type:weekly, weekdays} / {type:daily}), start*, end*, validFrom, validUntil, skipDays[], remindBeforeMin |
| habits | title*, schedule ({type:daily} / {type:weekly, weekdays} / {type:timesPerWeek, times}), goal, archived |
| notes | title*, kind (note/idea/decision/risk/issue), body, project, goal, task, day, tags[], severity 1–3, open |
| settings | dayStart, dayEnd, quietStart, quietEnd, morningSummary, eveningReview (HH:mm); bufferPct 0–0.5; gapMin; defaultSessionMin; maxDeepMinPerDay; planHorizonDays; remindBeforeMin; accountability (calm/balanced/firm); restWeekdays[] |

`*` required when creating.

### Validation

Rejected with a precise path (e.g. `tasks[2].due: لازم YYYY-MM-DD أو YYYY-MM-DDTHH:mm`):
wrong schema, unknown ids, unknown/ambiguous references, duplicate refs, out-of-range numbers,
bad dates/times, commitments ending before they start, goals ending before they start, and
dependency cycles across existing + incoming tasks. Unknown top-level keys are ignored with a warning.

The implementation is `src/life/domain/planFile.ts`; its tests (`tests/life/planFile.test.ts`) are
the executable spec.
