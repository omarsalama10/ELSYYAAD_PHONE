import { fmtMetric, type Report } from './analytics'
import type { LifeData } from './data'
import { PLAN_SCHEMA } from './planFile'
import { isOpen, remainingMinutes } from './priority'
import { goalProgress, goalStatus, projectBlockers, projectForecast, projectProgress } from './progress'
import { describeRecurrence } from './recurrence'
import type { PlanResult } from './scheduler'
import { dayKey, hhmm } from './time'
import type { Project, Task } from './types'

/**
 * State export for planning with Claude outside the app. Two forms:
 *  - JSON (`elsyyaad.lifeos.state/v1`): exact data with ids, so a returned plan file can
 *    reference existing records.
 *  - Markdown: compact human/LLM-readable briefing.
 * Every number is computed from stored data; nothing is estimated unless labelled.
 */

export const STATE_SCHEMA = 'elsyyaad.lifeos.state/v1'

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const STATUS: Record<Task['status'], string> = { new: 'جديدة', planned: 'مخططة', in_progress: 'جارية', paused: 'متوقفة', done: 'مكتملة', cancelled: 'ملغاة' }
const fmtDue = (t?: number) => (t === undefined ? '' : `${dayKey(t)} ${hhmm(new Date(t).getHours() * 60 + new Date(t).getMinutes())}`)

export interface StateExport {
  schema: typeof STATE_SCHEMA
  exportedAt: string
  today: string
  settings: LifeData['settings']
  projects: unknown[]
  goals: unknown[]
  milestones: unknown[]
  openTasks: unknown[]
  recentlyCompleted: unknown[]
  commitments: unknown[]
  habits: unknown[]
  decisions: unknown[]
  openRisks: unknown[]
  plan: { atRisk: unknown[]; unscheduled: unknown[]; overload?: unknown; capacity: unknown[] }
  metrics: { key: string; label: string; value: string; num: number; den: number; definition: string }[]
}

