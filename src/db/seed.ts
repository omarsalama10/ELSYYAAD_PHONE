import { CATALOG } from '../data/catalog'
import { createDefaultProgram } from '../data/defaultProgram'
import { db } from './db'

/**
 * Idempotent: refreshes the bundled catalog on every start (so app updates ship new
 * exercises/cues) and inserts the default program only when no program exists.
 */
export async function ensureSeeded(now = Date.now()): Promise<void> {
  await db.transaction('rw', db.exercises, db.programs, async () => {
    await db.exercises.bulkPut(CATALOG)
    if ((await db.programs.count()) === 0) await db.programs.add(createDefaultProgram(now))
  })
}
