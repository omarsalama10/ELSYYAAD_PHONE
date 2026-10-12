import { describe, expect, it } from 'vitest'
import { applyReadiness, readinessAdvice, readinessScore } from '../../src/domain/readiness'
import { isNewRecord, personalRecords } from '../../src/domain/records'
import { analyzeProgress } from '../../src/domain/plateau'
import { computeAchievements, weeklyStreak } from '../../src/domain/achievements'
import type { CheckIn, Exercise, SetLog } from '../../src/domain/types'

const DAY = 86_400_000
const ex = (over: Partial<Exercise> = {}): Exercise => ({
  id: 'x', name: 'X', nameAr: 'إكس', muscles: ['chest'], equipment: 'barbell', metric: 'reps', unilateral: false,
  images: [], cuesAr: [], instructions: [], custom: false, increment: 2.5, ...over,
})
let n = 0
const set = (v: Partial<SetLog>): SetLog => ({ id: `s${++n}`, sessionId: 'q', exerciseId: 'x', blockId: 'b', setIndex: n, done: true, at: n, ...v })
const ci = (over: Partial<CheckIn> = {}): CheckIn => ({ id: '2026-10-13', sleepHours: 8, sleepQuality: 4, stress: 2, soreness: 2, fatigue: 2, pain: false, at: 0, ...over })

describe('readiness', () => {
  it('scores a great day high and a terrible day low', () => {
    expect(readinessScore(ci({ sleepHours: 8, sleepQuality: 5, stress: 1, soreness: 1, fatigue: 1 }))).toBe(100)
    expect(readinessScore(ci({ sleepHours: 4, sleepQuality: 1, stress: 5, soreness: 5, fatigue: 5 }))).toBe(0)
  })
  it('maps score to advice levels and adds pain warning', () => {
    expect(readinessAdvice(80, false).adjust).toBe('push')
    expect(readinessAdvice(60, false).adjust).toBe('normal')
    expect(readinessAdvice(40, false).adjust).toBe('hold')
    expect(readinessAdvice(20, false).adjust).toBe('reduce')
    expect(readinessAdvice(80, true).text).toContain('ألم')
  })
  it('hold turns an increase into a hold at the last weight, with a note', () => {
    const s = applyReadiness({ weight: 52.5, target: 8, reason: 'increase' }, 'hold', ex(), 50)
    expect(s).toMatchObject({ weight: 50, reason: 'hold' })
    expect(s.note).toBeTruthy()
  })
  it('reduce lowers load ~10% rounded to the increment', () => {
    expect(applyReadiness({ weight: 50, target: 9, reason: 'hold' }, 'reduce', ex(), 50)).toMatchObject({ weight: 45, reason: 'decrease' })
  })
  it('leaves first-time and bodyweight suggestions alone', () => {
    expect(applyReadiness({ target: 8, reason: 'first' }, 'reduce', ex(), undefined)).toEqual({ target: 8, reason: 'first' })
  })
})

describe('records', () => {
  const history = [{ at: 1, sets: [set({ weight: 60, reps: 10 }), set({ weight: 70, reps: 5 })] }]
  it('finds best e1RM, heaviest weight', () => {
    const r = personalRecords(ex(), history)
    expect(r.e1rm?.value).toBe(81.7)
    expect(r.weight?.value).toBe(70)
  })
  it('flags a set that beats prior e1RM', () => {
    expect(isNewRecord(ex(), history.flatMap((h) => h.sets), set({ weight: 72.5, reps: 5 }))?.kind).toBe('weight')
    expect(isNewRecord(ex(), history.flatMap((h) => h.sets), set({ weight: 65, reps: 10 }))?.kind).toBe('e1rm')
    expect(isNewRecord(ex(), history.flatMap((h) => h.sets), set({ weight: 60, reps: 8 }))).toBeUndefined()
  })
  it('first ever set is not celebrated as a record', () => {
    expect(isNewRecord(ex(), [], set({ weight: 60, reps: 8 }))).toBeUndefined()
  })
  it('unloaded exercises use the raw value', () => {
    const plank = ex({ metric: 'time', increment: 0 })
    expect(isNewRecord(plank, [set({ seconds: 40 })], set({ seconds: 45 }))?.kind).toBe('value')
  })
})

describe('analyzeProgress', () => {
  const pts = (...ys: number[]) => ys.map((y, i) => ({ x: i * 2 * DAY, y }))
  it('needs at least 4 sessions', () => {
    expect(analyzeProgress({ points: pts(1, 2, 3) }).status).toBe('insufficient')
  })
  it('detects progress with % gain', () => {
    const a = analyzeProgress({ points: pts(80, 82, 84, 88) })
    expect(a.status).toBe('progressing')
    expect(a.why).toContain('10')
  })
  it('detects a plateau and suggests an alternative when recovery is fine', () => {
    const a = analyzeProgress({ points: pts(80, 90, 89, 90, 88), alternatives: ['هاك سكوات'] })
    expect(a.status).toBe('plateau')
    expect(a.recommendation).toContain('هاك سكوات')
  })
  it('prefers a deload when RPE is high', () => {
    const a = analyzeProgress({ points: pts(80, 90, 89, 90, 88), avgRpe: 9.3 })
    expect(a.recommendation).toContain('10%')
  })
  it('blames recovery when readiness is low', () => {
    const a = analyzeProgress({ points: pts(80, 90, 89, 90, 88), avgReadiness: 40 })
    expect(a.recommendation).toContain('نوم')
  })
  it('detects regression', () => {
    expect(analyzeProgress({ points: pts(80, 90, 88, 84) }).status).toBe('regressing')
  })
})

describe('achievements', () => {
  const sat = new Date(2026, 9, 10).getTime() // Saturday 10 Oct 2026
  it('counts consecutive weeks with 3+ sessions', () => {
    const starts = [0, 1, 2, 7, 8, 9, 14, 15].map((d) => sat + d * DAY + 3600_000)
    expect(weeklyStreak(starts, sat + 16 * DAY)).toBe(2) // current week has 2 so far → streak of the 2 completed weeks
    const full = [...starts, sat + 16 * DAY]
    expect(weeklyStreak(full, sat + 16 * DAY)).toBe(3)
  })
  it('unlocks milestones and reports progress', () => {
    const list = computeAchievements({ sessionStarts: [sat], prCount: 1, inbodyCount: 0, checkinDates: [], now: sat })
    expect(list.find((a) => a.id === 'sessions-1')?.unlocked).toBe(true)
    expect(list.find((a) => a.id === 'sessions-10')?.progress).toBeCloseTo(0.1)
    expect(list.find((a) => a.id === 'pr-1')?.unlocked).toBe(true)
    expect(list.find((a) => a.id === 'inbody-1')?.unlocked).toBe(false)
  })
})