export function buildStateExport(d: LifeData, planRes: PlanResult, report: Report, now: number): StateExport {
  const s = d.settings
  const tasks = d.tasks.filter((t) => !t.deletedAt)
  const rem = (t: Task) => remainingMinutes(t, s)
  const since = now - 14 * 86_400_000
  return {
    schema: STATE_SCHEMA,
    exportedAt: new Date(now).toISOString(),
    today: dayKey(now),
    settings: s,
    projects: d.projects.filter((p) => !p.deletedAt).map((p) => {
      const pr = projectProgress(p, tasks, s)
      const fc = projectForecast(p, tasks, d.logs, planRes, rem, now)
      const bl = projectBlockers(p, tasks, now)
      return {
        id: p.id, name: p.name, status: p.status, category: p.category, goalId: p.goalId, startDate: p.startDate, targetDate: p.targetDate,
        progressPct: pr.pct, tasksDone: pr.done, tasksOpen: pr.open, remainingMin: fc.remainingMin, projectedEnd: fc.beyondHorizon ? fc.rateEnd : fc.plannedEnd,
        slipDays: fc.slipDays, loggedMinPerDay14d: fc.dailyRateMin,
        blockedTasks: bl.waiting.map((w) => ({ id: w.task.id, waitingOn: w.on.map((x) => x.id) })),
      }
    }),
    goals: d.goals.filter((g) => !g.deletedAt).map((g) => {
      const pct = goalProgress(g, tasks, d.projects, d.milestones, s)
      const st = goalStatus(g, pct, now)
      return { id: g.id, title: g.title, outcome: g.outcome, successCriteria: g.successCriteria, kind: g.kind, status: g.status, startDate: g.startDate, targetDate: g.targetDate, metric: g.metric, progressPct: pct, expectedPct: st.expectedPct, track: st.track, projectedDate: st.projectedDate, changes: g.changes.slice(-5) }
    }),
    milestones: d.milestones.map((m) => ({ id: m.id, title: m.title, projectId: m.projectId, goalId: m.goalId, dueDate: m.dueDate, status: m.status })),
    openTasks: tasks.filter((t) => isOpen(t) && !t.recurrence).map((t) => ({
      id: t.id, title: t.title, projectId: t.projectId, milestoneId: t.milestoneId, goalId: t.goalId, category: t.category, status: t.status,
      importance: t.importance, priorityScore: planRes.scores[t.id]?.score, progress: t.progress, due: fmtDue(t.dueAt) || undefined, startDate: t.startDate,
      estimateMin: t.estimateMin, confidence: t.confidence, actualMin: t.actualMin, energy: t.energy, dependsOn: t.dependsOn, postponeCount: t.postponeCount,
      projectedFinish: planRes.finishAt[t.id] ? fmtDue(planRes.finishAt[t.id]) : undefined, pinned: t.pinned,
    })),
    recentlyCompleted: tasks.filter((t) => t.status === 'done' && (t.completedAt ?? 0) >= since).map((t) => ({ id: t.id, title: t.title, projectId: t.projectId, completedAt: fmtDue(t.completedAt), estimateMin: t.estimateMin, actualMin: t.actualMin })),
    commitments: d.commitments.filter((c) => !c.deletedAt).map((c) => ({ id: c.id, title: c.title, kind: c.kind, repeat: c.repeat, start: hhmm(c.startMin), end: hhmm(c.endMin), validFrom: c.validFrom, validUntil: c.validUntil })),
    habits: d.habits.filter((h) => !h.archived).map((h) => ({ id: h.id, title: h.title, schedule: h.schedule })),
    decisions: d.notes.filter((n) => !n.deletedAt && n.kind === 'decision').slice(-30).map((n) => ({ id: n.id, title: n.title, body: n.body, projectId: n.projectId, date: dayKey(n.createdAt) })),
    openRisks: d.notes.filter((n) => !n.deletedAt && (n.kind === 'risk' || n.kind === 'issue') && n.open).map((n) => ({ id: n.id, kind: n.kind, title: n.title, severity: n.severity, projectId: n.projectId })),
    plan: {
      atRisk: planRes.atRisk.map((r) => ({ taskId: r.taskId, kind: r.kind, due: fmtDue(r.dueAt), projectedEnd: r.projectedEnd ? fmtDue(r.projectedEnd) : undefined, lateMin: r.lateMin })),
      unscheduled: planRes.unscheduled,
      overload: planRes.overload,
      capacity: planRes.capacity.map((c) => ({ day: c.day, freeMin: c.freeMin, budgetMin: c.budgetMin, plannedMin: c.plannedMin, rest: c.rest })),
    },
    metrics: report.metrics.map((m) => ({ key: m.key, label: m.label, value: fmtMetric(m), num: m.num, den: m.den, definition: m.definition })),
  }
}

