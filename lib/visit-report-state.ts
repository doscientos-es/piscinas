import type { ProductUsageInput } from './visit-validation'

type ReportIntervention = {
  notes: string | null
  intervention_products: Array<{ product_id: string; quantity: number }>
}

export function getInitialVisitReportState(intervention: ReportIntervention | null) {
  return {
    notes: intervention?.notes ?? '',
    usages: (intervention?.intervention_products ?? []).map((usage) => ({
      productId: usage.product_id,
      quantity: Number(usage.quantity),
    })) satisfies ProductUsageInput[],
  }
}