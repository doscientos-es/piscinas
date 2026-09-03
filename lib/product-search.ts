export type SearchableProduct = {
  name: string
  reference?: string | null
}

function normalizeSearchValue(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_/]+/g, ' ')
    .toLocaleLowerCase('es')
    .trim()
}

export function findProducts<T extends SearchableProduct>(products: T[], query: string, limit = 8) {
  const normalizedQuery = normalizeSearchValue(query)
  if (!normalizedQuery) return []

  return products
    .filter((product) =>
      [product.name, product.reference ?? ''].some((value) =>
        normalizeSearchValue(value).includes(normalizedQuery),
      ),
    )
    .slice(0, limit)
}
