'use client'

import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@doscientos/ui'
import { Download, Printer } from 'lucide-react'

import {
  type Invoice,
  formatDate,
  formatMoney,
  getInvoiceLines,
  printInvoice,
} from '@/lib/invoice-template'

export function InvoicePreview({
  invoice,
  onClose,
  onDownload,
}: {
  invoice: Invoice
  onClose: () => void
  onDownload: (invoice: Invoice) => void
}) {
  const client = invoice.clients
  const lines = getInvoiceLines(invoice)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="invoice-preview" showCloseButton>
        <DialogHeader className="invoice-preview-header">
          <div className="invoice-preview-title">
            <span className="eyebrow">Vista previa de la factura</span>
            <DialogTitle>{invoice.number ?? 'Borrador'}</DialogTitle>
          </div>
          <div className="invoice-preview-actions" aria-label="Acciones de la factura">
            <Button variant="outline" type="button" onClick={() => onDownload(invoice)}>
              <Download size={16} aria-hidden="true" />
              Descargar
            </Button>
            <Button type="button" onClick={() => printInvoice(invoice)}>
              <Printer size={16} aria-hidden="true" />
              Imprimir
            </Button>
          </div>
        </DialogHeader>
        <article className="invoice-paper">
          <div className="invoice-paper-header">
            <div>
              <strong>Gestión de piscinas</strong>
              <span>Operativa de mantenimiento</span>
            </div>
            <div>
              <span>FACTURA</span>
              <strong>{invoice.number ?? 'Borrador'}</strong>
              <small>Emitida: {formatDate(invoice.issued_on)}</small>
            </div>
          </div>
          <div className="invoice-party">
            <div>
              <span>Factura a</span>
              <strong>{client?.legal_name ?? 'Cliente sin asignar'}</strong>
              <p>
                {client?.tax_id ?? 'NIF pendiente'}
                <br />
                {client?.billing_address ?? 'Dirección de facturación pendiente'}
                <br />
                {client?.billing_email ?? 'Correo electrónico de facturación pendiente'}
              </p>
            </div>
            <div>
              <span>Vencimiento</span>
              <strong>{formatDate(invoice.due_on)}</strong>
              <span className={`invoice-status ${invoice.status === 'paid' ? 'paid' : 'pending'}`}>
                {invoice.status === 'paid' ? 'Cobrada' : 'Pendiente de cobro'}
              </span>
            </div>
          </div>
          <div className="invoice-lines">
            <div className="invoice-line-head">
              <span>Concepto</span>
              <span>Cant.</span>
              <span>Precio</span>
              <span>IVA</span>
              <span>Import</span>
            </div>
            {lines.map((line) => (
              <div className="invoice-line" key={line.id}>
                <strong>{line.description}</strong>
                <span>{line.quantity}</span>
                <span>{formatMoney(line.unit_price)}</span>
                <span>{line.vat_rate}%</span>
                <strong>{formatMoney(line.line_total)}</strong>
              </div>
            ))}
          </div>
          <div className="invoice-totals">
            <span>
              Base imponible <strong>{formatMoney(invoice.subtotal)}</strong>
            </span>
            <span>
              IVA <strong>{formatMoney(invoice.vat_total)}</strong>
            </span>
            <span className="invoice-grand-total">
              Total <strong>{formatMoney(invoice.total)}</strong>
            </span>
          </div>
          <p className="invoice-note">
            Revisa los importes, el vencimiento y los datos de facturación antes de enviar la factura
            al cliente.
          </p>
        </article>
      </DialogContent>
    </Dialog>
  )
}
