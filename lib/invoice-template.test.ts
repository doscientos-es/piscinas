import { describe, expect, it } from 'vitest'

import { buildInvoiceHtml } from './invoice-template'

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
