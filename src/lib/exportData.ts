import { strToU8, zipSync } from 'fflate'
import { db } from '../db/db'
import { allWeights, getProfile } from '../db/nutritionRepo'
import { getActiveProgram } from '../db/repo'
import { buildAiSummary } from '../domain/aiSummary'
import { weeklySlope } from '../domain/body'
import { buildCsvFiles } from '../domain/exportData'
import { readinessScore } from '../domain/readiness'
import { buildCoachReport } from '../domain/report'
import { weeklySetsByMuscle } from '../domain/stats'
import { GOAL_AR } from '../domain/nutrition/targets'
import { MUSCLE_AR } from '../data/catalog'
import { todayISO, weekStart } from './format'

const DAY = 86_400_000

async function gather() {
  const [exercises, programs, sessions, sets, inbody, tape, checkins, meals, weights] = await Promise.all([
    db.exercises.toArray(), db.programs.toArray(), db.sessions.toArray(), db.sets.toArray(), db.inbody.orderBy('date').toArray(),
    db.tape.orderBy('date').toArray(), db.checkins.toArray(), db.meals.toArray(), allWeights(),
  ])
  return { exercises: new Map(exercises.map((e) => [e.id, e])), programs, sessions, sets, inbody, tape, checkins, meals, weights }
}

/** Zip of Excel-friendly CSVs plus a JSON dump (no photos/videos) for your own analysis. */
export async function exportCsvZip(): Promise<Uint8Array> {
  const d = await gather()
  const files: Record<string, Uint8Array> = {}
  for (const [name, csv] of Object.entries(buildCsvFiles(d))) files[name] = strToU8(csv)
  const json = { exportedAt: new Date().toISOString(), programs: d.programs, sessions: d.sessions, sets: d.sets, inbody: d.inbody, tape: d.tape, checkins: d.checkins, meals: d.meals, weights: d.weights }
  files['data.json'] = strToU8(JSON.stringify(json, null, 1))
  return zipSync(files)
}

export async function buildSummaryText(now = Date.now()): Promise<string> {
  const d = await gather()
  const [profile, program] = await Promise.all([getProfile(), getActiveProgram()])
  const report = buildCoachReport({ exercises: d.exercises, program, sessions: d.sessions, sets: d.sets, checkins: d.checkins, inbodyCount: d.inbody.length, now })
  const finished = new Set(d.sessions.filter((s) => s.finishedAt && s.startedAt >= weekStart(now)).map((s) => s.id))
  const muscleSets = weeklySetsByMuscle(d.sets.filter((s) => finished.has(s.sessionId)), d.exercises)
  const points = d.weights.map((w) => ({ date: w.id, value: w.kg }))
  const recent = points.filter((p) => new Date(`${p.date}T12:00:00`).getTime() >= now - 56 * DAY)
  const last7 = new Set(Array.from({ length: 7 }, (_, i) => todayISO(now - i * DAY)))
  const meals7 = d.meals.filter((m) => last7.has(m.date))
  const loggedDays = new Set(meals7.map((m) => m.date)).size
  const ready7 = d.checkins.filter((c) => last7.has(c.id)).map(readinessScore)
  const ib = d.inbody.at(-1), ib0 = d.inbody[0]
  return buildAiSummary({
    generatedAt: todayISO(now),
    profile: profile ? { age: new Date(now).getFullYear() - profile.birthYear, heightCm: profile.heightCm, goal: GOAL_AR[profile.goal], sex: profile.sex } : undefined,
    weightKg: d.weights.at(-1)?.kg,
    weightRatePerWeek: weeklySlope(recent),
    inbody: ib ? { date: ib.date, pbf: ib.pbf, smm: ib.smm, bfm: ib.bfm } : undefined,
    inbodyFirst: ib0 ? { date: ib0.date, pbf: ib0.pbf, smm: ib0.smm } : undefined,
    programName: program?.name,
    sessionsLast28: d.sessions.filter((s) => s.finishedAt && s.startedAt >= now - 28 * DAY).length,
    weeklySetsByMuscle: Object.fromEntries(Object.entries(muscleSets).map(([m, v]) => [MUSCLE_AR[m] ?? m, v])),
    exercises: report.exercises,
    nutrition: loggedDays ? {
      avgKcal7: meals7.reduce((a, m) => a + m.kcal, 0) / loggedDays,
      avgProtein7: meals7.reduce((a, m) => a + m.p, 0) / loggedDays,
      targetKcal: profile?.kcalOverride,
    } : undefined,
    avgReadiness7: ready7.length ? ready7.reduce((a, b) => a + b, 0) / ready7.length : undefined,
  })
}
