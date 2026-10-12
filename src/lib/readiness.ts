import { useLiveQuery } from 'dexie-react-hooks'
import { getCheckIn } from '../db/repo'
import { readinessAdvice, readinessScore, type Advice } from '../domain/readiness'
import type { CheckIn } from '../domain/types'
import { todayISO } from './format'

export interface TodayReadiness { checkin?: CheckIn; score?: number; advice?: Advice }

/** Today's check-in with its score and advice; undefined while loading. */
export function useTodayReadiness(): TodayReadiness | undefined {
  return useLiveQuery(async () => {
    const checkin = await getCheckIn(todayISO())
    if (!checkin) return {}
    const score = readinessScore(checkin)
    return { checkin, score, advice: readinessAdvice(score, checkin.pain) }
  }, [])
}
