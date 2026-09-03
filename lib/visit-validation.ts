export type ProductForCompletion = { id: string; stockQuantity: number };
export type ProductUsageInput = { productId: string; quantity: number };

export function validateVisitCompletion(
  notes: string,
  usages: ProductUsageInput[],
  products: ProductForCompletion[],
) {
  if (!notes.trim()) return "Describe el trabajo realizado antes de cerrar el parte.";

  const quantities = new Map<string, number>();
  for (const usage of usages) {
    if (!Number.isFinite(usage.quantity) || usage.quantity <= 0) {
      return "Introduce una cantidad válida para cada producto.";
    }
    quantities.set(usage.productId, (quantities.get(usage.productId) ?? 0) + usage.quantity);
  }

  for (const [productId, quantity] of quantities) {
    const product = products.find((item) => item.id === productId);
    if (!product) return "Uno de los productos ya no está disponible.";
    if (quantity > product.stockQuantity) {
      return "La cantidad indicada supera las existencias disponibles.";
    }
  }

  return null;
}