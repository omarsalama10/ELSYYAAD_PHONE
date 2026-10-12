import { describe, expect, it } from 'vitest'
import { summarizeWeek } from '../../src/domain/weekly'
import type { Exercise, Session, SetLog } from '../../src/domain/types'

const DAY = 86_400_000
const ex = (id: string, over: Partial<Exercise> = {}): Exercise => ({
  id, name: id, nameAr: id, muscles: ['chest'], equipment: 'x', metric: 'reps', unilateral: false,
  images: [], cuesAr: [], instructions: [], custom: false, increment: 2.5, ...over,
})
let n = 0
const set = (sessionId: string, exerciseId: string, v: Partial<SetLog>): SetLog =>
  ({ id: `s${++n}`, sessionId, exerciseId, blockId: 'b', setIndex: n, done: true, at: n, ...v })

describe('summarizeWeek', () => {
  const exercises = new Map([['bench', ex('bench')], ['walk', ex('walk', { metric: 'cardio' })], ['row', ex('row', { unilateral: true })]])
  const sessions: Session[] = [
    { id: 'a', programId: 'p', dayId: 'A', startedAt: 0, finishedAt: 60 * 60_000 },
    { id: 'b', programId: 'p', dayId: 'B', startedAt: 2 * DAY, finishedAt: 2 * DAY + 30 * 60_000 },
    { id: 'old', programId: 'p', dayId: 'C', startedAt: -DAY, finishedAt: -DAY + 1 },
    { id: 'open', programId: 'p', dayId: 'C', startedAt: 3 * DAY },
  ]
  const sets = [
    set('a', 'bench', { weight: 50, reps: 10 }), set('a', 'bench', { weight: 50, reps: 8 }),
    set('a', 'walk', { seconds: 1200 }),
    set('b', 'row', { side: 'L', weight: 20, reps: 10 }), set('b', 'row', { side: 'R', weight: 20, reps: 10 }),
    set('b', 'bench', { weight: 50, reps: 5, done: false }),
    set('old', 'bench', { weight: 99, reps: 1 }), set('open', 'bench', { weight: 99, reps: 1 }),
  ]

  it('counts only finished sessions inside the week', () => {
    const w = summarizeWeek(0, sessions, sets, exercises)
    expect(w.sessions).toBe(2)
    expect(w.minutes).toBe(90)
  })

  it('aggregates sets, volume, cardio and per-day bars', () => {
    const w = summarizeWeek(0, sessions, sets, exercises)
    expect(w.sets).toBe(3)
    expect(w.volume).toBe(50 * 10 + 50 * 8 + 20 * 10 * 2)
    expect(w.cardioMinutes).toBe(20)
    expect(w.perDay).toEqual([2, 0, 1, 0, 0, 0, 0])
  })
})
