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
            <span className="eyebrow">Vista prèvia de la factura</span>
            <DialogTitle>{invoice.number ?? 'Esborrany'}</DialogTitle>
          </div>
          <div className="invoice-preview-actions" aria-label="Accions de la factura">
            <Button variant="outline" type="button" onClick={() => onDownload(invoice)}>
              <Download size={16} aria-hidden="true" />
              Descarrega
            </Button>
            <Button type="button" onClick={() => printInvoice(invoice)}>
              <Printer size={16} aria-hidden="true" />
              Imprimeix
            </Button>
          </div>
        </DialogHeader>
        <article className="invoice-paper">
          <div className="invoice-paper-header">
            <div>
              <strong>Concepte Blau</strong>
              <span>Gestió i manteniment de piscines</span>
            </div>
            <div>
              <span>FACTURA</span>
              <strong>{invoice.number ?? 'Esborrany'}</strong>
              <small>Emesa: {formatDate(invoice.issued_on)}</small>
            </div>
          </div>
          <div className="invoice-party">
            <div>
              <span>Factura a</span>
              <strong>{client?.legal_name ?? 'Client sense assignar'}</strong>
              <p>
                {client?.tax_id ?? 'NIF pendent'}
                <br />
                {client?.billing_address ?? 'Adreça de facturació pendent'}
                <br />
                {client?.billing_email ?? 'Adreça electrònica de facturació pendent'}
              </p>
            </div>
            <div>
              <span>Venciment</span>
              <strong>{formatDate(invoice.due_on)}</strong>
              <span className={`invoice-status ${invoice.status === 'paid' ? 'paid' : 'pending'}`}>
                {invoice.status === 'paid' ? 'Cobrada' : 'Pendent de cobrament'}
              </span>
            </div>
          </div>
          <div className="invoice-lines">
            <div className="invoice-line-head">
              <span>Concepte</span>
              <span>Quant.</span>
              <span>Preu</span>
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
              Base imposable <strong>{formatMoney(invoice.subtotal)}</strong>
            </span>
            <span>
              IVA <strong>{formatMoney(invoice.vat_total)}</strong>
            </span>
            <span className="invoice-grand-total">
              Total <strong>{formatMoney(invoice.total)}</strong>
            </span>
          </div>
          <p className="invoice-note">
            Revisa els imports, el venciment i les dades de facturació abans d'enviar la factura al
            client.
          </p>
        </article>
      </DialogContent>
    </Dialog>
  )
}
