export const VISIT_START_TOLERANCE_MINUTES = 90

export type VisitStartWarning = 'different_day' | 'outside_time_window'

/** Flags starts that need an explicit worker confirmation before recording attendance. */
export function getVisitStartWarning(
  scheduledFor: string | Date,
  now: Date = new Date(),
): VisitStartWarning | null {
  const scheduled = new Date(scheduledFor)
  if (Number.isNaN(scheduled.getTime())) return 'outside_time_window'

  const isDifferentDay =
    scheduled.getFullYear() !== now.getFullYear() ||
    scheduled.getMonth() !== now.getMonth() ||
    scheduled.getDate() !== now.getDate()
  if (isDifferentDay) return 'different_day'

  const differenceMinutes = Math.abs(now.getTime() - scheduled.getTime()) / 60_000
  return differenceMinutes > VISIT_START_TOLERANCE_MINUTES ? 'outside_time_window' : null
}