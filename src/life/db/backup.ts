import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { validateLifeData, type LifeData } from '../domain/data'
import { lifeDb } from './db'
import { KV, loadAll, replaceAll, setKV } from './repo'

/** Life OS backup: life.json + life-media/<id> attachment blobs in one zip. */
const LIFE_FILE = 'life.json'

export async function exportLifeBackup(now = Date.now()): Promise<Uint8Array> {
  const files: Zippable = {}
  for (const a of await lifeDb.attachments.toArray()) files[`life-media/${a.id}`] = [new Uint8Array(await a.blob.arrayBuffer()), { level: 0 }]
  files[LIFE_FILE] = strToU8(JSON.stringify(await loadAll(now)))
  const zip = zipSync(files)
  await setKV(KV.lastLifeBackupAt, now)
  return zip
}

/** Validates the whole file (data + every attachment) before replacing anything. */
export async function importLifeBackup(bytes: Uint8Array): Promise<LifeData> {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new Error('الملف مش ملف نسخة احتياطية (zip)')
  }
  const json = files[LIFE_FILE]
  if (!json) throw new Error('الملف مش نسخة Life OS (ناقص life.json)')
  let life: LifeData
  try {
    life = validateLifeData(JSON.parse(strFromU8(json)))
  } catch (e) {
    throw e instanceof SyntaxError ? new Error('life.json تالف') : e
  }
  const blobs = new Map(life.attachments.map((a) => {
    const b = files[a.file]
    if (!b) throw new Error(`مرفق ناقص في النسخة: ${a.name}`)
    return [a.file, new Blob([b], { type: a.mime })] as const
  }))
  return replaceAll(life, blobs)
}
