import { describe, expect, it } from 'vitest'

import { buildInvoiceHtml } from './invoice-template'

describe('buildInvoiceHtml', () => {
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