/** Next program day: the one after the last completed day, never calendar-bound. */
export function nextDayId(dayIds: string[], lastCompletedDayId?: string): string {
  if (dayIds.length === 0) throw new Error('Program has no days')
  const i = lastCompletedDayId ? dayIds.indexOf(lastCompletedDayId) : -1
  return dayIds[i < 0 ? 0 : (i + 1) % dayIds.length]!
}
