import { describe, expect, it } from 'vitest'

import {
  filterInventoryProducts,
  getInventoryCategories,
  getInventoryPageCount,
  readInventoryPage,
} from './inventory-filters'

const products = [
  { name: 'Clor granulat', reference: 'CL-25', category: 'Desinfecció', active: true, stock_quantity: 3, minimum_stock: 5 },
  { name: 'Reductor de pH', reference: 'PH-10', category: 'Equilibri', active: true, stock_quantity: 12, minimum_stock: 4 },
  { name: 'Algicida', reference: null, category: 'Desinfecció', active: false, stock_quantity: 8, minimum_stock: 2 },
]

describe('inventory filters', () => {
  it('returns distinct categories in alphabetical order', () => {
    expect(getInventoryCategories(products)).toEqual(['Desinfecció', 'Equilibri'])
  })

  it('combines text, category, status and stock filters', () => {
    expect(
      filterInventoryProducts(products, {
        query: 'clor',
        category: 'Desinfecció',
        status: 'active',
        stock: 'low',
      }),
    ).toEqual([products[0]])
  })

  it('does not mark inactive materials as healthy stock', () => {
    expect(
      filterInventoryProducts(products, { query: '', category: '', status: 'all', stock: 'healthy' }),
    ).toEqual([products[1]])
  })

  it('only accepts positive, whole URL page numbers', () => {
    expect(readInventoryPage('3')).toBe(3)
    expect(readInventoryPage('0')).toBe(1)
    expect(readInventoryPage('2.5')).toBe(1)
    expect(readInventoryPage('not-a-page')).toBe(1)
  })

  it('keeps pagination at one page when there are no matches', () => {
    expect(getInventoryPageCount(0)).toBe(1)
    expect(getInventoryPageCount(13)).toBe(2)
  })
})