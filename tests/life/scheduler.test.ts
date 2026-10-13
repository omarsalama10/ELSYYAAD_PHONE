import { describe, expect, it } from 'vitest'
import { currentAndNext, diffPlans, plan, whatIf } from '../../src/life/domain/scheduler'
import { priorityScores, remainingMinutes, wouldCreateCycle } from '../../src/life/domain/priority'
import { addDays, subtractIntervals } from '../../src/life/domain/time'
import { commitment, MON, settings, task, time } from './factory'

const S = settings({ dayStartMin: 9 * 60, dayEndMin: 17 * 60 })

describe('intervals', () => {
  it('subtracts overlapping cuts', () => {
    expect(subtractIntervals([[0, 100]], [[10, 20], [15, 30], [90, 200]])).toEqual([[0, 10], [30, 90]])
  })
})

describe('remainingMinutes', () => {
  it('scales by progress and inflates rough estimates', () => {
    expect(remainingMinutes(task({ estimateMin: 100, progress: 50 }), S)).toBe(50)
    expect(remainingMinutes(task({ estimateMin: 100, confidence: 'rough' }), S)).toBe(125)
    expect(remainingMinutes(task({ estimateMin: 100, status: 'done' }), S)).toBe(0)
  })
})

describe('priority', () => {
  it('overdue and blocking work outranks idle work', () => {
    const blocker = task({ id: 'b', importance: 3 })
    const dep = task({ id: 'd', dependsOn: ['b'] })
    const overdue = task({ id: 'o', importance: 3, dueAt: time(8) })
    const idle = task({ id: 'i', importance: 3 })
    const s = priorityScores([blocker, dep, overdue, idle], S, time(9))
    expect(s.get('o')!.score).toBeGreaterThan(s.get('i')!.score)
    expect(s.get('b')!.score).toBeGreaterThan(s.get('i')!.score)
  })

  it('manual override wins', () => {
    const s = priorityScores([task({ id: 'x', priorityOverride: 99 })], S, time(9))
    expect(s.get('x')).toMatchObject({ score: 99, overridden: true })
  })

  it('detects dependency cycles', () => {
    const ts = [task({ id: 'a', dependsOn: ['b'] }), task({ id: 'b', dependsOn: ['c'] }), task({ id: 'c' })]
    expect(wouldCreateCycle(ts, 'c', 'a')).toBe(true)
    expect(wouldCreateCycle(ts, 'a', 'c')).toBe(false)
  })
})

describe('plan', () => {
  it('fills free time around fixed commitments and never overlaps them', () => {
    const lunch = commitment({ startMin: 12 * 60, endMin: 13 * 60, title: 'غداء' })
    const t = task({ id: 'a', estimateMin: 240, maxSessionMin: 240 })
    const r = plan({ tasks: [t], commitments: [lunch], settings: S, now: time(9), days: 1 })
    const tb = r.blocks.filter((b) => b.taskId === 'a')
    expect(tb.map((b) => [b.startMin, b.endMin])).toEqual([[540, 720], [780, 840]])
    expect(r.unscheduled).toEqual([])
  })

  it('splits long work into sessions with gaps', () => {
    const r = plan({ tasks: [task({ id: 'a', estimateMin: 180 })], commitments: [], settings: { ...S, defaultSessionMin: 90, gapMin: 15 }, now: time(9), days: 1 })
    expect(r.blocks.map((b) => [b.startMin, b.endMin, b.part, b.parts])).toEqual([[540, 630, 1, 2], [645, 735, 2, 2]])
  })

  it('respects capacity: an 12h task in a 6h day spills to the next day', () => {
    const s = { ...S, dayStartMin: 9 * 60, dayEndMin: 15 * 60, defaultSessionMin: 600 }
    const r = plan({ tasks: [task({ id: 'a', estimateMin: 720 })], commitments: [], settings: s, now: time(9), days: 3 })
    expect(r.capacity[0]!.plannedMin).toBe(360)
    expect(r.capacity[1]!.plannedMin).toBe(360)
    expect(r.unscheduled).toEqual([])
  })

  it('keeps the contingency buffer empty', () => {
    const r = plan({ tasks: [task({ estimateMin: 600, maxSessionMin: 600 })], commitments: [], settings: { ...S, bufferPct: 0.25 }, now: time(9), days: 1 })
    expect(r.capacity[0]).toMatchObject({ freeMin: 480, budgetMin: 360, plannedMin: 360 })
    expect(r.unscheduled[0]).toMatchObject({ reason: 'no_capacity', placedMin: 360 })
  })

  it('never schedules a task before its dependency finishes', () => {
    const dev = task({ id: 'dev', title: 'تطوير', estimateMin: 120, importance: 1 })
    const qa = task({ id: 'qa', title: 'اختبار', estimateMin: 60, importance: 5, dependsOn: ['dev'] })
    const r = plan({ tasks: [qa, dev], commitments: [], settings: S, now: time(9), days: 1 })
    const devEnd = r.finishAt.dev!
    const qaStart = r.blocks.find((b) => b.taskId === 'qa')!
    expect(time(0) + qaStart.startMin * 60_000).toBeGreaterThanOrEqual(devEnd)
  })

  it('reports dependents of unplaceable tasks instead of placing them', () => {
    const big = task({ id: 'big', estimateMin: 10_000 })
    const after = task({ id: 'after', dependsOn: ['big'] })
    const r = plan({ tasks: [big, after], commitments: [], settings: S, now: time(9), days: 2 })
    expect(r.unscheduled.map((u) => [u.taskId, u.reason])).toEqual([['big', 'no_capacity'], ['after', 'dependency_unscheduled']])
    expect(r.blocks.some((b) => b.taskId === 'after')).toBe(false)
  })

  it('starts today from now, not from the day start', () => {
    const r = plan({ tasks: [task({ id: 'a', estimateMin: 30 })], commitments: [], settings: S, now: time(13, 2), days: 1 })
    expect(r.blocks[0]!.startMin).toBe(13 * 60 + 5)
  })

  it('honours startDate, rest days and pinned slots', () => {
    const later = task({ id: 'later', estimateMin: 30, startDate: addDays(MON, 2) })
    const pinned = task({ id: 'pin', estimateMin: 60, pinned: { day: MON, startMin: 9 * 60 } })
    const r = plan({ tasks: [later, pinned], commitments: [], settings: S, now: time(9), days: 3, restDays: [addDays(MON, 2)] })
    expect(r.blocks.find((b) => b.taskId === 'pin')).toMatchObject({ kind: 'pinned', startMin: 540, endMin: 600 })
    // Day +2 is a rest day, so "later" can't fit within the 3-day horizon.
    expect(r.unscheduled.find((u) => u.taskId === 'later')?.reason).toBe('no_capacity')
  })

  it('flags late, tight and overloaded deadlines', () => {
    const s = { ...S, dayStartMin: 9 * 60, dayEndMin: 11 * 60 }
    const late = task({ id: 'late', estimateMin: 180, dueAt: time(11), maxSessionMin: 180 })
    const r = plan({ tasks: [late], commitments: [], settings: s, now: time(9), days: 3 })
    expect(r.atRisk[0]).toMatchObject({ taskId: 'late', kind: 'late' })
    expect(r.overload).toMatchObject({ day: MON, demandMin: 180, capacityMin: 120 })
  })

  it('is deterministic', () => {
    const ts = [task({ id: 'a', estimateMin: 45 }), task({ id: 'b', estimateMin: 45 }), task({ id: 'c', estimateMin: 45, importance: 5 })]
    const a = plan({ tasks: ts, commitments: [], settings: S, now: time(9), days: 1 })
    const b = plan({ tasks: [...ts].reverse(), commitments: [], settings: S, now: time(9), days: 1 })
    expect(a.blocks).toEqual(b.blocks)
    expect(a.blocks[0]!.taskId).toBe('c')
  })

  it('ignores done, cancelled, deleted and series templates', () => {
    const ts = [
      task({ status: 'done' }), task({ status: 'cancelled' }), task({ deletedAt: 1 }),
      task({ recurrence: { type: 'daily', every: 1 } }),
    ]
    expect(plan({ tasks: ts, commitments: [], settings: S, now: time(9), days: 1 }).blocks).toEqual([])
  })
})

