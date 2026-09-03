import { describe, expect, it } from 'vitest'

import { getDistanceMeters, getStartExceptions } from './time-tracking-policy'

describe('time tracking policy', () => {
  const position = { latitude: 41.3851, longitude: 2.1734, accuracy: 12 }
  const scheduledFor = new Date(2026, 8, 3, 9, 0)

  it('calculates the distance between the worker and installation coordinates', () => {
    const distance = getDistanceMeters(position, { latitude: 41.386, longitude: 2.1734 })

    expect(distance).toBeGreaterThan(95)
    expect(distance).toBeLessThan(105)
  })

  it('does not require an exception for an on-time, nearby, precise start', () => {
    expect(
      getStartExceptions({
        scheduledFor,
        now: new Date(2026, 8, 3, 9, 8),
        position,
        installation: { latitude: 41.3852, longitude: 2.1734 },
      }),
    ).toEqual([])
  })

  it('identifies timing, geofence and precision exceptions independently', () => {
    expect(
      getStartExceptions({
        scheduledFor,
        now: new Date(2026, 8, 3, 10, 45),
        position: { ...position, accuracy: 320 },
        installation: { latitude: 41.4, longitude: 2.1734 },
      }),
    ).toEqual(['too_late', 'low_accuracy', 'outside_geofence'])
  })
})