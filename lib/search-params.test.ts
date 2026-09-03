import { describe, expect, it } from 'vitest'

import { applySearchParamUpdates } from './search-params'

describe('applySearchParamUpdates', () => {
  it('updates requested filters while preserving unrelated parameters', () => {
    expect(
      applySearchParamUpdates('cliente=client-1&mes=2026-08-01', {
        estado: 'scheduled',
        mes: '2026-09-01',
      }),
    ).toBe('cliente=client-1&mes=2026-09-01&estado=scheduled')
  })

  it('removes empty filters from the URL', () => {
    expect(applySearchParamUpdates('q=hotel&pagina=3', { q: '', pagina: null })).toBe('')
  })
})