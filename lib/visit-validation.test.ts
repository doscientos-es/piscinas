import { describe, expect, it } from 'vitest'

import { validateVisitCompletion } from './visit-validation'

const products = [{ id: 'cloro', stockQuantity: 10 }]

describe('validateVisitCompletion', () => {
  it('requereix una descripció de la intervenció', () => {
    expect(validateVisitCompletion('  ', [], products)).toBe(
      "Descriu la feina realitzada abans de tancar l'informe.",
    )
  })

  it('impedeix registrar més producte del disponible', () => {
    expect(
      validateVisitCompletion('Neteja', [{ productId: 'cloro', quantity: 12 }], products),
    ).toBe('La quantitat indicada supera les existències disponibles.')
  })

  it('accepta un informe sense consum quan la descripció és vàlida', () => {
    expect(validateVisitCompletion('Neteja de cistells', [], products)).toBeNull()
  })
})
