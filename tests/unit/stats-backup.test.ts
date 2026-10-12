import { describe, expect, it } from 'vitest'
import { asymmetryPct, bestPerSession, sideTotals, weeklySetsByMuscle } from '../../src/domain/stats'
import { BACKUP_VERSION, validateBackup } from '../../src/domain/backup'
import type { Exercise, SetLog } from '../../src/domain/types'

function ex(over: Partial<Exercise> = {}): Exercise {
  return {
    id: 'x', name: 'X', nameAr: 'x', muscles: ['chest', 'triceps'], equipment: 'barbell', metric: 'reps',
    unilateral: false, images: [], cuesAr: [], instructions: [], custom: false, increment: 2.5, ...over,
  }
}
let n = 0
const s = (v: Partial<SetLog>): SetLog => ({ id: `s${++n}`, sessionId: 'q', exerciseId: 'x', blockId: 'b', setIndex: n, done: true, at: n, ...v })

describe('weeklySetsByMuscle', () => {
  it('counts done sets by primary muscle, unilateral pairs once', () => {
    const map = new Map([
      ['x', ex()],
      ['row', ex({ id: 'row', muscles: ['middle back'], unilateral: true })],
    ])
    const sets = [
      s({ reps: 8 }), s({ reps: 8 }), s({ reps: 8, done: false }),
      s({ exerciseId: 'row', side: 'L', reps: 10 }), s({ exerciseId: 'row', side: 'R', reps: 10 }),
    ]
    expect(weeklySetsByMuscle(sets, map)).toEqual({ chest: 2, 'middle back': 1 })
  })
})

describe('sideTotals / asymmetryPct', () => {
  it('sums volume per side', () => {
    const e = ex({ unilateral: true })
    const sets = [s({ side: 'L', weight: 20, reps: 10 }), s({ side: 'R', weight: 20, reps: 8 }), s({ side: 'R', weight: 20, reps: 8 })]
    expect(sideTotals(e, sets)).toEqual({ L: 200, R: 320 })
  })
  it('uses raw values when no load', () => {
    const e = ex({ unilateral: true, metric: 'time' })
    expect(sideTotals(e, [s({ side: 'L', seconds: 30 }), s({ side: 'R', seconds: 40 })])).toEqual({ L: 30, R: 40 })
  })
  it('asymmetry is relative to the stronger side', () => {
    expect(asymmetryPct(80, 100)).toBe(20)
    expect(asymmetryPct(0, 0)).toBe(0)
  })
})

describe('bestPerSession', () => {
  it('uses e1RM for loaded reps, raw best otherwise', () => {
    const e = ex()
    const pts = bestPerSession(e, [
      { at: 1, sets: [s({ weight: 100, reps: 1 }), s({ weight: 90, reps: 10 })] },
      { at: 2, sets: [] },
    ])
    expect(pts).toEqual([{ x: 1, y: 120 }])
    const plank = ex({ metric: 'time' })
    expect(bestPerSession(plank, [{ at: 5, sets: [s({ seconds: 40 }), s({ seconds: 55 })] }])).toEqual([{ x: 5, y: 55 }])
  })
})

describe('validateBackup', () => {
  const ok = { version: BACKUP_VERSION, exportedAt: 1, programs: [], sessions: [], sets: [], inbody: [], tape: [], settings: [], media: [], checkins: [], foods: [], meals: [], days: [], weights: [] }
  it('accepts a well-formed backup', () => {
    expect(validateBackup(ok)).toEqual(ok)
  })
  it('upgrades v1 backups (no check-ins) transparently', () => {
    const { checkins: _c, foods: _f, meals: _m, days: _d, weights: _w, ...v1 } = { ...ok, version: 1 }
    expect(validateBackup(v1)).toMatchObject({ version: BACKUP_VERSION, checkins: [], meals: [], weights: [] })
  })
  it('rejects wrong version', () => {
    expect(() => validateBackup({ ...ok, version: 99 })).toThrow()
  })
  it('rejects missing tables', () => {
    const { sets: _omit, ...bad } = ok
    expect(() => validateBackup(bad)).toThrow()
  })
  it('rejects non-objects', () => {
    expect(() => validateBackup(null)).toThrow()
    expect(() => validateBackup('x')).toThrow()
  })
  it('rejects rows without id', () => {
    expect(() => validateBackup({ ...ok, sessions: [{ dayId: 'A' }] })).toThrow()
  })
})
