export type ProductForCompletion = { id: string; stockQuantity: number }
export type ProductUsageInput = { productId: string; quantity: number }

export function validateVisitCompletion(
  notes: string,
  usages: ProductUsageInput[],
  products: ProductForCompletion[],
) {
  if (!notes.trim()) return "Descriu la feina realitzada abans de tancar l'informe."

  const quantities = new Map<string, number>()
  for (const usage of usages) {
    if (!Number.isFinite(usage.quantity) || usage.quantity <= 0) {
      return 'Introdueix una quantitat vàlida per a cada producte.'
    }
    quantities.set(usage.productId, (quantities.get(usage.productId) ?? 0) + usage.quantity)
  }

  for (const [productId, quantity] of quantities) {
    const product = products.find((item) => item.id === productId)
    if (!product) return 'Un dels productes ja no està disponible.'
    if (quantity > product.stockQuantity) {
      return 'La quantitat indicada supera les existències disponibles.'
    }
  }

  return null
}
