import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CATALOG, META } from '../../src/data/catalog'
import raw from '../../src/data/catalog.json'
import { createDefaultProgram } from '../../src/data/defaultProgram'

const byId = new Map(CATALOG.map((e) => [e.id, e]))
const program = createDefaultProgram(0)

describe('catalog', () => {
  it('has unique ids', () => {
    expect(byId.size).toBe(CATALOG.length)
  })

  it('has Arabic name and cues for every exercise', () => {
    for (const e of CATALOG) {
      expect(e.nameAr, e.id).toBeTruthy()
      expect(e.cuesAr.length, e.id).toBeGreaterThan(0)
    }
  })

  it('has no META entries without a catalog source', () => {
    const rawIds = new Set((raw as { id: string }[]).map((r) => r.id))
    for (const id of Object.keys(META)) expect(rawIds.has(id), id).toBe(true)
  })

  it('ships every referenced image', () => {
    for (const e of CATALOG) {
      for (const img of e.images) expect(existsSync(`public/${img}`), img).toBe(true)
    }
  })
})

describe('default program', () => {
  it('has days A, B, C', () => {
    expect(program.days.map((d) => d.id)).toEqual(['A', 'B', 'C'])
  })

  it('references only catalog exercises', () => {
    for (const d of program.days)
      for (const b of d.blocks) expect(byId.has(b.exerciseId), b.exerciseId).toBe(true)
  })

  it('has unique block ids', () => {
    const ids = program.days.flatMap((d) => d.blocks.map((b) => b.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('logs the unilateral leg and row work per side', () => {
    for (const id of ['Single-Leg_Leg_Extension', 'Split_Squat_with_Dumbbells', 'single_leg_press', 'One-Arm_Dumbbell_Row'])
      expect(byId.get(id)?.unilateral, id).toBe(true)
  })

  it('starts with the warm-up and ends with cardio every day', () => {
    for (const d of program.days) {
      expect(d.blocks[0]?.section).toBe('warmup')
      expect(d.blocks.at(-1)?.section).toBe('cardio')
    }
  })

  it('keeps rep ranges valid', () => {
    for (const d of program.days)
      for (const b of d.blocks) {
        expect(b.sets, b.id).toBeGreaterThan(0)
        expect(b.repMin, b.id).toBeLessThanOrEqual(b.repMax)
      }
  })

  it('has pull volume at least equal to push volume (posture)', () => {
    const pull = new Set(['lats', 'middle back'])
    const push = new Set(['chest'])
    let p = 0, q = 0
    for (const d of program.days)
      for (const b of d.blocks.filter((x) => x.section === 'main')) {
        const m = byId.get(b.exerciseId)!.muscles[0]!
        if (pull.has(m)) p += b.sets
        if (push.has(m)) q += b.sets
      }
    expect(p).toBeGreaterThanOrEqual(q)
  })
})
