export type InventoryFilterProduct = {
  name: string
  reference: string | null
  category: string | null
  active: boolean
  stock_quantity: number
  minimum_stock: number
}

export type InventoryFilters = {
  query: string
  category: string
  status: 'all' | 'active' | 'inactive'
  stock: 'all' | 'low' | 'healthy'
}

export const INVENTORY_PAGE_SIZE = 12

export function readInventoryPage(value: string | null) {
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

export function getInventoryPageCount(total: number) {
  return Math.max(1, Math.ceil(total / INVENTORY_PAGE_SIZE))
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('ca')
    .trim()

export function getInventoryCategories(products: InventoryFilterProduct[]) {
  const categories = products
    .map((product) => product.category?.trim())
    .filter((category): category is string => Boolean(category))

  return [...new Set(categories)].sort((a, b) => a.localeCompare(b, 'ca'))
}

export function filterInventoryProducts<T extends InventoryFilterProduct>(
  products: T[],
  filters: InventoryFilters,
) {
  const query = normalize(filters.query)

  return products.filter((product) => {
    const matchesQuery =
      !query || [product.name, product.reference ?? ''].some((value) => normalize(value).includes(query))
    const matchesCategory = !filters.category || product.category?.trim() === filters.category
    const matchesStatus = filters.status === 'all' || (filters.status === 'active') === product.active
    const isLowStock = product.active && product.stock_quantity <= product.minimum_stock
    const matchesStock =
      filters.stock === 'all' ||
      (filters.stock === 'low' && isLowStock) ||
      (filters.stock === 'healthy' && product.active && !isLowStock)

    return matchesQuery && matchesCategory && matchesStatus && matchesStock
  })
}