export function stateMarkdown(d: LifeData, planRes: PlanResult, report: Report, now: number): string {
  const s = d.settings
  const tasks = d.tasks.filter((t) => !t.deletedAt && !t.recurrence)
  const byId = new Map(d.tasks.map((t) => [t.id, t]))
  const projName = new Map(d.projects.map((p) => [p.id, p.name]))
  const L: string[] = []
  L.push(`# حالة ELSYYAAD Life OS — ${dayKey(now)}`, '')
  L.push(`نافذة العمل ${hhmm(s.dayStartMin)}–${hhmm(s.dayEndMin)} • هامش طوارئ ${Math.round(s.bufferPct * 100)}% • جلسة افتراضية ${s.defaultSessionMin} د${s.restWeekdays.length ? ` • راحة: ${s.restWeekdays.map((w) => WEEKDAYS[w]).join('، ')}` : ''}`, '')

  L.push('## المؤشرات (آخر 28 يوم)')
  for (const m of report.metrics) L.push(`- ${m.label}: **${fmtMetric(m)}** (${m.num}/${m.den}) — ${m.definition}`)
  L.push('')

  const activeGoals = d.goals.filter((g) => !g.deletedAt && g.status === 'active')
  if (activeGoals.length) {
    L.push('## الأهداف')
    for (const g of activeGoals) {
      const pct = goalProgress(g, d.tasks, d.projects, d.milestones, s)
      const st = goalStatus(g, pct, now)
      L.push(`- **${g.title}** [${g.id}] — ${pct ?? '—'}% (المتوقع ${st.expectedPct}%)، الموعد ${g.targetDate}${st.projectedDate ? `، الإسقاط ${st.projectedDate}` : ''}. النجاح: ${g.successCriteria || '—'}`)
    }
    L.push('')
  }

  const projects = d.projects.filter((p) => !p.deletedAt && p.status !== 'archived')
  if (projects.length) {
    L.push('## المشاريع')
    for (const p of projects) L.push(...projectLines(p, d, planRes, now))
    L.push('')
  }

  L.push('## المهام المفتوحة (حسب الأولوية)')
  const open = tasks.filter(isOpen).sort((a, b) => (planRes.scores[b.id]?.score ?? 0) - (planRes.scores[a.id]?.score ?? 0))
  if (!open.length) L.push('- لا يوجد')
  for (const t of open.slice(0, 60)) {
    const deps = t.dependsOn.map((id) => byId.get(id)?.title).filter(Boolean)
    const parts = [
      `أولوية ${planRes.scores[t.id]?.score ?? '—'}`, STATUS[t.status], t.progress ? `${t.progress}%` : '',
      t.estimateMin ? `تقدير ${t.estimateMin} د${t.confidence === 'rough' ? ' (تقريبي)' : ''}` : 'بدون تقدير',
      t.actualMin ? `فعلي ${t.actualMin} د` : '', t.dueAt ? `موعد ${fmtDue(t.dueAt)}` : '', t.projectId ? `مشروع: ${projName.get(t.projectId)}` : '',
      deps.length ? `يعتمد على: ${deps.join('، ')}` : '', t.postponeCount ? `أُجّلت ${t.postponeCount}×` : '',
    ].filter(Boolean)
    L.push(`- ${t.title} [${t.id}] — ${parts.join(' • ')}`)
  }
  if (open.length > 60) L.push(`- … و ${open.length - 60} مهمة أخرى (موجودة في ملف JSON)`)
  L.push('')

  if (planRes.atRisk.length || planRes.unscheduled.length || planRes.overload) {
    L.push('## مخاطر الخطة')
    if (planRes.overload) L.push(`- حمل زائد: المطلوب حتى ${planRes.overload.day} = ${planRes.overload.demandMin} د مقابل ${planRes.overload.capacityMin} د متاحة.`)
    for (const r of planRes.atRisk) L.push(`- ${byId.get(r.taskId)?.title}: ${r.kind === 'late' ? `متوقع تتأخر ${r.lateMin} د` : r.kind === 'tight' ? 'هامش ضيق' : 'لم تُجدول قبل موعدها'} (الموعد ${fmtDue(r.dueAt)})`)
    for (const u of planRes.unscheduled) L.push(`- غير مجدولة: ${byId.get(u.taskId)?.title} (${u.reason === 'no_capacity' ? 'لا يوجد وقت كافٍ' : u.reason === 'dependency_unscheduled' ? 'معتمدة على مهمة غير مجدولة' : 'تبدأ بعد أفق التخطيط'})`)
    L.push('')
  }

  const commitments = d.commitments.filter((c) => !c.deletedAt)
  if (commitments.length) {
    L.push('## الالتزامات الثابتة')
    for (const c of commitments) {
      const rep = c.repeat.type === 'once' ? c.repeat.day : c.repeat.type === 'daily' ? 'يوميًا' : c.repeat.weekdays.map((w) => WEEKDAYS[w]).join('، ')
      L.push(`- ${c.title} [${c.id}] — ${rep} ${hhmm(c.startMin)}–${hhmm(c.endMin)}`)
    }
    L.push('')
  }

  const series = d.tasks.filter((t) => !t.deletedAt && t.recurrence)
  if (series.length) {
    L.push('## المهام المتكررة')
    for (const t of series) L.push(`- ${t.title} [${t.id}] — ${describeRecurrence(t.recurrence!)}`)
    L.push('')
  }

  const decisions = d.notes.filter((n) => !n.deletedAt && n.kind === 'decision').slice(-10)
  if (decisions.length) {
    L.push('## آخر القرارات')
    for (const n of decisions) L.push(`- ${dayKey(n.createdAt)} — ${n.title}${n.body ? `: ${n.body.replace(/\s+/g, ' ').slice(0, 200)}` : ''}`)
    L.push('')
  }

  L.push('## الوقت المسجل (آخر 28 يوم)')
  L.push(`- إجمالي ${report.focusMin} د، مقاطعات ${report.interruptions}${report.estimationBias ? `، الفعلي/المقدّر (وسيط) ${report.estimationBias.toFixed(2)}×` : ''}`)
  for (const b of report.byProject.slice(0, 6)) L.push(`- ${b.label}: ${b.minutes} د`)
  return L.join('\n')
}

