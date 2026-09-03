import { describe, expect, it } from 'vitest'

import { isLocationSchemaPending } from './location-schema-compatibility'

describe('isLocationSchemaPending', () => {
  it('detecta columnas de ubicación ausentes con o sin alias de PostgREST', () => {
    expect(isLocationSchemaPending('column installations.location_latitude does not exist')).toBe(true)
    expect(isLocationSchemaPending('column installations_1.location_longitude does not exist')).toBe(
      true,
    )
  })

  it('no oculta otros errores de consulta', () => {
    expect(isLocationSchemaPending('permission denied for table installations')).toBe(false)
  })
})