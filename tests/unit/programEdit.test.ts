import { describe, expect, it } from 'vitest'
import { addBlock, moveBlock, normalizeGroups, removeBlock, toggleSupersetWithPrev, updateBlock } from '../../src/domain/programEdit'
import type { Block, Program } from '../../src/domain/types'

const b = (id: string, over: Partial<Block> = {}): Block => ({ id, exerciseId: id, sets: 3, repMin: 8, repMax: 10, restSec: 60, section: 'main', ...over })
const prog = (blocks: Block[]): Program => ({ id: 'p', name: 'p', active: 1, createdAt: 0, days: [{ id: 'A', name: 'A', blocks }] })
const ids = (p: Program) => p.days[0]!.blocks.map((x) => x.id)
const blocks = (p: Program) => p.days[0]!.blocks

describe('programEdit', () => {
  it('updates a block', () => {
    expect(blocks(updateBlock(prog([b('x')]), 'A', 'x', { sets: 4 }))[0]?.sets).toBe(4)
  })

  it('moves within a section only', () => {
    const p = prog([b('w', { section: 'warmup' }), b('x'), b('y')])
    expect(ids(moveBlock(p, 'A', 'y', -1))).toEqual(['w', 'y', 'x'])
    expect(ids(moveBlock(p, 'A', 'x', -1))).toEqual(['w', 'x', 'y'])
    expect(ids(moveBlock(p, 'A', 'y', 1))).toEqual(['w', 'x', 'y'])
  })

  it('removing a superset partner ungroups the survivor', () => {
    const p = prog([b('x', { group: 'g' }), b('y', { group: 'g' })])
    expect(blocks(removeBlock(p, 'A', 'y'))[0]?.group).toBeUndefined()
  })

  it('adds to the end of its section, or creates the section in order', () => {
    const p = prog([b('w', { section: 'warmup' }), b('x'), b('c', { section: 'cardio' })])
    expect(ids(addBlock(p, 'A', 'main', b('n')))).toEqual(['w', 'x', 'n', 'c'])
    expect(ids(addBlock(p, 'A', 'finisher', b('f')))).toEqual(['w', 'x', 'f', 'c'])
    expect(ids(addBlock(prog([]), 'A', 'main', b('n')))).toEqual(['n'])
  })

  it('links and unlinks with the previous block', () => {
    const p = prog([b('x'), b('y'), b('z')])
    const linked = toggleSupersetWithPrev(p, 'A', 'y', 'k')
    expect(blocks(linked).map((x) => x.group)).toEqual(['k', 'k', undefined])
    const tri = toggleSupersetWithPrev(linked, 'A', 'z', 'k2')
    expect(blocks(tri).map((x) => x.group)).toEqual(['k', 'k', 'k'])
    const un = toggleSupersetWithPrev(linked, 'A', 'y', 'k3')
    expect(blocks(un).map((x) => x.group)).toEqual([undefined, undefined, undefined])
  })

  it('moving breaks non-contiguous groups', () => {
    const p = prog([b('x', { group: 'g' }), b('y', { group: 'g' }), b('z')])
    expect(blocks(moveBlock(p, 'A', 'z', -1)).map((x) => x.group)).toEqual([undefined, undefined, undefined])
  })

  it('normalizeGroups keeps contiguous pairs', () => {
    expect(normalizeGroups([b('x', { group: 'g' }), b('y', { group: 'g' })]).map((x) => x.group)).toEqual(['g', 'g'])
  })
})
