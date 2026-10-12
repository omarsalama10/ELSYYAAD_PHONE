import { CATALOG } from '../data/catalog'
import { createDefaultProgram } from '../data/defaultProgram'
import { db } from './db'

/** Setting key: user renames of catalog exercises, kept across catalog refreshes. */
export const NAME_OVERRIDES = 'nameOverrides'

/**
 * Idempotent: refreshes the bundled catalog on every start (so app updates ship new
 * exercises/cues) and inserts the default program only when no program exists.
 */
export async function ensureSeeded(now = Date.now()): Promise<void> {
  await db.transaction('rw', db.exercises, db.programs, db.settings, async () => {
    const overrides = ((await db.settings.get(NAME_OVERRIDES))?.value ?? {}) as Record<string, string>
    await db.exercises.bulkPut(CATALOG.map((e) => (overrides[e.id] ? { ...e, nameAr: overrides[e.id]! } : e)))
    if ((await db.programs.count()) === 0) await db.programs.add(createDefaultProgram(now))
  })
}
