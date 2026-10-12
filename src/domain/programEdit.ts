import type { Block, Program, Section } from './types'

/** Immutable edits on one day of a program. All return a new Program. */
function mapDay(p: Program, dayId: string, fn: (blocks: Block[]) => Block[]): Program {
  return { ...p, days: p.days.map((d) => (d.id === dayId ? { ...d, blocks: normalizeGroups(fn(d.blocks)) } : d)) }
}

/** A superset group must be contiguous with ≥2 members; anything else is ungrouped. */
export function normalizeGroups(blocks: Block[]): Block[] {
  return blocks.map((b, i) => {
    if (!b.group) return b
    const linked = blocks[i - 1]?.group === b.group || blocks[i + 1]?.group === b.group
    if (linked) return b
    const { group: _drop, ...rest } = b
    return rest
  })
}

export function updateBlock(p: Program, dayId: string, blockId: string, patch: Partial<Block>): Program {
  return mapDay(p, dayId, (bs) => bs.map((b) => (b.id === blockId ? { ...b, ...patch } : b)))
}

export function removeBlock(p: Program, dayId: string, blockId: string): Program {
  return mapDay(p, dayId, (bs) => bs.filter((b) => b.id !== blockId))
}

/** Moves within the block's own section; no-op at the edges. */
export function moveBlock(p: Program, dayId: string, blockId: string, dir: -1 | 1): Program {
  return mapDay(p, dayId, (bs) => {
    const i = bs.findIndex((b) => b.id === blockId)
    const j = i + dir
    const a = bs[i], b = bs[j]
    if (!a || !b || a.section !== b.section) return bs
    const out = [...bs]
    out[i] = b
    out[j] = a
    return out
  })
}

export function addBlock(p: Program, dayId: string, section: Section, block: Block): Program {
  return mapDay(p, dayId, (bs) => {
    let at = -1
    bs.forEach((b, i) => { if (b.section === section) at = i })
    if (at < 0) {
      const order: Section[] = ['warmup', 'main', 'finisher', 'cardio']
      const after = order.indexOf(section)
      at = bs.findIndex((b) => order.indexOf(b.section) > after) - 1
      if (at < -1) at = bs.length - 1
    }
    const out = [...bs]
    out.splice(at + 1, 0, { ...block, section })
    return out
  })
}

/** Links a block with the one before it (same section) or unlinks it. */
export function toggleSupersetWithPrev(p: Program, dayId: string, blockId: string, newKey: string): Program {
  return mapDay(p, dayId, (bs) => {
    const i = bs.findIndex((b) => b.id === blockId)
    const cur = bs[i], prev = bs[i - 1]
    if (!cur || !prev || prev.section !== cur.section) return bs
    const out = [...bs]
    if (cur.group && cur.group === prev.group) {
      const { group: _g, ...rest } = cur
      out[i] = rest
      // members after this one keep their own link with each other
      return out
    }
    const key = prev.group ?? newKey
    out[i - 1] = { ...prev, group: key }
    out[i] = { ...cur, group: key }
    return out
  })
}
