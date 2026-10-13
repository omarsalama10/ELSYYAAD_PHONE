import { describe, expect, it } from 'vitest'
import { buildProgram, CANDIDATES, estimateDayMinutes, FALLBACK, type BuilderInput, type Equipment, type Limitation } from '../../src/domain/builder'
import { CATALOG } from '../../src/data/catalog'

const catalog = new Map(CATALOG.map((e) => [e.id, e]))
const base: BuilderInput = { goal: 'hypertrophy', experience: 'intermediate', days: 3, minutes: 75, equipment: 'gym', focus: [], limitations: [], posture: true, cardio: true }
const ids = (p: ReturnType<typeof buildProgram>) => p.days.flatMap((d) => d.blocks.map((b) => b.exerciseId))

describe('buildProgram', () => {
  it('every candidate exercise exists in the catalog', () => {
    const all = [...Object.values(CANDIDATES), ...Object.values(FALLBACK)].flatMap((byEq) => Object.values(byEq!).flat())
    for (const id of all) expect(catalog.has(id), id).toBe(true)
  })

  it('forearm work comes after the main and accessory lifts', () => {
    const p = buildProgram({ ...base, focus: ['forearms'] }, catalog, 1)
    for (const d of p.days) {
      const sections = d.blocks.filter((b) => b.section !== 'warmup').map((b) => b.section)
      expect(sections.join(','), d.name).toMatch(/^(main,)*main(,finisher)*(,cardio)?$/)
      const firstForearm = d.blocks.findIndex((b) => catalog.get(b.exerciseId)!.muscles[0] === 'forearms')
      if (firstForearm >= 0) expect(d.blocks[firstForearm]!.section, d.name).toBe('finisher')
    }
  })

  it('is deterministic', () => {
    expect(buildProgram(base, catalog, 1)).toEqual(buildProgram(base, catalog, 1))
  })

  for (const days of [2, 3, 4, 5, 6])
    for (const equipment of ['gym', 'dumbbells', 'bodyweight'] as Equipment[])
      it(`${days} days / ${equipment}: valid, within time, only catalog exercises`, () => {
        const p = buildProgram({ ...base, days, equipment }, catalog, 1)
        expect(p.days).toHaveLength(days)
        for (const d of p.days) {
          expect(d.blocks.filter((b) => b.section === 'main').length, d.name).toBeGreaterThanOrEqual(2)
          expect(estimateDayMinutes(d, catalog), d.name).toBeLessThanOrEqual(base.minutes * 1.15)
          for (const b of d.blocks) {
            expect(catalog.has(b.exerciseId), b.exerciseId).toBe(true)
            expect(b.repMin).toBeLessThanOrEqual(b.repMax)
          }
          const dayIds = d.blocks.filter((b) => b.section !== 'warmup').map((b) => b.exerciseId)
          expect(new Set(dayIds).size, `${d.name} duplicates`).toBe(dayIds.length)
        }
      })

  it('bodyweight programs use no gym machines', () => {
    const p = buildProgram({ ...base, equipment: 'bodyweight' }, catalog, 1)
    for (const id of ids(p)) {
      const eq = catalog.get(id)!.equipment
      if (id === 'Walking_Treadmill') continue
      expect(['machine', 'cable', 'barbell'], id).not.toContain(eq)
    }
  })

  for (const lim of ['knee', 'lowerback', 'shoulder'] as Limitation[])
    it(`respects the ${lim} limitation`, () => {
      const p = buildProgram({ ...base, days: 4, limitations: [lim] }, catalog, 1)
      const banned = { knee: ['Barbell_Squat', 'Hack_Squat', 'Split_Squat_with_Dumbbells'], lowerback: ['Romanian_Deadlift', 'Barbell_Squat'], shoulder: ['Barbell_Shoulder_Press', 'Dips_-_Chest_Version'] }[lim]
      for (const id of banned) expect(ids(p)).not.toContain(id)
      expect(p.days.every((d) => d.blocks.some((b) => b.section === 'main'))).toBe(true)
    })

  it('posture: pulling sets ≥ pushing sets', () => {
    const p = buildProgram({ ...base, days: 4 }, catalog, 1)
    let pull = 0, push = 0
    for (const d of p.days) for (const b of d.blocks) {
      const m = catalog.get(b.exerciseId)!.muscles[0]
      if (b.section === 'warmup') continue
      if (m === 'lats' || m === 'middle back' || b.exerciseId === 'Face_Pull' || b.exerciseId === 'Reverse_Flyes') pull += b.sets
      if (m === 'chest') push += b.sets
    }
    expect(pull).toBeGreaterThanOrEqual(push)
  })

  it('forearm focus adds forearm work on most days', () => {
    const p = buildProgram({ ...base, focus: ['forearms'] }, catalog, 1)
    const daysWithForearms = p.days.filter((d) => d.blocks.some((b) => catalog.get(b.exerciseId)!.muscles[0] === 'forearms'))
    expect(daysWithForearms.length).toBeGreaterThanOrEqual(2)
  })

  it('strength goal uses low reps and long rest on main lifts', () => {
    const p = buildProgram({ ...base, goal: 'strength' }, catalog, 1)
    const main = p.days[0]!.blocks.find((b) => b.section === 'main')!
    expect(main).toMatchObject({ repMin: 4, repMax: 6, restSec: 180 })
  })

  it('short sessions drop accessories, keep mains', () => {
    const short = buildProgram({ ...base, minutes: 45, cardio: false }, catalog, 1)
    const long = buildProgram({ ...base, minutes: 90, cardio: false }, catalog, 1)
    expect(short.days[0]!.blocks.length).toBeLessThan(long.days[0]!.blocks.length)
    expect(short.days[0]!.blocks.filter((b) => b.section === 'main').length).toBeGreaterThanOrEqual(3)
  })
})
