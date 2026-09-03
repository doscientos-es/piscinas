import { describe, expect, it } from 'vitest'

import { validateVisitCompletion } from './visit-validation'

const products = [{ id: 'cloro', stockQuantity: 10 }]

describe('validateVisitCompletion', () => {
  it('requiere una descripción de la intervención', () => {
    expect(validateVisitCompletion('  ', [], products)).toBe(
      'Describe el trabajo realizado antes de cerrar el parte.',
    )
  })

  it('impide registrar más producto del disponible', () => {
    expect(
      validateVisitCompletion('Limpieza', [{ productId: 'cloro', quantity: 12 }], products),
    ).toBe('La cantidad indicada supera las existencias disponibles.')
  })

  it('acepta un parte sin consumo cuando su descripción es válida', () => {
    expect(validateVisitCompletion('Limpieza de cestos', [], products)).toBeNull()
  })
})
