const DAY = 86_400_000
const WEEK = 7 * DAY

/** Saturday 00:00 local of the week containing t. */
export function weekStartOf(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7))
  return d.getTime()
}

/**
 * Consecutive weeks with ≥3 sessions, counting back from the current week.
 * An unfinished current week doesn't break the streak; it just isn't counted yet.
 */
export function weeklyStreak(sessionStarts: number[], now: number, target = 3): number {
  const counts = new Map<number, number>()
  for (const t of sessionStarts) {
    const w = weekStartOf(t)
    counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  let w = weekStartOf(now)
  let streak = 0
  if ((counts.get(w) ?? 0) >= target) streak++
  for (w = weekStartOf(w - DAY); (counts.get(w) ?? 0) >= target; w = weekStartOf(w - DAY)) streak++
  return streak
}

export function dayStreak(dates: string[], today: string): number {
  const set = new Set(dates)
  let streak = 0
  const d = new Date(`${today}T12:00:00`)
  if (!set.has(today)) d.setDate(d.getDate() - 1)
  for (;;) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!set.has(iso)) break
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

export interface Achievement {
  id: string
  icon: string
  title: string
  desc: string
  unlocked: boolean
  /** 0–1 toward unlocking. */
  progress: number
}

export interface AchievementInput {
  sessionStarts: number[]
  prCount: number
  inbodyCount: number
  checkinDates: string[]
  now: number
}

function milestone(id: string, icon: string, title: string, desc: string, value: number, goal: number): Achievement {
  return { id, icon, title, desc, unlocked: value >= goal, progress: Math.min(1, value / goal) }
}

export function computeAchievements(i: AchievementInput): Achievement[] {
  const sessions = i.sessionStarts.length
  const d = new Date(i.now)
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const streak = weeklyStreak(i.sessionStarts, i.now)
  return [
    milestone('sessions-1', '🚀', 'البداية', 'أول تمرين', sessions, 1),
    milestone('sessions-10', '💪', 'منتظم', '10 تمارين', sessions, 10),
    milestone('sessions-25', '🔥', 'ماكينة', '25 تمرين', sessions, 25),
    milestone('sessions-50', '🏅', 'نص المية', '50 تمرين', sessions, 50),
    milestone('sessions-100', '👑', 'أسطورة', '100 تمرين', sessions, 100),
    milestone('streak-4', '📅', 'شهر التزام', '4 أسابيع ورا بعض بـ 3 تمارين', streak, 4),
    milestone('streak-12', '🗓️', '3 شهور التزام', '12 أسبوع ورا بعض', streak, 12),
    milestone('pr-1', '🏆', 'أول رقم قياسي', 'كسرت رقمك لأول مرة', i.prCount, 1),
    milestone('pr-10', '🥇', 'كسّار أرقام', '10 أرقام قياسية', i.prCount, 10),
    milestone('pr-50', '💎', 'وحش', '50 رقم قياسي', i.prCount, 50),
    milestone('inbody-1', '📊', 'عارف نفسك', 'أول قياس InBody', i.inbodyCount, 1),
    milestone('checkin-7', '😴', 'سامع جسمك', 'سجّلت جاهزيتك 7 أيام ورا بعض', dayStreak(i.checkinDates, today), 7),
  ]
}

export interface Challenge { id: string; title: string; value: number; goal: number }

export function weeklyChallenges(sessionStarts: number[], checkinDates: string[], now: number): Challenge[] {
  const ws = weekStartOf(now)
  const sessions = sessionStarts.filter((t) => t >= ws && t < ws + WEEK).length
  const checkins = checkinDates.filter((iso) => { const t = new Date(`${iso}T12:00:00`).getTime(); return t >= ws && t < ws + WEEK }).length
  return [
    { id: 'w-sessions', title: 'كمّل 3 تمارين الأسبوع ده', value: Math.min(sessions, 3), goal: 3 },
    { id: 'w-checkins', title: 'سجّل جاهزيتك 5 أيام', value: Math.min(checkins, 5), goal: 5 },
  ]
}
