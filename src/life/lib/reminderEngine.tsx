import { useEffect } from 'react'
import { logReminder } from '../db/repo'
import { isOpen } from '../domain/priority'
import { dayReminders, type Reminder } from '../domain/reminders'
import { addDays } from '../domain/time'
import type { ReminderLogEntry } from '../domain/types'
import { useLife } from '../state'
import { useToast } from '../../ui/Toast'

/**
 * Runtime delivery for the pure reminder schedule.
 *
 * Honest limits (iOS PWA): timers only run while the app is alive. Reminders that fall
 * due while it was closed are recorded as "missed" when it opens again and surface in
 * the inbox (follow-ups, overdue, deadlines). For alerts that fire with the app closed,
 * export the plan to Apple Calendar (ICS) from the data center.
 */

const MISSED_KINDS = new Set(['followup', 'overdue', 'deadline'])
const MAX_AHEAD = 24 * 3_600_000

export function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator
}

export async function requestNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported'
  return Notification.requestPermission()
}

async function showSystem(r: Reminder): Promise<boolean> {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return false
    await reg.showNotification(r.title, { body: r.body, tag: r.key, lang: 'ar', dir: 'rtl', data: { url: r.taskId ? `#/tasks/${r.taskId}` : '#/' } })
    return true
  } catch {
    return false
  }
}

export function ReminderEngine() {
  const life = useLife()
  const toast = useToast()
  const { data, now, today } = life

  useEffect(() => {
    const logged = new Map(data.reminders.map((r) => [r.id, r]))
    const all: Reminder[] = [today, addDays(today, 1)].flatMap((day) =>
      dayReminders({ day, blocks: life.blocksFor(day), tasks: data.tasks, commitments: data.commitments, settings: data.settings, planRes: life.proposal }))
    const stillRelevant = (r: Reminder) => !r.requiresOpenTask || (r.taskId !== undefined && !!life.taskById.get(r.taskId) && isOpen(life.taskById.get(r.taskId)!))
    const entry = (r: Reminder, status: ReminderLogEntry['status']): ReminderLogEntry =>
      ({ id: r.key, kind: r.kind, title: r.title, body: r.body, dueAt: r.at, taskId: r.taskId, status, firedAt: Date.now() })

    // Due while the app was closed → inbox (only kinds that still need an answer).
    for (const r of all) {
      if (r.at > now || logged.has(r.key) || !MISSED_KINDS.has(r.kind) || now - r.at > 12 * 3_600_000 || !stillRelevant(r)) continue
      void logReminder(entry(r, 'missed'))
    }

    const timers = all
      .filter((r) => r.at > now && r.at - now < MAX_AHEAD && !logged.has(r.key))
      .map((r) => setTimeout(async () => {
        if (!stillRelevant(r)) return
        const system = document.visibilityState !== 'visible' && (await showSystem(r))
        if (!system) toast(`🔔 ${r.title}`)
        await logReminder(entry(r, system ? 'shown_system' : 'shown_inapp'))
      }, r.at - Date.now()))
    return () => timers.forEach(clearTimeout)
  }, [data, now, today, life, toast])

  return null
}
