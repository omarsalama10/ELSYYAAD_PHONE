import { describe, expect, it } from 'vitest'
import { buildCsvFiles, toCsv } from '../../src/domain/exportData'

describe('toCsv', () => {
  it('escapes commas, quotes and newlines and starts with a BOM', () => {
    const csv = toCsv(['a', 'b'], [['x,y', 'he said "hi"'], [undefined, 3]])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('"x,y","he said ""hi"""')
    expect(csv).toContain('\r\n,3\r\n')
  })
})

describe('buildCsvFiles', () => {
  it('exports only finished sessions and their done sets', () => {
    const files = buildCsvFiles({
      exercises: new Map([['x', { id: 'x', name: 'Bench', nameAr: 'بنش', muscles: [], equipment: '', metric: 'reps', unilateral: false, images: [], cuesAr: [], instructions: [], custom: false, increment: 2.5 }]]),
      programs: [{ id: 'p', name: 'p', active: 1, createdAt: 0, days: [{ id: 'A', name: 'يوم A', blocks: [] }] }],
      sessions: [{ id: 's1', programId: 'p', dayId: 'A', startedAt: 0, finishedAt: 3_600_000 }, { id: 's2', programId: 'p', dayId: 'A', startedAt: 5 }],
      sets: [
        { id: '1', sessionId: 's1', exerciseId: 'x', blockId: 'b', setIndex: 0, weight: 60, reps: 8, rpe: 8, done: true, at: 1 },
        { id: '2', sessionId: 's1', exerciseId: 'x', blockId: 'b', setIndex: 1, done: false, at: 2 },
        { id: '3', sessionId: 's2', exerciseId: 'x', blockId: 'b', setIndex: 0, weight: 99, reps: 1, done: true, at: 3 },
      ],
      inbody: [], tape: [], checkins: [], meals: [], weights: [{ id: '2026-10-13', kg: 68, at: 0 }],
    })
    expect(files['sessions.csv']!.trim().split('\r\n')).toHaveLength(2)
    const sets = files['sets.csv']!.trim().split('\r\n')
    expect(sets).toHaveLength(2)
    expect(sets[1]).toContain('Bench,1,,60,8,,,8')
    expect(files['weights.csv']).toContain('2026-10-13,68')
  })
})

describe('buildAiSummary', () => {
  it('produces a pasteable markdown summary with a closing prompt', async () => {
    const { buildAiSummary } = await import('../../src/domain/aiSummary')
    const text = buildAiSummary({
      generatedAt: '2026-10-13', profile: { age: 21, heightCm: 178, goal: 'تضخيم نضيف' }, weightKg: 68, weightRatePerWeek: 0.21,
      sessionsLast28: 10, weeklySetsByMuscle: { صدر: 9 }, exercises: [], nutrition: { avgKcal7: 2500, avgProtein7: 120, targetKcal: 2600, targetProtein: 136 },
    })
    expect(text).toContain('# ملخص تمريني')
    expect(text).toContain('+0.21 كجم/أسبوع')
    expect(text).toContain('صدر 9')
    expect(text).toContain('حلّل تقدمي')
  })
})
