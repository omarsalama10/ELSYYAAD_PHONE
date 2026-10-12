import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { getActiveProgram } from '../db/repo'
import { buildCoachReport, type CoachReport } from '../domain/report'

export function useCoachReport(): CoachReport | undefined {
  return useLiveQuery(async () => {
    const [exercises, program, sessions, sets, checkins, inbodyCount] = await Promise.all([
      db.exercises.toArray(), getActiveProgram(), db.sessions.toArray(), db.sets.toArray(), db.checkins.toArray(), db.inbody.count(),
    ])
    return buildCoachReport({ exercises: new Map(exercises.map((e) => [e.id, e])), program, sessions, sets, checkins, inbodyCount, now: Date.now() })
  }, [])
}
