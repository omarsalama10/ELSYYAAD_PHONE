import { describe, expect, it } from 'vitest'
import { nextDayId } from '../../src/domain/rotation'
import {
  e1rm, effectiveSets, isDeloadWeek, isReturnPhase, roundTo, suggest, trainingWeek,
} from '../../src/domain/progression'
import type { Block, Exercise, SetLog, Side } from '../../src/domain/types'

const DAY = 86_400_000

function ex(over: Partial<Exercise> = {}): Exercise {
  return {
    id: 'x', name: 'X', nameAr: 'x', muscles: ['chest'], equipment: 'barbell', metric: 'reps',
    unilateral: false, images: [], cuesAr: [], instructions: [], custom: false, increment: 2.5, ...over,
  }
}
function blk(over: Partial<Block> = {}): Block {
  return { id: 'b', exerciseId: 'x', sets: 3, repMin: 8, repMax: 10, restSec: 90, section: 'main', ...over }
}
let n = 0
function set(v: { weight?: number; reps?: number; seconds?: number; meters?: number; side?: Side }): SetLog {
  n++
  return { id: `s${n}`, sessionId: 'q', exerciseId: 'x', blockId: 'b', setIndex: n, done: true, at: n, ...v }
}
const reps = (weight: number, ...r: number[]) => r.map((x) => set({ weight, reps: x }))

describe('nextDayId', () => {
  const days = ['A', 'B', 'C']
  it('starts at the first day', () => expect(nextDayId(days)).toBe('A'))
  it('advances after the last completed day', () => expect(nextDayId(days, 'A')).toBe('B'))
  it('wraps around', () => expect(nextDayId(days, 'C')).toBe('A'))
  it('falls back to the first day for an unknown id', () => expect(nextDayId(days, 'Z')).toBe('A'))
})

describe('training week math', () => {
  it('counts weeks from the first session, 1-based', () => {
    expect(trainingWeek(0, 0)).toBe(1)
    expect(trainingWeek(0, 7 * DAY - 1)).toBe(1)
    expect(trainingWeek(0, 7 * DAY)).toBe(2)
    expect(trainingWeek(0, 14 * DAY)).toBe(3)
  })
  it('return phase is weeks 1-2', () => {
    expect(isReturnPhase(2)).toBe(true)
    expect(isReturnPhase(3)).toBe(false)
  })
  it('deload every 7th week', () => {
    expect(isDeloadWeek(7)).toBe(true)
    expect(isDeloadWeek(14)).toBe(true)
    expect(isDeloadWeek(8)).toBe(false)
  })
  it('effective sets: 2 in return phase, ~60% in deload, untouched for warm-up', () => {
    expect(effectiveSets(blk({ sets: 3 }), 1)).toBe(2)
    expect(effectiveSets(blk({ sets: 3 }), 3)).toBe(3)
    expect(effectiveSets(blk({ sets: 3 }), 7)).toBe(2)
    expect(effectiveSets(blk({ sets: 4 }), 7)).toBe(3)
    expect(effectiveSets(blk({ sets: 1, section: 'warmup' }), 1)).toBe(1)
    expect(effectiveSets(blk({ sets: 1, section: 'cardio' }), 7)).toBe(1)
  })
})

describe('roundTo / e1rm', () => {
  it('rounds to the increment', () => {
    expect(roundTo(53.9, 2.5)).toBe(55)
    expect(roundTo(18.1, 2)).toBe(18)
  })
  it('estimates 1RM with Epley within 1-12 reps', () => {
    expect(e1rm(100, 1)).toBe(100)
    expect(e1rm(100, 10)).toBeCloseTo(133.3, 1)
    expect(e1rm(100, 13)).toBeUndefined()
    expect(e1rm(0, 5)).toBeUndefined()
  })
})

