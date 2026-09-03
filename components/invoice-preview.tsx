"use client";

import { Download, Printer, X } from "lucide-react";
import { type Invoice, formatDate, formatMoney, getInvoiceLines, printInvoice } from "@/lib/invoice-template";

export function InvoicePreview({ invoice, onClose, onDownload }: { invoice: Invoice; onClose: () => void; onDownload: (invoice: Invoice) => void }) {
  const client = invoice.clients;
  const lines = getInvoiceLines(invoice);

  return <div className="invoice-preview-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="invoice-preview" role="dialog" aria-modal="true" aria-labelledby="invoice-preview-title" onMouseDown={(event) => event.stopPropagation()}>
      <header className="invoice-preview-header">
        <div><span className="eyebrow">Vista previa de factura</span><h2 id="invoice-preview-title">{invoice.number ?? "Borrador"}</h2></div>
        <button className="close" type="button" onClick={onClose} aria-label="Cerrar vista previa"><X size={18} aria-hidden="true" /></button>
      </header>
      <article className="invoice-paper">
        <div className="invoice-paper-header"><div><strong>Concepte Blau</strong><span>Gestión y mantenimiento de piscinas</span></div><div><span>FACTURA</span><strong>{invoice.number ?? "Borrador"}</strong><small>Emitida: {formatDate(invoice.issued_on)}</small></div></div>
        <div className="invoice-party"><div><span>Facturar a</span><strong>{client?.legal_name ?? "Cliente sin asignar"}</strong><p>{client?.tax_id ?? "NIF pendiente"}<br />{client?.billing_address ?? "Dirección de facturación pendiente"}<br />{client?.billing_email ?? "Email de facturación pendiente"}</p></div><div><span>Vencimiento</span><strong>{formatDate(invoice.due_on)}</strong><span className={`invoice-status ${invoice.status === "paid" ? "paid" : "pending"}`}>{invoice.status === "paid" ? "Cobrada" : "Pendiente de cobro"}</span></div></div>
        <div className="invoice-lines"><div className="invoice-line-head"><span>Concepto</span><span>Cant.</span><span>Precio</span><span>IVA</span><span>Importe</span></div>{lines.map((line) => <div className="invoice-line" key={line.id}><strong>{line.description}</strong><span>{line.quantity}</span><span>{formatMoney(line.unit_price)}</span><span>{line.vat_rate}%</span><strong>{formatMoney(line.line_total)}</strong></div>)}</div>
        <div className="invoice-totals"><span>Base imponible <strong>{formatMoney(invoice.subtotal)}</strong></span><span>IVA <strong>{formatMoney(invoice.vat_total)}</strong></span><span className="invoice-grand-total">Total <strong>{formatMoney(invoice.total)}</strong></span></div>
        <p className="invoice-note">Plantilla de ejemplo · Los datos de facturación pertenecen al cliente asociado.</p>
      </article>
      <footer className="invoice-preview-actions"><button className="button secondary" type="button" onClick={() => onDownload(invoice)}><Download size={16} aria-hidden="true" />Descargar factura</button><button className="button" type="button" onClick={() => printInvoice(invoice)}><Printer size={16} aria-hidden="true" />Imprimir / guardar PDF</button></footer>
    </section>
  </div>;
}
