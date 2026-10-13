import type { BodyGoals, CheckIn, InBody, Media, Pose, ProgressPhoto, Program, Session, SetLog, Tape } from '../domain/types'
import { NAME_OVERRIDES } from './seed'
import { db } from './db'

export const uid = () => crypto.randomUUID()

// ---- programs ----

export async function getActiveProgram(): Promise<Program | undefined> {
  return db.programs.where('active').equals(1).first()
}

export async function saveProgram(p: Program): Promise<void> {
  await db.programs.put(p)
}

// ---- sessions ----

export async function getActiveSession(): Promise<Session | undefined> {
  return db.sessions.filter((s) => !s.finishedAt).first()
}

/** Resumes the unfinished session if one exists, otherwise starts a new one. */
export async function startSession(programId: string, dayId: string, now = Date.now()): Promise<Session> {
  return db.transaction('rw', db.sessions, async () => {
    const open = await getActiveSession()
    if (open) return open
    const s: Session = { id: uid(), programId, dayId, startedAt: now }
    await db.sessions.add(s)
    return s
  })
}

/** Keeps only completed sets; a session with none is dropped entirely. */
export async function finishSession(id: string, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.sessions, db.sets, async () => {
    await db.sets.where('sessionId').equals(id).filter((s) => !s.done).delete()
    if ((await db.sets.where('sessionId').equals(id).count()) === 0) {
      await db.sessions.delete(id)
      return
    }
    await db.sessions.update(id, { finishedAt: now })
  })
}

export async function discardSession(id: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.sets, async () => {
    await db.sets.where('sessionId').equals(id).delete()
    await db.sessions.delete(id)
  })
}

export async function completedSessions(): Promise<Session[]> {
  const all = await db.sessions.orderBy('startedAt').toArray()
  return all.filter((s) => s.finishedAt)
}

export async function lastCompletedSession(): Promise<Session | undefined> {
  return (await completedSessions()).at(-1)
}

export async function firstCompletedSession(): Promise<Session | undefined> {
  return (await completedSessions())[0]
}

// ---- sets ----

export async function upsertSet(s: SetLog): Promise<void> {
  await db.sets.put(s)
}

export async function deleteSet(id: string): Promise<void> {
  await db.sets.delete(id)
}

export async function sessionSets(sessionId: string): Promise<SetLog[]> {
  return db.sets.where('sessionId').equals(sessionId).toArray()
}

export interface SessionSets { session: Session; sets: SetLog[] }

/** Completed sessions containing the exercise, newest first, each with its sets in order. */
export async function exerciseHistory(exerciseId: string, limit = 20): Promise<SessionSets[]> {
  const sets = await db.sets.where('exerciseId').equals(exerciseId).toArray()
  const bySession = new Map<string, SetLog[]>()
  for (const s of sets) {
    const list = bySession.get(s.sessionId) ?? []
    list.push(s)
    bySession.set(s.sessionId, list)
  }
  const sessions = (await db.sessions.bulkGet([...bySession.keys()]))
    .filter((s): s is Session => !!s?.finishedAt)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit)
  return sessions.map((session) => ({
    session,
    sets: bySession.get(session.id)!.sort((a, b) => a.setIndex - b.setIndex || (a.side ?? '').localeCompare(b.side ?? '')),
  }))
}

// ---- body ----

export const listInBody = () => db.inbody.orderBy('date').toArray()
export const saveInBody = (r: InBody) => db.inbody.put(r)
export const deleteInBody = (id: string) => db.inbody.delete(id)

export const listTape = () => db.tape.orderBy('date').toArray()
export const saveTape = (r: Tape) => db.tape.put(r)
export const deleteTape = (id: string) => db.tape.delete(id)

// ---- media ----

export async function getMedia(exerciseId: string): Promise<Media | undefined> {
  return db.media.where('exerciseId').equals(exerciseId).first()
}

/** One video per exercise: replaces any previous one. */
export async function putMedia(exerciseId: string, blob: Blob, now = Date.now()): Promise<Media> {
  const m: Media = { id: uid(), exerciseId, blob, mime: blob.type || 'video/mp4', createdAt: now }
  await db.transaction('rw', db.media, async () => {
    await db.media.where('exerciseId').equals(exerciseId).delete()
    await db.media.add(m)
  })
  return m
}

export async function deleteMedia(exerciseId: string): Promise<void> {
  await db.media.where('exerciseId').equals(exerciseId).delete()
}

// ---- settings ----

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await db.settings.get(key))?.value as T | undefined
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value })
}

export const SETTING = {
  lastBackupAt: 'lastBackupAt',
  restSound: 'restSound',
} as const

// ---- check-ins ----

export const getCheckIn = (date: string) => db.checkins.get(date)
export const saveCheckIn = (c: CheckIn) => db.checkins.put(c)
export const listCheckIns = () => db.checkins.toArray()

// ---- exercise rename ----

export async function renameExercise(id: string, nameAr: string): Promise<void> {
  const name = nameAr.trim()
  if (!name) throw new Error('الاسم فاضي')
  await db.transaction('rw', db.exercises, db.settings, async () => {
    const overrides = ((await db.settings.get(NAME_OVERRIDES))?.value ?? {}) as Record<string, string>
    await db.settings.put({ key: NAME_OVERRIDES, value: { ...overrides, [id]: name } })
    await db.exercises.update(id, { nameAr: name })
  })
}

// ---- progress photos & body goals ----

export async function addPhoto(date: string, pose: Pose, blob: Blob): Promise<ProgressPhoto> {
  const p: ProgressPhoto = { id: uid(), date, pose, blob, mime: blob.type || 'image/jpeg', at: Date.now() }
  await db.photos.add(p)
  return p
}
export const listPhotos = () => db.photos.orderBy('date').toArray()
export const deletePhoto = (id: string) => db.photos.delete(id)

const BODY_GOALS = 'bodyGoals'
export async function getBodyGoals(): Promise<BodyGoals> {
  return ((await db.settings.get(BODY_GOALS))?.value as BodyGoals | undefined) ?? {}
}
export const saveBodyGoals = (g: BodyGoals) => db.settings.put({ key: BODY_GOALS, value: g })

// ---- multiple programs ----

export const listPrograms = () => db.programs.toArray()

/** Exactly one active program at a time. */
export async function setActiveProgram(id: string): Promise<void> {
  await db.transaction('rw', db.programs, async () => {
    const all = await db.programs.toArray()
    await Promise.all(all.map((p) => db.programs.update(p.id, { active: p.id === id ? 1 : 0 })))
  })
}

export async function addProgram(p: Program): Promise<void> {
  await db.transaction('rw', db.programs, async () => {
    await db.programs.put({ ...p, active: 0 })
    const all = await db.programs.toArray()
    await Promise.all(all.map((x) => db.programs.update(x.id, { active: x.id === p.id ? 1 : 0 })))
  })
}

export async function deleteProgram(id: string): Promise<void> {
  const p = await db.programs.get(id)
  if (p?.active) throw new Error('مينفعش تمسح البرنامج الشغال — فعّل برنامج تاني الأول')
  await db.programs.delete(id)
}
