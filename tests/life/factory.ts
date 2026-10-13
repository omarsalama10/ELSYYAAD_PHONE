import type { Commitment, LifeSettings, Task } from '../../src/life/domain/types'
import { DEFAULT_SETTINGS } from '../../src/life/domain/types'
import { at } from '../../src/life/domain/time'

let n = 0
export function task(over: Partial<Task> = {}): Task {
  n++
  return {
    id: over.id ?? `t${n}`,
    title: over.title ?? `مهمة ${n}`,
    links: [], tags: [], importance: 3, status: 'new', progress: 0, confidence: 'firm', energy: 'routine',
    dependsOn: [], checklist: [], postponeCount: 0, actualMin: 0, createdAt: n, updatedAt: n,
    ...over,
  }
}

export function commitment(over: Partial<Commitment> & Pick<Commitment, 'startMin' | 'endMin'>): Commitment {
  n++
  return { id: `c${n}`, title: 'التزام', kind: 'work', repeat: { type: 'daily' }, skipDays: [], createdAt: 0, ...over }
}

export const settings = (over: Partial<LifeSettings> = {}): LifeSettings => ({
  ...DEFAULT_SETTINGS, bufferPct: 0, gapMin: 0, planHorizonDays: 7, ...over,
})

/** Monday 2026-10-12 at hh:mm local time. */
export const MON = '2026-10-12'
export const time = (hh: number, mm = 0, day = MON) => at(day, hh * 60 + mm)
