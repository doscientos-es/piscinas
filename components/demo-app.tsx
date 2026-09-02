"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  Menu,
  Package,
  Plus,
  Search,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { clients, euros, seedInvoices, todayVisits, type Invoice, type Visit } from "@/lib/demo-data";

type View = "inicio" | "agenda" | "facturacion" | "clientes";

const navigation = [
  { href: "/", label: "Resumen", icon: LayoutDashboard, view: "inicio" },
  { href: "/agenda", label: "Agenda", icon: CalendarDays, view: "agenda" },
  { href: "/clientes", label: "Clientes", icon: Users, view: "clientes" },
  { href: "/facturacion", label: "Facturación", icon: FileText, view: "facturacion" },
];

export function DemoApp({ view }: { view: View }) {
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [completed, setCompleted] = useState<string[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>(seedInvoices);
  const [toast, setToast] = useState<string | null>(null);
  const displayedVisits = useMemo(
    () => todayVisits.map((visit) => (completed.includes(visit.id) ? { ...visit, status: "Completada" as const } : visit)),
    [completed],
  );

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3400);
  };

  const closeVisit = (id: string) => {
    setCompleted((current) => [...current, id]);
    setSelectedVisit(null);
    notify("Parte guardado. El consumo queda pendiente de facturar y el aviso por email está registrado.");
  };

  const createBatch = () => {
    setInvoices((current) => [{ id: "F-2026-085", client: "Casa Sol", period: "Septiembre 2026", total: 224.10, status: "Borrador" }, ...current]);
    notify("Se ha creado un borrador de factura con cuota y conceptos pendientes.");
  };

  const markPaid = (id: string) => {
    setInvoices((current) => current.map((invoice) => (invoice.id === id ? { ...invoice, status: "Cobrada" } : invoice)));
    notify("Factura marcada como cobrada.");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><Image src="/concepte-blau-logo.png" alt="Concepte Blau" width={450} height={111} priority /></div>
        <nav className="nav" aria-label="Navegación principal">
          {navigation.map(({ href, label, icon: Icon, view: navView }) => <Link key={href} href={href} aria-current={view === navView ? "page" : undefined}><Icon size={18} aria-hidden="true" /><span>{label}</span></Link>)}
          <a href="#inventario"><Package size={18} aria-hidden="true" /><span>Inventario</span></a>
        </nav>
        <div className="profile"><div className="avatar" aria-hidden="true">LT</div><div><strong>Lucía Torres</strong><br /><span>Administración</span></div></div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div><span className="eyebrow">Mantenimiento de piscinas</span><h1>{titles[view]}</h1></div>
          <div className="top-actions"><button className="icon-button" aria-label="Abrir notificaciones"><Bell size={18} /></button><button className="button"><Plus size={17} />Nueva visita</button></div>
        </header>
        <div className="content">
          {view === "inicio" && <Overview visits={displayedVisits} onOpen={setSelectedVisit} />}
          {view === "agenda" && <Agenda visits={displayedVisits} onOpen={setSelectedVisit} />}
          {view === "facturacion" && <Billing invoices={invoices} onCreate={createBatch} onPay={markPaid} />}
          {view === "clientes" && <Clients />}
        </div>
      </main>
      {selectedVisit && <Intervention visit={selectedVisit} onClose={() => setSelectedVisit(null)} onComplete={closeVisit} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

const titles: Record<View, string> = { inicio: "Hoy, miércoles 2 de septiembre", agenda: "Agenda de visitas", facturacion: "Facturación y cobros", clientes: "Clientes e instalaciones" };

function Overview({ visits, onOpen }: { visits: Visit[]; onOpen: (visit: Visit) => void }) {
  return <>
    <section className="intro"><div><h2>Una jornada en orden.</h2><p>Todo lo que necesita el equipo para cuidar cada piscina, sin papel.</p></div><Link className="button accent" href="/agenda"><CalendarDays size={17} />Ver agenda</Link></section>
    <section className="stats" aria-label="Resumen de actividad"><Stat label="Visitas de hoy" value="6" foot="3 completadas" /><Stat label="Pendientes de facturar" value={euros.format(1_248.6)} foot="12 conceptos este mes" /><Stat label="Facturas pendientes" value="4" foot="1 vencida" warning /><Stat label="Stock bajo" value="3 artículos" foot="Revisar inventario" warning /></section>
    <section className="grid"><div className="card"><div className="card-head"><h3>Próximas visitas</h3><Link href="/agenda" className="card-link">Ver agenda <ChevronRight size={14} /></Link></div>{visits.map((visit) => <VisitRow key={visit.id} visit={visit} onOpen={onOpen} />)}</div><div><div className="notice"><h3>Cierre mensual listo</h3><p>Hay 12 conceptos asociados a intervenciones pendientes de incluir en las facturas de septiembre.</p><Link href="/facturacion" className="button">Preparar facturas</Link></div><div className="card" style={{ marginTop: 18 }}><div className="card-head"><h3>Actividad reciente</h3></div><Activity text="Parte cerrado en Residencial Miramar" time="Hace 12 min" /><Activity text="Factura F-2026-083 enviada por email" time="Hace 1 h" /><Activity text="Stock de cloro granulado actualizado" time="Ayer" /></div></div></section>
  </>;
}

function Stat({ label, value, foot, warning = false }: { label: string; value: string; foot: string; warning?: boolean }) { return <div className="stat"><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className={`stat-foot ${warning ? "warn" : ""}`}>{foot}</div></div>; }
function Activity({ text, time }: { text: string; time: string }) { return <div className="activity"><span className="activity-dot" /><div><p>{text}</p><time>{time}</time></div></div>; }
function VisitRow({ visit, onOpen }: { visit: Visit; onOpen: (visit: Visit) => void }) { return <div className="visit"><div className="time">{visit.time}<span>{visit.technician.split(" ")[0]}</span></div><div><div className="visit-title">{visit.client}</div><div className="visit-meta">{visit.pool} · {visit.address}</div></div><button className={`badge ${visit.status === "En curso" ? "progress" : visit.status === "Completada" ? "ok" : "pending"}`} onClick={() => onOpen(visit)}>{visit.status === "Pendiente" ? "Abrir parte" : visit.status}</button></div>; }

function Agenda({ visits, onOpen }: { visits: Visit[]; onOpen: (visit: Visit) => void }) {
  const [filter, setFilter] = useState("");
  const filtered = visits.filter((visit) => `${visit.client} ${visit.pool}`.toLowerCase().includes(filter.toLowerCase()));
  return <><section className="intro"><div><h2>Visitas asignadas</h2><p>Organiza el día y entra al parte en un toque.</p></div><button className="button"><Plus size={17} />Asignar visita</button></section><div className="toolbar"><label><span className="sr-only">Buscar visita</span><input className="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Buscar cliente o piscina" /></label><div className="segmented" aria-label="Vista de agenda"><button className="active">Hoy</button><button>Semana</button></div></div><section className="agenda-list"><div className="day-title">MIÉRCOLES, 2 DE SEPTIEMBRE · 6 VISITAS</div>{filtered.map((visit) => <div className="agenda-row" key={visit.id}><div className="time">{visit.time}</div><div className="pool-details"><div className="pool-thumb" aria-hidden="true" /><div><strong>{visit.client}</strong><small>{visit.pool} · {visit.address}</small></div></div><div><strong>{visit.technician}</strong><small>{visit.instructions}</small></div><button className="action-link" onClick={() => onOpen(visit)}>{visit.status === "Completada" ? "Ver parte" : "Abrir parte"} <ChevronRight size={15} /></button></div>)}</section></>;
}

function Billing({ invoices, onCreate, onPay }: { invoices: Invoice[]; onCreate: () => void; onPay: (id: string) => void }) {
  return <><section className="intro"><div><h2>Todo preparado para cobrar.</h2><p>Las cuotas, consumos y extras llegan agrupados para su revisión.</p></div><button className="button accent" onClick={onCreate}><FileText size={17} />Generar borradores</button></section><section className="grid"><div className="card"><div className="card-head"><h3>Facturas de septiembre</h3><span className="badge progress">{invoices.filter((item) => item.status === "Borrador").length} borradores</span></div><div className="invoice-list">{invoices.map((invoice) => <div className="invoice" key={invoice.id}><div><strong>{invoice.client}</strong><span>{invoice.id} · {invoice.period}</span></div><span>Cuota + consumos asociados</span><span className="invoice-total">{euros.format(invoice.total)}</span><button className={`badge ${invoice.status === "Cobrada" ? "ok" : invoice.status === "Borrador" ? "progress" : "pending"}`} onClick={() => invoice.status !== "Cobrada" && onPay(invoice.id)}>{invoice.status === "Emitida" ? "Marcar cobrada" : invoice.status}</button></div>)}</div></div><div className="card"><h3>Resumen de lote</h3><div className="kpi-box"><div className="kpi-icon"><CircleDollarSign size={19} /></div><div><strong>{euros.format(1_248.6)}</strong><br /><span className="visit-meta">Facturación prevista</span></div></div><div className="kpi-box"><div className="kpi-icon"><Package size={19} /></div><div><strong>12 consumos</strong><br /><span className="visit-meta">Vinculados a partes cerrados</span></div></div><p className="visit-meta" style={{ marginTop: 18 }}>Demo local: el PDF, el email y el cobro se muestran como estados simulados.</p></div></section></>;
}

function Clients() { return <><section className="intro"><div><h2>Clientes e instalaciones</h2><p>Una ficha única para contrato, historial y piscinas.</p></div><button className="button"><Plus size={17} />Nuevo cliente</button></section><div className="card"><div className="card-head"><h3>Clientes activos</h3><label><span className="sr-only">Buscar clientes</span><input className="search" placeholder="Buscar cliente" /></label></div><table className="table"><thead><tr><th>Cliente</th><th>Instalaciones</th><th>Contrato</th><th>Próxima visita</th><th>Estado</th></tr></thead><tbody>{clients.map((client) => <tr key={client.name}><td><strong>{client.name}</strong></td><td>{client.pools} piscina{client.pools > 1 ? "s" : ""}</td><td>{client.contract}</td><td>{client.next}</td><td><span className="badge ok">{client.status}</span></td></tr>)}</tbody></table></div></>;
}

function Intervention({ visit, onClose, onComplete }: { visit: Visit; onClose: () => void; onComplete: (id: string) => void }) {
  const [started, setStarted] = useState(visit.status === "En curso");
  return <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="intervention-title"><div className="modal-title"><div><h2 id="intervention-title">Parte de intervención</h2><p>{visit.client} · {visit.pool} · {visit.time}</p></div><button className="close" onClick={onClose} aria-label="Cerrar parte"><X size={20} /></button></div><p className="section-label">Control de visita</p><button className="button secondary" onClick={() => setStarted((state) => !state)}><ClipboardCheck size={16} />{started ? "Visita iniciada · 09:04" : "Iniciar visita"}</button><p className="section-label">Tareas realizadas</p><div className="checks"><label className="check"><input type="checkbox" defaultChecked />Limpiar superficie y cestos</label><label className="check"><input type="checkbox" defaultChecked />Revisar filtración</label><label className="check"><input type="checkbox" />Limpiar filtro</label></div><p className="section-label">Lecturas del agua</p><div className="readings"><div className="field"><label htmlFor="chlorine">Cloro (ppm)</label><input id="chlorine" defaultValue="1,5" /></div><div className="field"><label htmlFor="ph">pH</label><input id="ph" defaultValue="7,3" /></div><div className="field"><label htmlFor="alkalinity">Alcalinidad (ppm)</label><input id="alkalinity" defaultValue="95" /></div></div><p className="section-label">Consumo facturable</p><div className="summary-product"><span>Cloro granulado · 5 kg</span><strong>{euros.format(22.6)}</strong></div><div className="modal-foot"><button className="button secondary" onClick={onClose}>Guardar borrador</button><button className="button" onClick={() => onComplete(visit.id)}><CheckCircle2 size={17} />Cerrar parte</button></div></section></div>;
}
