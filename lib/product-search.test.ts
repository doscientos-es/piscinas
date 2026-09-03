import { describe, expect, it } from 'vitest'

import { findProducts } from './product-search'

const products = [
  { id: '1', name: 'Cloro granulado', reference: 'CL-GR-25' },
  { id: '2', name: 'Reductor de pH', reference: 'PH-MENOS' },
]

describe('findProducts', () => {
  it('finds products by name or reference, ignoring accents', () => {
    expect(findProducts(products, 'cloro')).toEqual([products[0]])
    expect(findProducts(products, 'ph menos')).toEqual([products[1]])
  })

  it('requires a search and limits the result list', () => {
    expect(findProducts(products, '')).toEqual([])
    expect(findProducts(products, 'o', 1)).toEqual([products[0]])
  })
})