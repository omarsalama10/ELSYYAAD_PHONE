import { computeAchievements, weeklyChallenges, weeklyStreak, type Achievement, type Challenge } from './achievements'
import { analyzeProgress, type ProgressAnalysis } from './plateau'
import { readinessScore } from './readiness'
import { countRecords, personalRecords, type Records } from './records'
import { bestPerSession } from './stats'
import type { CheckIn, Exercise, Program, Session, SetLog } from './types'

export interface ExerciseReport {
  exercise: Exercise
  sessions: number
  lastAt: number
  records: Records
  analysis: ProgressAnalysis
}

export interface CoachReport {
  exercises: ExerciseReport[]
  prCount: number
  streak: number
  achievements: Achievement[]
  challenges: Challenge[]
}

const isoOf = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)

/** Everything the coach screens show, derived from raw logs in one pass per exercise. */
export function buildCoachReport(input: {
  exercises: Map<string, Exercise>
  program?: Program
  sessions: Session[]
  sets: SetLog[]
  checkins: CheckIn[]
  inbodyCount: number
  now: number
}): CoachReport {
  const finished = input.sessions.filter((s) => s.finishedAt).sort((a, b) => a.startedAt - b.startedAt)
  const byId = new Map(finished.map((s) => [s.id, s]))
  const inProgram = new Set(input.program?.days.flatMap((d) => d.blocks.map((b) => b.exerciseId)) ?? [])
  const scoreByDate = new Map(input.checkins.map((c) => [c.id, readinessScore(c)]))

  const setsByExercise = new Map<string, Map<string, SetLog[]>>()
  for (const s of input.sets) {
    if (!s.done || !byId.has(s.sessionId)) continue
    const m = setsByExercise.get(s.exerciseId) ?? new Map<string, SetLog[]>()
    m.set(s.sessionId, [...(m.get(s.sessionId) ?? []), s])
    setsByExercise.set(s.exerciseId, m)
  }

  let prCount = 0
  const reports: ExerciseReport[] = []
  for (const [exerciseId, perSession] of setsByExercise) {
    const exercise = input.exercises.get(exerciseId)
    if (!exercise || exercise.metric === 'cardio') continue
    const chrono = [...perSession.entries()]
      .map(([sid, sets]) => ({ at: byId.get(sid)!.startedAt, sets }))
      .sort((a, b) => a.at - b.at)
    prCount += countRecords(exercise, chrono)
    const recent = chrono.slice(-3)
    const alternatives = [...input.exercises.values()]
      .filter((x) => x.id !== exerciseId && x.muscles[0] === exercise.muscles[0] && !inProgram.has(x.id) && x.metric === exercise.metric)
      .map((x) => x.nameAr)
    reports.push({
      exercise,
      sessions: chrono.length,
      lastAt: chrono.at(-1)!.at,
      records: personalRecords(exercise, chrono),
      analysis: analyzeProgress({
        points: bestPerSession(exercise, chrono),
        avgRpe: mean(recent.flatMap((h) => h.sets.map((s) => s.rpe).filter((r): r is number => r !== undefined))),
        avgReadiness: mean(recent.map((h) => scoreByDate.get(isoOf(h.at))).filter((v): v is number => v !== undefined)),
        alternatives,
      }),
    })
  }
  reports.sort((a, b) => b.lastAt - a.lastAt)

  const starts = finished.map((s) => s.startedAt)
  const dates = input.checkins.map((c) => c.id)
  return {
    exercises: reports,
    prCount,
    streak: weeklyStreak(starts, input.now),
    achievements: computeAchievements({ sessionStarts: starts, prCount, inbodyCount: input.inbodyCount, checkinDates: dates, now: input.now }),
    challenges: weeklyChallenges(starts, dates, input.now),
  }
}