function projectLines(p: Project, d: LifeData, planRes: PlanResult, now: number): string[] {
  const s = d.settings
  const tasks = d.tasks.filter((t) => !t.deletedAt)
  const pr = projectProgress(p, tasks, s)
  const fc = projectForecast(p, tasks, d.logs, planRes, (t) => remainingMinutes(t, s), now)
  const bl = projectBlockers(p, tasks, now)
  const end = fc.beyondHorizon ? fc.rateEnd : fc.plannedEnd
  const out = [`- **${p.name}** [${p.id}] — ${pr.pct ?? 0}% (${pr.done}/${pr.total} مهام)، متبقي ${fc.remainingMin} د${p.targetDate ? `، المستهدف ${p.targetDate}` : ''}${end ? `، المتوقع ${end}` : ''}${fc.slipDays && fc.slipDays > 0 ? ` (تأخير ${fc.slipDays} يوم)` : ''}`]
  for (const w of bl.waiting.slice(0, 3)) out.push(`  - معطلة: ${w.task.title} ← تنتظر ${w.on.map((x) => x.title).join('، ')}`)
  return out
}

/** Markdown status report for one project (decisions, risks, milestones included). */
export function projectReport(p: Project, d: LifeData, planRes: PlanResult, now: number): string {
  const tasks = d.tasks.filter((t) => !t.deletedAt && t.projectId === p.id && !t.recurrence)
  const L = [`# تقرير مشروع: ${p.name}`, `التاريخ: ${dayKey(now)}`, '', ...projectLines(p, d, planRes, now), '']
  if (p.description) L.push(p.description, '')
  const ms = d.milestones.filter((m) => m.projectId === p.id).sort((a, b) => a.order - b.order)
  if (ms.length) {
    L.push('## المراحل')
    for (const m of ms) L.push(`- [${m.status === 'done' ? 'x' : ' '}] ${m.title}${m.dueDate ? ` — ${m.dueDate}` : ''}`)
    L.push('')
  }
  L.push('## المهام')
  for (const t of tasks) L.push(`- [${t.status === 'done' ? 'x' : ' '}] ${t.title} — ${STATUS[t.status]}${t.progress && t.status !== 'done' ? ` ${t.progress}%` : ''}${t.dueAt ? ` • موعد ${fmtDue(t.dueAt)}` : ''}${t.estimateMin ? ` • ${t.estimateMin} د` : ''}${t.actualMin ? ` • فعلي ${t.actualMin} د` : ''}`)
  const notes = d.notes.filter((n) => !n.deletedAt && n.projectId === p.id)
  for (const [kind, title] of [['decision', 'القرارات'], ['risk', 'المخاطر'], ['issue', 'المشاكل'], ['note', 'ملاحظات فنية']] as const) {
    const xs = notes.filter((n) => n.kind === kind)
    if (!xs.length) continue
    L.push('', `## ${title}`)
    for (const n of xs) L.push(`- ${dayKey(n.createdAt)} — ${n.title}${n.open === false ? ' (مغلق)' : ''}${n.body ? `: ${n.body.replace(/\s+/g, ' ')}` : ''}`)
  }
  return L.join('\n')
}

