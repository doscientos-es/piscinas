import { describe, expect, it } from 'vitest'

import { buildInvoiceHtml, getMonthlyInvoiceBreakdown } from './invoice-template'

describe('buildInvoiceHtml', () => {
  it('ordena las líneas usando el orden de facturación guardado en Supabase', () => {
    const document = buildInvoiceHtml({
      id: 'invoice-order',
      client_id: 'client-1',
      number: null,
      status: 'draft',
      subtotal: 100,
      vat_total: 21,
      total: 121,
      issued_on: '2026-09-01',
      due_on: '2026-09-30',
      billing_period: '2026-09-01',
      clients: null,
      invoice_lines: [
        { id: 'material', sort_order: 10201, description: 'Clor (1 kg)', quantity: 1, unit_price: 20, vat_rate: 21, line_total: 20 },
        { id: 'visit', sort_order: 10200, description: 'Manteniment setmana 2', quantity: 1, unit_price: 0, vat_rate: 0, line_total: 0 },
        { id: 'service', sort_order: 100, description: 'Manteniment piscina', quantity: 1, unit_price: 80, vat_rate: 21, line_total: 80 },
      ],
    })

    expect(document.indexOf('Manteniment piscina')).toBeLessThan(document.indexOf('Manteniment setmana 2'))
    expect(document.indexOf('Manteniment setmana 2')).toBeLessThan(document.indexOf('Clor (1 kg)'))
  })

  it('genera la factura en català', () => {
    const document = buildInvoiceHtml({
      id: 'invoice-1',
      client_id: 'client-1',
      number: null,
      status: 'draft',
      subtotal: 100,
      vat_total: 21,
      total: 121,
      issued_on: '2026-09-01',
      due_on: '2026-09-30',
      billing_period: '2026-09-01',
      clients: null,
      invoice_lines: [],
    })

    expect(document).toContain('<html lang="ca">')
    expect(document).toContain('Gestió i manteniment de piscines')
    expect(document).toContain('Pendent de cobrament')
    expect(document).not.toContain('Gestión y mantenimiento de piscinas')
  })
})

describe('getMonthlyInvoiceBreakdown', () => {
  it('separa la cuota base, los productos y las visitas de un cierre mensual', () => {
    const breakdown = getMonthlyInvoiceBreakdown({
      id: 'monthly-invoice',
      client_id: 'client-1',
      number: null,
      status: 'draft',
      subtotal: 125,
      vat_total: 26.25,
      total: 151.25,
      issued_on: null,
      due_on: null,
      billing_period: '2026-09-01',
      clients: null,
      invoice_lines: [
        { id: 'subscription', contract_id: 'contract-1', description: 'Manteniment piscina', quantity: 1, unit_price: 100, vat_rate: 21, line_total: 100 },
        { id: 'visit', visit_id: 'visit-1', description: 'Manteniment setmana 1', quantity: 1, unit_price: 0, vat_rate: 0, line_total: 0 },
        { id: 'product', billing_item_id: 'item-1', description: 'Clor (2 kg)', quantity: 2, unit_price: 12.5, vat_rate: 21, line_total: 25 },
      ],
    })

    expect(breakdown.subscriptionTotal).toBe(100)
    expect(breakdown.productTotal).toBe(25)
    expect(breakdown.visitCount).toBe(1)
    expect(breakdown.otherTotal).toBe(0)
  })
})
