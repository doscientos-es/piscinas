import { describe, expect, it } from 'vitest'

import { getInitialVisitReportState } from './visit-report-state'

describe('getInitialVisitReportState', () => {
  it('inicializa el parte desde su única intervención asociada', () => {
    expect(
      getInitialVisitReportState({
        notes: 'Limpieza realizada',
        intervention_products: [{ product_id: 'cloro', quantity: 1.5 }],
      }),
    ).toEqual({ notes: 'Limpieza realizada', usages: [{ productId: 'cloro', quantity: 1.5 }] })
  })
})