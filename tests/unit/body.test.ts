import { describe, expect, it } from 'vitest'
import { bmi, bmiCategory, fatFreeMass, projectGoal, weeklySlope } from '../../src/domain/body'

const NOW = new Date('2026-10-13T12:00:00').getTime()
const series = (start: string, values: number[], everyDays = 7) => values.map((value, i) => {
  const d = new Date(new Date(`${start}T12:00:00`).getTime() + i * everyDays * 86_400_000)
  return { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, value }
})

describe('body metrics', () => {
  it('computes BMI and category', () => {
    expect(bmi(68, 178)).toBe(21.5)
    expect(bmiCategory(21.5)).toBe('طبيعي')
    expect(bmiCategory(26)).toBe('وزن زايد')
  })
  it('fat-free mass from fat mass or %', () => {
    expect(fatFreeMass(70, { bfm: 14 })).toBe(56)
    expect(fatFreeMass(70, { pbf: 20 })).toBe(56)
    expect(fatFreeMass(70, {})).toBeUndefined()
  })
})

describe('weeklySlope', () => {
  it('fits kg/week', () => {
    expect(weeklySlope(series('2026-09-01', [68, 68.3, 68.6, 68.9]))).toBeCloseTo(0.3, 2)
  })
  it('needs 3 points over 2 weeks', () => {
    expect(weeklySlope(series('2026-09-01', [68, 69]))).toBeUndefined()
    expect(weeklySlope(series('2026-09-01', [68, 68.1, 68.2], 2))).toBeUndefined()
  })
})

describe('projectGoal', () => {
  it('projects an ETA when moving toward the target', () => {
    const p = projectGoal(series('2026-09-01', [68, 68.3, 68.6, 68.9]), 72, NOW, 'كجم')
    expect(p.status).toBe('on-track')
    expect(p.weeks).toBe(11) // 3.1 kg / 0.3
  })
  it('flags the wrong direction', () => {
    expect(projectGoal(series('2026-09-01', [22, 22.4, 22.8, 23.2]), 15, NOW, '%').status).toBe('wrong-way')
  })
  it('reports reached and insufficient', () => {
    expect(projectGoal(series('2026-09-01', [71.9]), 72, NOW, 'كجم').status).toBe('reached')
    expect(projectGoal(series('2026-09-01', [68, 69]), 75, NOW, 'كجم').status).toBe('insufficient')
  })
  it('overshooting the target counts as reached', () => {
    expect(projectGoal(series('2026-09-01', [68, 70, 72.5]), 72, NOW, 'كجم').status).toBe('reached')
  })
  it('flat trend never reaches', () => {
    expect(projectGoal(series('2026-09-01', [68, 68, 68.01, 68]), 72, NOW, 'كجم').status).toBe('flat')
  })
})