/** Instructions given to Claude together with the state, describing the plan-file format. */
export const PLAN_FILE_GUIDE = `## صيغة ملف الخطة المطلوب (JSON)
أرجِع JSON واحد فقط بالشكل التالي. كل المفاتيح اختيارية ما عدا schema.
- لإنشاء عنصر جديد استخدم "ref" (اسم مرجعي مؤقت) بدون id.
- لتعديل عنصر موجود استخدم "id" من ملف الحالة، واكتب الحقول المتغيرة فقط.
- للحذف (ينقل لسلة المحذوفات): { "id": "...", "delete": true }.
- المراجع (project / milestone / goal / dependsOn / task) تقبل ref من نفس الملف أو id موجود أو الاسم الحالي بالضبط.
- التواريخ YYYY-MM-DD، والأوقات HH:mm، والموعد النهائي due إما YYYY-MM-DD أو YYYY-MM-DDTHH:mm.
- أيام الأسبوع أرقام: 0 الأحد … 6 السبت.

{
  "schema": "${PLAN_SCHEMA}",
  "title": "عنوان الخطة",
  "summary": "ملخص التغييرات وسببها",
  "goals": [{ "ref": "g1", "title": "", "outcome": "", "successCriteria": "", "kind": "project|learning|work|habit|personal", "horizon": "monthly|quarterly|yearly|custom", "startDate": "", "targetDate": "", "metric": { "type": "tasks" } | { "type": "numeric", "unit": "درس", "start": 0, "target": 20, "current": 0 } | { "type": "milestones" }, "reason": "سبب التعديل (للأهداف الموجودة)" }],
  "projects": [{ "ref": "p1", "name": "", "description": "", "goal": "g1", "targetDate": "", "category": "", "weighting": "equal|estimate|custom" }],
  "milestones": [{ "ref": "m1", "title": "", "project": "p1", "goal": "g1", "dueDate": "", "order": 1, "dependsOn": [] }],
  "tasks": [{ "ref": "t1", "title": "", "description": "", "project": "p1", "milestone": "m1", "goal": "g1", "category": "", "importance": 1-5, "estimateMin": 60, "confidence": "firm|rough", "energy": "deep|routine|study|light", "startDate": "", "due": "", "dependsOn": ["t0"], "checklist": ["خطوة"], "recurrence": { "type": "daily", "every": 1 } | { "type": "weekly", "weekdays": [0,2] } | { "type": "monthly", "day": 1 }, "pinned": { "day": "", "time": "HH:mm" }, "window": { "start": "11:30", "end": "15:00" }, "status": "new|planned|in_progress|paused|done|cancelled", "progress": 0 }],
  "commitments": [{ "ref": "c1", "title": "", "kind": "work|class|appointment|sleep|meal|gym|prayer|other", "repeat": { "type": "weekly", "weekdays": [0,1,2,3,4] } | { "type": "daily" } | { "type": "once", "day": "" }, "start": "09:00", "end": "17:00", "validFrom": "", "validUntil": "" }],
  "habits": [{ "ref": "h1", "title": "", "schedule": { "type": "daily" } | { "type": "weekly", "weekdays": [] } | { "type": "timesPerWeek", "times": 3 } }],
  "notes": [{ "kind": "note|idea|decision|risk|issue", "title": "", "body": "", "project": "p1" }],
  "settings": { "dayStart": "08:00", "dayEnd": "23:00", "bufferPct": 0.15, "defaultSessionMin": 90, "maxDeepMinPerDay": 300, "deepStart": "11:30", "deepEnd": "15:00", "restWeekdays": [5], "accountability": "calm|balanced|firm" }
}

قواعد مهمة:
- لا تعدّل الالتزامات الثابتة إلا لو طلبت ذلك صراحة.
- قدّر المدد بواقعية، واستخدم confidence: "rough" للتقديرات غير المؤكدة.
- لا تتجاوز السعة المتاحة في capacity؛ المحرك المحلي سيجدول المهام بنفسه حسب الأولوية والاعتماديات.`

export function claudePrompt(markdown: string): string {
  return `أنا بستخدم تطبيق ELSYYAAD Life OS لإدارة وقتي. دي حالتي الحالية مُصدّرة من التطبيق (بيانات حقيقية، مش تقديرات).\n\n${markdown}\n\n---\n\n${PLAN_FILE_GUIDE}\n\nالمطلوب: `
}
