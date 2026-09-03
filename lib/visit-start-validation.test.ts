import { describe, expect, it } from 'vitest'

import { getVisitStartWarning } from './visit-start-validation'

describe('getVisitStartWarning', () => {
  const scheduledFor = new Date(2026, 8, 3, 9, 0)

  it('does not warn when the start is within the 90-minute window', () => {
    expect(getVisitStartWarning(scheduledFor, new Date(2026, 8, 3, 10, 30))).toBeNull()
  })

  it('requires confirmation when the scheduled time differs by more than 90 minutes', () => {
    expect(getVisitStartWarning(scheduledFor, new Date(2026, 8, 3, 10, 31))).toBe(
      'outside_time_window',
    )
  })

  it('requires confirmation when the visit is on another local calendar day', () => {
    expect(getVisitStartWarning(scheduledFor, new Date(2026, 8, 4, 9, 0))).toBe(
      'different_day',
    )
  })
})