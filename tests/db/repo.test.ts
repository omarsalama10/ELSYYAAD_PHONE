import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/db/db'
import { ensureSeeded } from '../../src/db/seed'
import {
  discardSession, exerciseHistory, finishSession, getActiveProgram, getActiveSession, getMedia,
  lastCompletedSession, putMedia, saveInBody, startSession, upsertSet, listInBody, uid,
} from '../../src/db/repo'
import { exportBackup, importBackup } from '../../src/db/backup'
import { nextDayId } from '../../src/domain/rotation'
import { CATALOG } from '../../src/data/catalog'
import type { SetLog } from '../../src/domain/types'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSeeded(0)
})

function logSet(sessionId: string, exerciseId: string, i: number, v: Partial<SetLog>): SetLog {
  return { id: uid(), sessionId, exerciseId, blockId: 'b', setIndex: i, done: true, at: i, ...v }
}

describe('seed', () => {
  it('is idempotent and seeds catalog + one active program', async () => {
    await ensureSeeded(1)
    expect(await db.exercises.count()).toBe(CATALOG.length)
    expect(await db.programs.count()).toBe(1)
    expect((await getActiveProgram())?.days.length).toBe(3)
  })
})

describe('session lifecycle', () => {
  it('resumes an open session instead of creating a second one', async () => {
    const a = await startSession('p', 'A', 1)
    const b = await startSession('p', 'B', 2)
    expect(b.id).toBe(a.id)
  })

  it('finishing drops undone sets and feeds rotation', async () => {
    const s = await startSession('p', 'A', 1)
    await upsertSet(logSet(s.id, 'Hack_Squat', 0, { weight: 60, reps: 10 }))
    await upsertSet(logSet(s.id, 'Hack_Squat', 1, { weight: 60, reps: 10, done: false }))
    await finishSession(s.id, 5)
    expect(await getActiveSession()).toBeUndefined()
    expect(await db.sets.count()).toBe(1)
    const last = await lastCompletedSession()
    expect(nextDayId(['A', 'B', 'C'], last?.dayId)).toBe('B')
  })

  it('finishing an empty session deletes it', async () => {
    const s = await startSession('p', 'A', 1)
    await finishSession(s.id, 2)
    expect(await db.sessions.count()).toBe(0)
  })

  it('discard removes the session and its sets', async () => {
    const s = await startSession('p', 'A', 1)
    await upsertSet(logSet(s.id, 'Plank', 0, { seconds: 30 }))
    await discardSession(s.id)
    expect(await db.sessions.count()).toBe(0)
    expect(await db.sets.count()).toBe(0)
  })
})

describe('exerciseHistory', () => {
  it('returns completed sessions newest first, excluding the open one', async () => {
    for (const [t, w] of [[1, 50], [2, 55]] as const) {
      const s = await startSession('p', 'A', t)
      await upsertSet(logSet(s.id, 'Hack_Squat', 0, { weight: w, reps: 10 }))
      await finishSession(s.id, t + 0.5)
    }
    const open = await startSession('p', 'A', 3)
    await upsertSet(logSet(open.id, 'Hack_Squat', 0, { weight: 99, reps: 1 }))
    const h = await exerciseHistory('Hack_Squat')
    expect(h.map((x) => x.sets[0]?.weight)).toEqual([55, 50])
  })
})

describe('backup', () => {
  it('round-trips data and media bytes', async () => {
    const s = await startSession('p', 'A', 1)
    await upsertSet(logSet(s.id, 'Hack_Squat', 0, { weight: 60, reps: 8 }))
    await finishSession(s.id, 2)
    await saveInBody({ id: 'ib1', date: '2026-10-12', weight: 70, smm: 30, lean: { ll: 9, rl: 9.4 }, fat: {} })
    await putMedia('Hack_Squat', new Blob([new Uint8Array([9, 8, 7])], { type: 'video/mp4' }), 3)

    const zip = await exportBackup(10)
    await db.delete()
    await db.open()
    await ensureSeeded(0)
    await importBackup(zip)

    expect(await db.sets.count()).toBe(1)
    expect((await listInBody())[0]?.lean.rl).toBe(9.4)
    const m = await getMedia('Hack_Squat')
    expect(Array.from(new Uint8Array(await m!.blob.arrayBuffer()))).toEqual([9, 8, 7])
    expect(m!.mime).toBe('video/mp4')
  })

  it('rejects a bad file and leaves data untouched', async () => {
    await saveInBody({ id: 'keep', date: '2026-10-12', weight: 70, lean: {}, fat: {} })
    await expect(importBackup(new Uint8Array([1, 2, 3]))).rejects.toThrow()
    expect(await db.inbody.count()).toBe(1)
  })
})