describe('suggest (double progression)', () => {
  it('first time: no weight, aim for repMin', () => {
    expect(suggest({ exercise: ex(), block: blk(), history: [] })).toEqual([{ target: 8, reason: 'first' }])
  })

  it('all sets at repMax → add increment, reset to repMin', () => {
    const [s] = suggest({ exercise: ex(), block: blk(), history: [reps(50, 10, 10, 10)] })
    expect(s).toEqual({ weight: 52.5, target: 8, reason: 'increase' })
  })

  it('partial → same weight, aim for weakest set + 1', () => {
    const [s] = suggest({ exercise: ex(), block: blk(), history: [reps(50, 10, 9, 8)] })
    expect(s).toEqual({ weight: 50, target: 9, reason: 'hold' })
  })

  it('below repMin twice in a row → −10% rounded to increment', () => {
    const [s] = suggest({ exercise: ex(), block: blk(), history: [reps(50, 8, 7, 6), reps(50, 8, 7, 7)] })
    expect(s).toEqual({ weight: 45, target: 8, reason: 'decrease' })
  })

  it('below repMin once → hold', () => {
    const [s] = suggest({ exercise: ex(), block: blk(), history: [reps(50, 8, 7, 6), reps(50, 9, 9, 8)] })
    expect(s?.reason).toBe('hold')
  })

  it('decrease always lowers by at least one increment', () => {
    const [s] = suggest({ exercise: ex({ increment: 2.5 }), block: blk(), history: [reps(10, 5), reps(10, 5)] })
    expect(s?.weight).toBe(7.5)
  })

  it('bodyweight exercise at repMax → +1 rep', () => {
    const e = ex({ increment: 0 })
    const h = [[set({ reps: 10 }), set({ reps: 10 })]]
    expect(suggest({ exercise: e, block: blk(), history: h })).toEqual([{ target: 11, reason: 'increase' }])
  })

  it('unilateral sides are evaluated independently', () => {
    const e = ex({ unilateral: true, increment: 2 })
    const h = [[
      set({ side: 'L', weight: 20, reps: 10 }), set({ side: 'R', weight: 20, reps: 10 }),
      set({ side: 'L', weight: 20, reps: 8 }), set({ side: 'R', weight: 20, reps: 10 }),
    ]]
    expect(suggest({ exercise: e, block: blk(), history: h })).toEqual([
      { side: 'L', weight: 20, target: 9, reason: 'hold' },
      { side: 'R', weight: 22, target: 8, reason: 'increase' },
    ])
  })

  it('unilateral first time gives one suggestion per side', () => {
    const e = ex({ unilateral: true })
    expect(suggest({ exercise: e, block: blk(), history: [] }).map((s) => s.side)).toEqual(['L', 'R'])
  })

  it('time metric without load → +5s at the top of the range', () => {
    const e = ex({ metric: 'time', increment: 0 })
    const b = blk({ repMin: 30, repMax: 60 })
    const h = [[set({ seconds: 60 }), set({ seconds: 62 })]]
    expect(suggest({ exercise: e, block: b, history: h })).toEqual([{ target: 65, reason: 'increase' }])
  })

  it('time metric with load (plate pinch) → heavier plate at the top', () => {
    const e = ex({ metric: 'time', increment: 2.5 })
    const b = blk({ repMin: 20, repMax: 30 })
    const h = [[set({ weight: 10, seconds: 30 }), set({ weight: 10, seconds: 31 })]]
    expect(suggest({ exercise: e, block: b, history: h })).toEqual([{ weight: 12.5, target: 20, reason: 'increase' }])
  })

  it('distance metric (farmer walk) → heavier at full distance', () => {
    const e = ex({ metric: 'distance', increment: 2 })
    const b = blk({ repMin: 30, repMax: 30 })
    const h = [[set({ weight: 20, meters: 30 })]]
    expect(suggest({ exercise: e, block: b, history: h })).toEqual([{ weight: 22, target: 30, reason: 'increase' }])
  })

  it('cardio → hold target minutes', () => {
    const e = ex({ metric: 'cardio', increment: 0 })
    const b = blk({ repMin: 20, repMax: 20, sets: 1 })
    const h = [[set({ seconds: 1200 })]]
    expect(suggest({ exercise: e, block: b, history: h })).toEqual([{ target: 20, reason: 'hold' }])
  })

  it('ignores empty sessions in history', () => {
    const [s] = suggest({ exercise: ex(), block: blk(), history: [[], reps(50, 10, 10)] })
    expect(s?.reason).toBe('increase')
  })
})
