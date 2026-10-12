import Dexie, { type EntityTable } from 'dexie'
import type { CheckIn, Exercise, InBody, Media, Program, Session, SetLog, Setting, Tape } from '../domain/types'

export class GymDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  programs!: EntityTable<Program, 'id'>
  sessions!: EntityTable<Session, 'id'>
  sets!: EntityTable<SetLog, 'id'>
  inbody!: EntityTable<InBody, 'id'>
  tape!: EntityTable<Tape, 'id'>
  media!: EntityTable<Media, 'id'>
  settings!: EntityTable<Setting, 'key'>
  checkins!: EntityTable<CheckIn, 'id'>

  constructor(name = 'gym-tracker') {
    super(name)
    this.version(1).stores({
      exercises: 'id',
      programs: 'id, active',
      sessions: 'id, startedAt, dayId',
      sets: 'id, sessionId, exerciseId',
      inbody: 'id, date',
      tape: 'id, date',
      media: 'id, exerciseId',
      settings: 'key',
    })
    this.version(2).stores({ checkins: 'id' })
  }
}

export const db = new GymDB()
