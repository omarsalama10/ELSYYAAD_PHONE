import { describe, expect, it } from 'vitest'
import { habitStats } from '../../src/life/domain/habits'
import { goalProgress, goalStatus, projectBlockers, projectProgress, weightedProgress } from '../../src/life/domain/progress'
import { buildReport, executionRate, estimationAccuracy, scheduleStability, hourProfile } from '../../src/life/domain/analytics'
import { commitmentOccursOn, occursOn, pendingOccurrences } from '../../src/life/domain/recurrence'
import { matches, normalize, parseQuickAdd, suggestEstimate, toCSV } from '../../src/life/domain/text'
import { buildICS, fold } from '../../src/life/domain/ics'
import { dayReminders, inQuietHours } from '../../src/life/domain/reminders'
import { plan } from '../../src/life/domain/scheduler'
import { addDays, at, diffDays, startOfWeek } from '../../src/life/domain/time'
import { newGoal, newHabit, newProject } from '../../src/life/domain/factory'
import type { DayPlan, HabitLog, TaskEvent, TimeLog } from '../../src/life/domain/types'
import { commitment, MON, settings, task, time } from './factory'

const S = settings({ dayStartMin: 9 * 60, dayEndMin: 17 * 60 })

describe('time', () => {
  it('handles weeks and day diffs', () => {
    expect(startOfWeek(MON, 6)).toBe('2026-10-10') // Saturday
    expect(diffDays('2026-10-01', '2026-11-01')).toBe(31)
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('recurrence', () => {
  it('daily/weekly/monthly rules', () => {
    expect(occursOn({ type: 'daily', every: 2 }, MON, addDays(MON, 4))).toBe(true)
    expect(occursOn({ type: 'daily', every: 2 }, MON, addDays(MON, 3))).toBe(false)
    expect(occursOn({ type: 'weekly', weekdays: [1] }, MON, addDays(MON, 7))).toBe(true)
    expect(occursOn({ type: 'monthly', day: 31 }, '2026-01-01', '2026-02-28')).toBe(true)
  })

  it('materializes missing occurrences only', () => {
    const series = task({ id: 's', recurrence: { type: 'daily', every: 1 }, startDate: MON })
    const existing = [task({ seriesId: 's', occurrence: MON })]
    expect(pendingOccurrences(series, existing, MON, 3)).toEqual([addDays(MON, 1), addDays(MON, 2)])
  })

  it('commitments respect skip days and validity', () => {
    const c = commitment({ startMin: 0, endMin: 60, repeat: { type: 'weekly', weekdays: [1] }, skipDays: [MON], validUntil: addDays(MON, 10) })
    expect(commitmentOccursOn(c, MON)).toBe(false)
    expect(commitmentOccursOn(c, addDays(MON, 7))).toBe(true)
    expect(commitmentOccursOn(c, addDays(MON, 14))).toBe(false)
  })
})

describe('habits', () => {
  const h = newHabit('h', time(8, 0, addDays(MON, -10)), { title: 'قراءة' })
  const log = (offset: number, mark: HabitLog['mark'] = 'done'): HabitLog => ({ id: `${offset}`, habitId: 'h', day: addDays(MON, offset), mark })

  it('a single miss pauses the streak; two in a row reset it', () => {
    const one = [log(-4), log(-3), log(-1)] // missed -2
    expect(habitStats(h, one, MON, 6).current).toBe(3)
    const two = [log(-5), log(-4), log(-1)] // missed -3, -2
    expect(habitStats(h, two, MON, 6).current).toBe(1)
  })

  it('skipped days are neutral and today never breaks', () => {
    const xs = [log(-3), log(-2, 'skipped'), log(-1)]
    const st = habitStats(h, xs, MON, 6)
    expect(st.current).toBe(2)
    expect(st.rate30).toBeCloseTo(2 / 9) // 11 scheduled days − 1 skipped − today = 9 due
  })

  it('times-per-week counts weeks', () => {
    const w = newHabit('h', time(8, 0, addDays(MON, -16)), { title: 'جيم', schedule: { type: 'timesPerWeek', times: 2 } })
    const xs = [-16, -15, -9, -8, 0].map((o) => log(o))
    const st = habitStats(w, xs, MON, 6)
    expect(st).toMatchObject({ unit: 'week', current: 2, weekDone: 1 })
  })
})

describe('progress', () => {
  it('weights progress and excludes cancelled', () => {
    const ts = [task({ estimateMin: 60, status: 'done' }), task({ estimateMin: 180, progress: 50 }), task({ status: 'cancelled' })]
    expect(weightedProgress(ts, 'equal', S).pct).toBe(75)
    expect(weightedProgress(ts, 'estimate', S).pct).toBe(Math.round((60 * 100 + 180 * 50) / 240))
    expect(weightedProgress([], 'equal', S).pct).toBeNull()
  })

  it('finds blockers and bottlenecks in a project', () => {
    const p = newProject('p', 0, { name: 'برنامج' })
    const a = task({ id: 'a', projectId: 'p' })
    const b = task({ id: 'b', projectId: 'p', dependsOn: ['a'] })
    const r = projectBlockers(p, [a, b], time(9))
    expect(r.waiting.map((w) => w.task.id)).toEqual(['b'])
    expect(r.bottlenecks[0]).toMatchObject({ dependents: 1 })
    expect(projectProgress(p, [a, b], S).open).toBe(2)
  })

  it('goal status compares progress with elapsed time', () => {
    const g = newGoal('g', 0, { title: 'إصدار أول', startDate: MON, targetDate: addDays(MON, 30), metric: { type: 'numeric', unit: 'درس', start: 0, target: 20, current: 4 } })
    const pct = goalProgress(g, [], [], [], S)
    expect(pct).toBe(20)
    const st = goalStatus(g, pct, time(9, 0, addDays(MON, 15)))
    expect(st).toMatchObject({ expectedPct: 50, track: 'behind', suggestion: 'reduce_scope_or_extend' })
    expect(st.projectedDate).toBe(addDays(MON, 75))
  })
})

describe('analytics', () => {
  const r = { from: addDays(MON, -7), to: addDays(MON, 1) }

  it('execution and estimation are defined on real data only', () => {
    const due = time(10, 0, addDays(MON, -2))
    const ts = [
      task({ dueAt: due, status: 'done', completedAt: due - 1, estimateMin: 60, actualMin: 90 }),
      task({ dueAt: due, status: 'new' }),
      task({ dueAt: due, status: 'cancelled' }),
    ]
    expect(executionRate(ts, r, time(12))).toMatchObject({ num: 1, den: 2, value: 0.5 })
    expect(estimationAccuracy(ts, { from: addDays(MON, -7), to: addDays(MON, 1) })).toMatchObject({ value: 0.5, bias: 1.5 })
    expect(executionRate([], r, time(12)).value).toBeNull()
  })

  it('stability counts planned tasks that were moved', () => {
    const plans: DayPlan[] = [{ id: 'x', day: addDays(MON, -1), revision: 2, current: 1, approvedAt: 0, blocks: [
      { id: '1', day: addDays(MON, -1), startMin: 0, endMin: 60, kind: 'task', title: 'a', taskId: 'a' },
      { id: '2', day: addDays(MON, -1), startMin: 60, endMin: 120, kind: 'task', title: 'b', taskId: 'b' },
    ] }]
    const events: TaskEvent[] = [{ id: 'e', taskId: 'a', at: time(9, 0, addDays(MON, -1)), type: 'postponed', reason: 'وقت غير كافٍ' }]
    expect(scheduleStability(plans, events, r)).toMatchObject({ value: 0.5, moves: 1, revisions: 1 })
  })

  it('hour profile splits logs at hour boundaries', () => {
    const logs: TimeLog[] = [{ id: 'l', kind: 'deep', start: time(9, 30), end: time(11, 0), interruptions: 0 }]
    const h = hourProfile(logs, r, time(12))
    expect([h[9], h[10]]).toEqual([30, 60])
  })

  it('builds a full report without throwing on empty data', () => {
    const rep = buildReport({ tasks: [], events: [], logs: [], plans: [], dayLogs: [], commitments: [], projects: [], settings: S, now: time(12) }, r)
    expect(rep.metrics.filter((m) => m.key !== 'velocity').every((m) => m.value === null)).toBe(true)
    expect(rep.metrics.find((m) => m.key === 'velocity')).toMatchObject({ value: 0, num: 0 })
  })
})

describe('text', () => {
  it('normalizes Arabic variants for search', () => {
    expect(normalize('إدارةُ المشروع')).toBe(normalize('اداره المشروع'))
    expect(matches('مشروع البرمجه', 'مشروع البرمجة الجديد')).toBe(true)
    expect(matches('xyz', 'مشروع')).toBe(false)
  })

  it('parses quick add tokens', () => {
    const p = newProject('p', 0, { name: 'برنامج المحاسبة' })
    const q = parseQuickAdd('مراجعة الكود 45د !4 #برنامج @بكرة 14:30', [p], time(9))
    expect(q).toMatchObject({ title: 'مراجعة الكود', estimateMin: 45, importance: 4, projectId: 'p', pinned: { day: addDays(MON, 1), startMin: 870 } })
    expect(parseQuickAdd('مكالمة 1.5h', [], time(9)).estimateMin).toBe(90)
  })

  it('suggests estimates only from enough similar history', () => {
    const hist = [task({ title: 'كتابة تقرير شهري', status: 'done', actualMin: 50 }), task({ title: 'كتابة تقرير الأداء', status: 'done', actualMin: 70 })]
    expect(suggestEstimate({ title: 'كتابة تقرير جديد' }, hist)).toEqual({ minutes: 60, basis: 2 })
    expect(suggestEstimate({ title: 'شيء مختلف' }, hist)).toBeUndefined()
  })

  it('escapes CSV', () => {
    expect(toCSV([{ a: 'x,"y"' }], [{ key: 'a', label: 'A', get: (r) => r.a }])).toBe('﻿A\r\n"x,""y"""')
  })
})

describe('ics', () => {
  it('emits events with alarms and folds long lines', () => {
    const ics = buildICS([{ id: 't:1', day: MON, startMin: 600, endMin: 660, kind: 'task', title: 'مراجعة, التقرير' }], { now: 0, alarmMin: 10 })
    expect(ics).toContain('DTSTART:20261012T100000')
    expect(ics).toContain('SUMMARY:مراجعة\\, التقرير')
    expect(ics).toContain('TRIGGER:-PT10M')
    const long = fold('X:' + 'ع'.repeat(100))
    expect(long.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true)
  })
})

describe('reminders', () => {
  it('follows accountability level and quiet hours', () => {
    const t = task({ id: 'a', estimateMin: 60 })
    const r = plan({ tasks: [t], commitments: [], settings: S, now: time(9), days: 1 })
    const calm = dayReminders({ day: MON, blocks: r.blocks, tasks: [t], commitments: [], settings: { ...S, accountability: 'calm' } })
    const firm = dayReminders({ day: MON, blocks: r.blocks, tasks: [t], commitments: [], settings: { ...S, accountability: 'firm' } })
    expect(calm.map((x) => x.kind)).toEqual(['morning', 'start', 'evening'])
    expect(firm.map((x) => x.kind)).toEqual(['morning', 'before_start', 'start', 'followup', 'overdue', 'evening'])
    expect(inQuietHours(23 * 60 + 45, S)).toBe(true)
    expect(inQuietHours(12 * 60, S)).toBe(false)
  })

  it('mutes categories', () => {
    const t = task({ id: 'a', estimateMin: 60, category: 'منزل' })
    const r = plan({ tasks: [t], commitments: [], settings: S, now: time(9), days: 1 })
    const xs = dayReminders({ day: MON, blocks: r.blocks, tasks: [t], commitments: [], settings: { ...S, mutedCategories: ['منزل'] } })
    expect(xs.some((x) => x.taskId === 'a')).toBe(false)
  })

  it('warns about deadlines a day and two hours ahead', () => {
    const t = task({ id: 'a', dueAt: at(addDays(MON, 1), 14 * 60) })
    const xs = dayReminders({ day: MON, blocks: [], tasks: [t], commitments: [], settings: S })
    expect(xs.filter((x) => x.kind === 'deadline').map((x) => x.at)).toEqual([at(MON, 14 * 60)])
  })
})