describe('diff + what-if', () => {
  it('diffPlans reports moved, added and removed tasks', () => {
    const before = plan({ tasks: [task({ id: 'a', estimateMin: 60 }), task({ id: 'b', estimateMin: 60 })], commitments: [], settings: S, now: time(9), days: 1 })
    const after = plan({ tasks: [task({ id: 'a', estimateMin: 60 }), task({ id: 'c', estimateMin: 60, importance: 5 })], commitments: [], settings: S, now: time(9), days: 1 })
    const d = diffPlans(before.blocks, after.blocks)
    expect(d.map((x) => [x.taskId, x.type]).sort()).toEqual([['a', 'moved'], ['b', 'removed'], ['c', 'added']])
  })

  it('cancelling a commitment frees time and resolves a risk', () => {
    const gym = commitment({ id: 'gym', startMin: 9 * 60, endMin: 16 * 60, title: 'جيم' })
    const t = task({ id: 'x', estimateMin: 120, dueAt: time(17), maxSessionMin: 120 })
    const r = whatIf({ tasks: [t], commitments: [gym], settings: S, now: time(9), days: 1 }, { type: 'skip_commitment', commitmentId: 'gym', day: MON })
    expect(r.base.atRisk[0]?.kind).toBe('unscheduled')
    expect(r.resolvedRisks).toEqual(['x'])
  })

  it('reserving project hours pushes other work later', () => {
    const other = task({ id: 'o', estimateMin: 60 })
    const r = whatIf({ tasks: [other], commitments: [], settings: S, now: time(9), days: 2 }, { type: 'reserve_project', projectId: 'p', minutes: 240, label: 'برمجة' })
    expect(r.rows.find((x) => x.taskId === 'o')!.deltaMin).toBe(240)
  })

  it('lost time shifts today', () => {
    const r = whatIf({ tasks: [task({ id: 'a', estimateMin: 30 })], commitments: [], settings: S, now: time(9), days: 1 }, { type: 'lost_time', minutes: 120 })
    expect(r.rows[0]).toMatchObject({ taskId: 'a', deltaMin: 120 })
  })
})

describe('currentAndNext', () => {
  it('picks the running block and the next one', () => {
    const r = plan({ tasks: [task({ id: 'a', estimateMin: 60 }), task({ id: 'b', estimateMin: 60 })], commitments: [], settings: S, now: time(9), days: 1 })
    const { current, next } = currentAndNext(r.blocks, time(9, 30))
    expect(current?.startMin).toBe(540)
    expect(next?.startMin).toBe(600)
  })
})
