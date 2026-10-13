import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { lifeDb } from '../../src/life/db/db'
import { exportLifeBackup, importLifeBackup } from '../../src/life/db/backup'
import { addAttachment, createTask, getKV, KV } from '../../src/life/db/repo'

beforeEach(async () => {
  await lifeDb.delete(); await lifeDb.open()
})

describe('Life OS backup', () => {
  it('round-trips data and attachments and records the export time', async () => {
    const t = await createTask({ title: 'مهمة مهمة' })
    await addAttachment(new File([new Uint8Array([1, 2, 3])], 'spec.pdf', { type: 'application/pdf' }), { taskId: t.id })
    const zip = await exportLifeBackup(1234)
    expect(await getKV(KV.lastLifeBackupAt)).toBe(1234)
    await lifeDb.tasks.clear(); await lifeDb.attachments.clear()
    const r = await importLifeBackup(zip)
    expect(r.tasks).toHaveLength(1)
    expect((await lifeDb.tasks.get(t.id))?.title).toBe('مهمة مهمة')
    const att = (await lifeDb.attachments.toArray())[0]!
    expect(att).toMatchObject({ name: 'spec.pdf', mime: 'application/pdf', size: 3 })
    expect(new Uint8Array(await att.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('rejects non-zip files and gym backups without touching data', async () => {
    await createTask({ title: 'باقية' })
    await expect(importLifeBackup(strToU8('nope'))).rejects.toThrow('مش ملف نسخة احتياطية')
    await expect(importLifeBackup(zipSync({ 'data.json': strToU8('{}') }))).rejects.toThrow('ناقص life.json')
    expect(await lifeDb.tasks.count()).toBe(1)
  })

  it('a corrupt life.json or missing attachment aborts before replacing', async () => {
    const t = await createTask({ title: 'باقية' })
    await addAttachment(new File([new Uint8Array([9])], 'a.png', { type: 'image/png' }), { taskId: t.id })
    const files = unzipSync(await exportLifeBackup())
    const noMedia = Object.fromEntries(Object.entries(files).filter(([k]) => !k.startsWith('life-media/')))
    await expect(importLifeBackup(zipSync(noMedia))).rejects.toThrow('مرفق ناقص')
    files['life.json'] = strToU8(JSON.stringify({ schema: 1, tasks: [{ nope: true }] }))
    await expect(importLifeBackup(zipSync(files))).rejects.toThrow('بيانات تالفة')
    expect(await lifeDb.tasks.count()).toBe(1)
  })
})
