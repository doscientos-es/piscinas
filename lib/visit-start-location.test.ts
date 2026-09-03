import { describe, expect, it } from 'vitest'

import { getStoredInstallationLocation, isUsableVisitLocation } from './visit-start-location'

describe('isUsableVisitLocation', () => {
  const policy = { max_location_accuracy_m: 200 }

  it('accepts a precise valid position', () => {
    expect(isUsableVisitLocation({ latitude: 41.49, longitude: 2.37, accuracy: 18 }, policy)).toBe(
      true,
    )
  })

  it('rejects invalid or imprecise positions so stored installation coordinates can be used', () => {
    expect(isUsableVisitLocation({ latitude: 91, longitude: 2.37, accuracy: 18 }, policy)).toBe(false)
    expect(isUsableVisitLocation({ latitude: 41.49, longitude: 2.37, accuracy: 201 }, policy)).toBe(
      false,
    )
  })

  it('uses only coordinates stored on the installation when GPS is unavailable', () => {
    expect(
      getStoredInstallationLocation({ location_latitude: 41.49, location_longitude: 2.37 }),
    ).toEqual({ latitude: 41.49, longitude: 2.37, accuracy: 0 })
    expect(getStoredInstallationLocation({ location_latitude: null, location_longitude: 2.37 })).toBe(
      null,
    )
  })
})
