import { describe, expect, it } from 'vitest'

import { getVisitMapUrls, hasVisitCoordinates } from './visit-location'

describe('getVisitMapUrls', () => {
  it('uses the installation coordinates for the map and directions', () => {
    expect(getVisitMapUrls({ address: 'Carrer Major 2', latitude: 41.4, longitude: 2.1 }))
      .toEqual({
        embedUrl: 'https://www.google.com/maps?q=41.4%2C2.1&output=embed',
        directionsUrl: 'https://www.google.com/maps/dir/?api=1&destination=41.4%2C2.1',
      })
  })

  it('falls back to the address when coordinates are unavailable', () => {
    expect(getVisitMapUrls({ installationName: 'Piscina comunitària', address: 'Plaça Nova 4' }))
      .toMatchObject({
        directionsUrl: 'https://www.google.com/maps/dir/?api=1&destination=Pla%C3%A7a%20Nova%204',
      })
  })

  it('only treats a complete, valid coordinate pair as mappable', () => {
    expect(hasVisitCoordinates({ latitude: 41.4, longitude: 2.1 })).toBe(true)
    expect(hasVisitCoordinates({ latitude: 41.4, longitude: null })).toBe(false)
    expect(hasVisitCoordinates({ latitude: 91, longitude: 2.1 })).toBe(false)
  })
})