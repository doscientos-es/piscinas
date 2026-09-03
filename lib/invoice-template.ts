export type InvoiceClient = {
  legal_name: string
  tax_id: string | null
  billing_email: string | null
  billing_address: string | null
}

export type InvoiceLine = {
  id: string
  description: string
  quantity: number
  unit_price: number
  vat_rate: number
  line_total: number
}

export type Invoice = {
  id: string
  client_id: string
  number: string | null
  status: string
  subtotal: number
  vat_total: number
  total: number
  issued_on: string | null
  due_on: string | null
  billing_period: string | null
  clients: InvoiceClient | null
  invoice_lines: InvoiceLine[]
}

const moneyFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
const dateFormatter = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' })

export function formatMoney(value: number) {
  return moneyFormatter.format(value)
}

export function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(`${value}T12:00:00`)) : 'Pendiente de emisión'
}

export function getInvoiceLines(invoice: Invoice): InvoiceLine[] {
  if (invoice.invoice_lines.length > 0) return invoice.invoice_lines

  return [
    {
      id: 'maintenance-service',
      description: 'Servicio de mantenimiento de piscina',
      quantity: 1,
      unit_price: invoice.subtotal,
      vat_rate:
        invoice.subtotal > 0 ? Math.round((invoice.vat_total / invoice.subtotal) * 100) : 21,
      line_total: invoice.subtotal,
    },
  ]
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'\"]/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ??
      character,
  )
}

function replaceTemplateLanguage(document: string) {
  return document.replace(
    'Factura generada desde Concepte Blau. Este documento es una plantilla de ejemplo para la demo.',
    'Documento generado desde Concepte Blau. Revise los datos fiscales y los importes antes de enviarlo al cliente.',
  )
}

export function buildInvoiceHtml(invoice: Invoice) {
  const client = invoice.clients
  const lines = getInvoiceLines(invoice)
  const rows = lines
    .map(
      (line) =>
        `<tr><td>${escapeHtml(line.description)}</td><td>${line.quantity}</td><td>${formatMoney(line.unit_price)}</td><td>${line.vat_rate}%</td><td>${formatMoney(line.line_total)}</td></tr>`,
    )
    .join('')

  return replaceTemplateLanguage(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Factura ${escapeHtml(invoice.number ?? invoice.id)}</title><style>body{margin:0;background:#eef5f8;color:#152a3f;font-family:Arial,sans-serif}.invoice{width:min(794px,100%);min-height:1123px;margin:24px auto;background:#fff;padding:64px;box-sizing:border-box}.header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #00aeef;padding-bottom:28px}.brand{color:#052e5a;font-size:28px;font-weight:800}.eyebrow{color:#527087;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.meta{text-align:right}.meta h1{margin:6px 0;font-size:28px;color:#052e5a}.section{display:flex;justify-content:space-between;gap:32px;margin:36px 0}.section h2{font-size:12px;color:#527087;letter-spacing:.08em;text-transform:uppercase}.section p{margin:6px 0;font-size:14px;line-height:1.45}table{width:100%;border-collapse:collapse;margin-top:28px}th{text-align:left;background:#eef7fb;color:#45657b;font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:12px}td{padding:14px 12px;border-bottom:1px solid #dfeaf0;font-size:14px}th:not(:first-child),td:not(:first-child){text-align:right}.totals{margin:28px 0 0 auto;width:300px}.total-row{display:flex;justify-content:space-between;padding:8px 0;font-size:14px}.total{border-top:2px solid #052e5a;color:#052e5a;font-size:19px;font-weight:800;margin-top:8px;padding-top:13px}.footer{margin-top:64px;border-top:1px solid #dfeaf0;padding-top:18px;color:#607b8d;font-size:12px;line-height:1.5}@media print{body{background:#fff}.invoice{margin:0;width:100%;min-height:0}}</style></head><body><main class="invoice"><header class="header"><div><div class="brand">Concepte Blau</div><p class="eyebrow">Gestión y mantenimiento de piscinas</p></div><div class="meta"><span class="eyebrow">Factura</span><h1>${escapeHtml(invoice.number ?? 'Borrador')}</h1><p>Fecha de emisión: ${formatDate(invoice.issued_on)}<br>Vencimiento: ${formatDate(invoice.due_on)}</p></div></header><section class="section"><div><h2>Facturar a</h2><p><strong>${escapeHtml(client?.legal_name ?? 'Cliente sin asignar')}</strong><br>${escapeHtml(client?.tax_id ?? 'NIF pendiente')}<br>${escapeHtml(client?.billing_address ?? 'Dirección de facturación pendiente')}<br>${escapeHtml(client?.billing_email ?? 'Email de facturación pendiente')}</p></div><div><h2>Estado</h2><p>${escapeHtml(invoice.status === 'paid' ? 'Cobrada' : 'Pendiente de cobro')}</p></div></section><table><thead><tr><th>Concepto</th><th>Cant.</th><th>Precio</th><th>IVA</th><th>Importe</th></tr></thead><tbody>${rows}</tbody></table><section class="totals"><div class="total-row"><span>Base imponible</span><strong>${formatMoney(invoice.subtotal)}</strong></div><div class="total-row"><span>IVA</span><strong>${formatMoney(invoice.vat_total)}</strong></div><div class="total-row total"><span>Total</span><span>${formatMoney(invoice.total)}</span></div></section><footer class="footer">Factura generada desde Concepte Blau. Este documento es una plantilla de ejemplo para la demo.</footer></main></body></html>`,
  )
}

export function downloadInvoice(invoice: Invoice) {
  const document = new Blob([buildInvoiceHtml(invoice)], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(document)
  const link = window.document.createElement('a')
  link.href = url
  link.download = `factura-${invoice.number ?? invoice.id}.html`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function printInvoice(invoice: Invoice) {
  const preview = window.open('', '_blank')
  if (!preview) return false
  preview.document.write(buildInvoiceHtml(invoice))
  preview.document.close()
  preview.focus()
  preview.print()
  return true
}
