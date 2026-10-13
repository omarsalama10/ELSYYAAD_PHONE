import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { strToU8, unzipSync, zipSync, strFromU8 } from 'fflate'
import { db } from '../../src/db/db'
import { ensureSeeded } from '../../src/db/seed'
import { exportBackup, importBackup } from '../../src/db/backup'
import { lifeDb } from '../../src/life/db/db'
import { addAttachment, createTask } from '../../src/life/db/repo'

beforeEach(async () => {
  await db.delete(); await db.open(); await ensureSeeded(0)
  await lifeDb.delete(); await lifeDb.open()
})

describe('combined backup', () => {
  it('round-trips Life OS data and attachments with the gym data', async () => {
    const t = await createTask({ title: 'مهمة مهمة' })
    await addAttachment(new File([new Uint8Array([1, 2, 3])], 'spec.pdf', { type: 'application/pdf' }), { taskId: t.id })
    const zip = await exportBackup()
    await lifeDb.tasks.clear(); await lifeDb.attachments.clear()
    const r = await importBackup(zip)
    expect(r.life?.tasks).toHaveLength(1)
    expect((await lifeDb.tasks.get(t.id))?.title).toBe('مهمة مهمة')
    const att = (await lifeDb.attachments.toArray())[0]!
    expect(att).toMatchObject({ name: 'spec.pdf', mime: 'application/pdf', size: 3 })
    expect(new Uint8Array(await att.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('a gym-only (older) backup leaves Life OS untouched', async () => {
    const zip = unzipSync(await exportBackup())
    delete zip['life.json']
    await createTask({ title: 'باقية' })
    await importBackup(zipSync(zip))
    expect(await lifeDb.tasks.count()).toBe(1)
  })

  it('a corrupt life.json aborts before any gym data is touched', async () => {
    const files = unzipSync(await exportBackup())
    const sessionsBefore = JSON.parse(strFromU8(files['data.json']!)).programs.length
    files['life.json'] = strToU8(JSON.stringify({ schema: 1, tasks: [{ nope: true }] }))
    await expect(importBackup(zipSync(files))).rejects.toThrow('بيانات تالفة')
    expect(await db.programs.count()).toBe(sessionsBefore)
  })
})
