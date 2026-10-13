import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { BACKUP_VERSION, validateBackup, type BackupData, type MediaMeta } from '../domain/backup'
import type { Media } from '../domain/types'
import { db } from './db'
import { SETTING } from './repo'
import { loadAll, replaceAll } from '../life/db/repo'
import { lifeDb } from '../life/db/db'
import { validateLifeData, type LifeData } from '../life/domain/data'

const DATA_FILE = 'data.json'
/** Life OS data travels in the same zip; older backups without it leave Life OS untouched. */
const LIFE_FILE = 'life.json'

/** Zip with data.json + media/<id> blobs. Records the export time for the reminder. */
export async function exportBackup(now = Date.now()): Promise<Uint8Array> {
  const [programs, sessions, sets, inbody, tape, settings, media, checkins] = await Promise.all([
    db.programs.toArray(), db.sessions.toArray(), db.sets.toArray(), db.inbody.toArray(),
    db.tape.toArray(), db.settings.toArray(), db.media.toArray(), db.checkins.toArray(),
  ])
  const files: Zippable = {}
  const mediaMeta: MediaMeta[] = []
  for (const m of media) {
    const file = `media/${m.id}`
    files[file] = [new Uint8Array(await m.blob.arrayBuffer()), { level: 0 }]
    mediaMeta.push({ id: m.id, exerciseId: m.exerciseId, mime: m.mime, createdAt: m.createdAt, file })
  }
  const data: BackupData = { version: BACKUP_VERSION, exportedAt: now, programs, sessions, sets, inbody, tape, settings, media: mediaMeta, checkins }
  files[DATA_FILE] = strToU8(JSON.stringify(data))
  const life = await loadAll(now)
  for (const a of await lifeDb.attachments.toArray()) files[`life-media/${a.id}`] = [new Uint8Array(await a.blob.arrayBuffer()), { level: 0 }]
  files[LIFE_FILE] = strToU8(JSON.stringify(life))
  const zip = zipSync(files)
  await db.settings.put({ key: SETTING.lastBackupAt, value: now })
  return zip
}

/** Validates fully before touching data, then replaces everything in one transaction. */
export async function importBackup(bytes: Uint8Array): Promise<BackupData & { life?: LifeData }> {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new Error('الملف مش ملف نسخة احتياطية (zip)')
  }
  const json = files[DATA_FILE]
  if (!json) throw new Error('الملف ناقص data.json')
  let parsed: unknown
  try {
    parsed = JSON.parse(strFromU8(json))
  } catch {
    throw new Error('data.json تالف')
  }
  const data = validateBackup(parsed)
  const media: Media[] = data.media.map((m) => {
    const blob = files[m.file]
    if (!blob) throw new Error(`فيديو ناقص في النسخة: ${m.file}`)
    return { id: m.id, exerciseId: m.exerciseId, mime: m.mime, createdAt: m.createdAt, blob: new Blob([blob], { type: m.mime }) }
  })

  let life: LifeData | undefined
  let lifeBlobs: Map<string, Blob> | undefined
  if (files[LIFE_FILE]) {
    try {
      life = validateLifeData(JSON.parse(strFromU8(files[LIFE_FILE])))
    } catch (e) {
      throw e instanceof SyntaxError ? new Error('life.json تالف') : e
    }
    lifeBlobs = new Map(life.attachments.map((a) => {
      const bytes = files[a.file]
      if (!bytes) throw new Error(`مرفق ناقص في النسخة: ${a.name}`)
      return [a.file, new Blob([bytes], { type: a.mime })]
    }))
  }

  const tables = [db.programs, db.sessions, db.sets, db.inbody, db.tape, db.settings, db.media, db.checkins]
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()))
    await db.programs.bulkAdd(data.programs)
    await db.sessions.bulkAdd(data.sessions)
    await db.sets.bulkAdd(data.sets)
    await db.inbody.bulkAdd(data.inbody)
    await db.tape.bulkAdd(data.tape)
    await db.settings.bulkAdd(data.settings)
    await db.media.bulkAdd(media)
    await db.checkins.bulkAdd(data.checkins)
  })
  if (!life) return data
  await replaceAll(life, lifeBlobs)
  return { ...data, life }
}
