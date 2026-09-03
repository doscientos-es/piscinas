"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, Download, Eye, EyeOff, FileText, LayoutDashboard, LockKeyhole, LogOut, Mail, UserRound, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { type AuthMode, validateAuthInput } from "@/lib/auth-validation";
import { InvoicePreview } from "@/components/invoice-preview";
import { downloadInvoice, type Invoice } from "@/lib/invoice-template";

type View = "inicio" | "agenda" | "facturacion" | "clientes";
type Visit = { id: string; scheduled_for: string; status: string; installations: { name: string; address: string; clients: { legal_name: string } } | null };
type Client = { id: string; legal_name: string; payment_method: string | null; installations: { id: string }[] };
const money = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const titles: Record<View, string> = { inicio: "Resumen operativo", agenda: "Agenda de visitas", facturacion: "Facturación y cobros", clientes: "Clientes e instalaciones" };

export function DemoApp({ view }: { view: View }) {
  const [ready, setReady] = useState(false); const [signedIn, setSignedIn] = useState(false); const [visits, setVisits] = useState<Visit[]>([]); const [invoices, setInvoices] = useState<Invoice[]>([]); const [clients, setClients] = useState<Client[]>([]); const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => { const s = createClient(); const [v, i, c] = await Promise.all([s.from("visits").select("id,scheduled_for,status,installations(name,address,clients(legal_name))").order("scheduled_for"), s.from("invoices").select("id,number,status,subtotal,vat_total,total,issued_on,due_on,clients(legal_name,tax_id,billing_email,billing_address),invoice_lines(id,description,quantity,unit_price,vat_rate,line_total)").order("created_at", { ascending: false }), s.from("clients").select("id,legal_name,payment_method,installations(id)").order("legal_name")]); const error = v.error || i.error || c.error; if (error) { setMessage(error.message); return; } setVisits((v.data ?? []) as unknown as Visit[]); setInvoices((i.data ?? []) as unknown as Invoice[]); setClients((c.data ?? []) as unknown as Client[]); }, []);
  useEffect(() => { const s = createClient(); s.auth.getSession().then(({ data }) => { setSignedIn(Boolean(data.session)); setReady(true); if (data.session) void load(); }); const { data } = s.auth.onAuthStateChange((_event, session) => { setSignedIn(Boolean(session)); if (session) void load(); }); return () => data.subscription.unsubscribe(); }, [load]);
  if (!ready) return <main className="empty-state">Conectando con Supabase…</main>; if (!signedIn) return <AuthScreen />;
  const complete = async (visit: Visit) => { const s = createClient(); const { error } = await s.from("visits").update({ status: "completed" }).eq("id", visit.id); if (!error) await s.from("interventions").upsert({ visit_id: visit.id, started_at: new Date().toISOString(), completed_at: new Date().toISOString(), customer_notice_status: "not_sent" }, { onConflict: "visit_id" }); setMessage(error ? error.message : "Parte cerrado y guardado en Supabase."); await load(); };
  const pay = async (invoice: Invoice) => { const { error } = await createClient().from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", invoice.id); setMessage(error ? error.message : "Factura marcada como cobrada."); await load(); };
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><Image src="/concepte-blau-logo.png" alt="Concepte Blau" width={450} height={111} priority /></div><nav className="nav"><Nav href="/" label="Resumen" icon={<LayoutDashboard size={18} />} active={view === "inicio"} /><Nav href="/agenda" label="Agenda" icon={<CalendarDays size={18} />} active={view === "agenda"} /><Nav href="/clientes" label="Clientes" icon={<Users size={18} />} active={view === "clientes"} /><Nav href="/facturacion" label="Facturación" icon={<FileText size={18} />} active={view === "facturacion"} /></nav><button className="profile" onClick={() => void createClient().auth.signOut()}><div className="avatar">CB</div><span>Cerrar sesión</span><LogOut size={16} /></button></aside><main className="main"><header className="topbar"><div><span className="eyebrow">Concepte Blau · Supabase</span><h1>{titles[view]}</h1></div></header><div className="content">{message && <p className="toast" role="status">{message}</p>}{view === "inicio" && <Overview visits={visits} invoices={invoices} clients={clients} complete={complete} />}{view === "agenda" && <Agenda visits={visits} complete={complete} />}{view === "facturacion" && <Billing invoices={invoices} pay={pay} />}{view === "clientes" && <Clients clients={clients} />}</div></main></div>;
}
function Nav({ href, label, icon, active }: { href:string; label:string; icon:ReactNode; active:boolean }) { return <Link href={href} aria-current={active ? "page" : undefined}>{icon}<span>{label}</span></Link>; }
function VisitRow({ visit, complete }: { visit:Visit; complete:(v:Visit)=>void }) { const x = visit.installations; return <div className="visit"><div className="time">{new Intl.DateTimeFormat("es-ES", { hour:"2-digit", minute:"2-digit" }).format(new Date(visit.scheduled_for))}</div><div><div className="visit-title">{x?.clients?.legal_name ?? "Cliente"}</div><div className="visit-meta">{x?.name ?? "Instalación"} · {x?.address ?? ""}</div></div>{visit.status === "completed" ? <span className="badge ok">Completada</span> : <button className="badge progress" onClick={() => complete(visit)}>Cerrar parte</button>}</div>; }
function Overview({ visits, invoices, clients, complete }: { visits:Visit[]; invoices:Invoice[]; clients:Client[]; complete:(v:Visit)=>void }) { const due = invoices.filter((i) => i.status !== "paid"); return <><section className="intro"><div><h2>Datos reales, sin hojas de cálculo.</h2><p>Clientes, visitas y facturas se cargan directamente de Supabase.</p></div><Link className="button accent" href="/agenda">Ver agenda</Link></section><section className="stats"><Stat label="Visitas" value={String(visits.length)} foot={`${visits.filter((v) => v.status === "completed").length} completadas`} /><Stat label="Clientes" value={String(clients.length)} foot="Desde la tabla clients" /><Stat label="Facturas pendientes" value={String(due.length)} foot={money.format(due.reduce((n, i) => n + Number(i.total), 0))} /><Stat label="Facturación" value={money.format(invoices.reduce((n, i) => n + Number(i.total), 0))} foot="Desde invoices" /></section><section className="card" style={{ marginTop:18 }}><div className="card-head"><h3>Próximas visitas</h3></div>{visits.map((v) => <VisitRow key={v.id} visit={v} complete={complete} />)}</section></>; }
function Stat({ label,value,foot }:{label:string;value:string;foot:string}) { return <div className="stat"><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-foot">{foot}</div></div>; }
function Agenda({ visits, complete }:{visits:Visit[];complete:(v:Visit)=>void}) { return <><section className="intro"><div><h2>Agenda desde Supabase</h2><p>Tabla <code>visits</code>, unida a instalaciones y clientes.</p></div></section><section className="agenda-list">{visits.map((v) => <VisitRow key={v.id} visit={v} complete={complete} />)}</section></>; }
function Billing({ invoices,pay }:{invoices:Invoice[];pay:(i:Invoice)=>void}) { const [previewedInvoice, setPreviewedInvoice] = useState<Invoice | null>(null); return <><section className="intro"><div><h2>Facturación persistente</h2><p>Consulta, descarga o guarda en PDF cada factura con los datos de su cliente.</p></div></section><div className="invoice-list">{invoices.map((i) => <div className="invoice" key={i.id}><div><strong>{i.clients?.legal_name ?? "Cliente"}</strong><span>{i.number ?? "Borrador"} · {i.issued_on ?? "Sin emitir"}</span></div><span className="invoice-total">{money.format(Number(i.total))}</span><div className="invoice-actions"><button className="action-link" type="button" onClick={() => setPreviewedInvoice(i)}>Ver factura</button><button className="action-link" type="button" onClick={() => downloadInvoice(i)}><Download size={15} aria-hidden="true" />Descargar</button></div>{i.status === "paid" ? <span className="badge ok">Cobrada</span> : <button className="badge progress" onClick={() => pay(i)}>Marcar cobrada</button>}</div>)}</div>{previewedInvoice && <InvoicePreview invoice={previewedInvoice} onClose={() => setPreviewedInvoice(null)} onDownload={downloadInvoice} />}</>; }
function Clients({ clients }:{clients:Client[]}) { return <><section className="intro"><div><h2>Clientes reales</h2><p>Consulta <code>clients</code> e <code>installations</code>.</p></div></section><div className="card"><table className="table"><thead><tr><th>Cliente</th><th>Instalaciones</th><th>Cobro</th></tr></thead><tbody>{clients.map((c) => <tr key={c.id}><td><strong>{c.legal_name}</strong></td><td>{c.installations.length}</td><td>{c.payment_method ?? "Sin definir"}</td></tr>)}</tbody></table></div></>; }
function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegister = mode === "register";

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setFeedback(null);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validateAuthInput({ email, password, name, mode });
    if (validationError) {
      setFeedback({ kind: "error", text: validationError });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    const supabase = createClient();
    const result = isRegister
      ? await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() } } })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });

    setIsSubmitting(false);
    if (result.error) {
      setFeedback({ kind: "error", text: result.error.message });
      return;
    }

    if (isRegister && !result.data.session) {
      setFeedback({ kind: "success", text: "Cuenta creada. Revisa tu correo para confirmarla y después inicia sesión." });
      return;
    }
    setFeedback({ kind: "success", text: isRegister ? "Cuenta creada. Ya puedes acceder al panel." : "Sesión iniciada. Cargando el panel…" });
  };

  return <main className="auth-page">
    <section className="auth-brand-panel" aria-label="Concepte Blau">
      <Image className="auth-logo" src="/concepte-blau-logo.png" alt="Concepte Blau" width={450} height={111} priority />
      <div className="auth-brand-copy">
        <span className="auth-kicker">Gestión de mantenimiento</span>
        <h1>Todo el control de tus piscinas, en un solo lugar.</h1>
        <p>Centraliza visitas, clientes y facturación con datos protegidos y siempre actualizados.</p>
      </div>
      <ul className="auth-benefits">
        <li><CheckCircle2 size={18} aria-hidden="true" />Agenda y partes de trabajo</li>
        <li><CheckCircle2 size={18} aria-hidden="true" />Clientes e instalaciones conectados</li>
        <li><CheckCircle2 size={18} aria-hidden="true" />Facturación y cobros al día</li>
      </ul>
    </section>
    <section className="auth-form-panel">
      <div className="auth-card">
        <div className="auth-mobile-logo"><Image src="/concepte-blau-logo.png" alt="Concepte Blau" width={450} height={111} priority /></div>
        <div className="auth-heading">
          <span className="auth-eyebrow"><LockKeyhole size={15} aria-hidden="true" />Área privada</span>
          <h2>{isRegister ? "Crea tu cuenta" : "Bienvenido de nuevo"}</h2>
          <p>{isRegister ? "Regístrate para empezar a gestionar tu operativa." : "Accede para continuar con tu operativa diaria."}</p>
        </div>
        <div className="auth-tabs" role="tablist" aria-label="Opciones de acceso">
          <button type="button" className={!isRegister ? "active" : ""} role="tab" aria-selected={!isRegister} onClick={() => changeMode("login")}>Iniciar sesión</button>
          <button type="button" className={isRegister ? "active" : ""} role="tab" aria-selected={isRegister} onClick={() => changeMode("register")}>Crear cuenta</button>
        </div>
        <form className="auth-form" onSubmit={submit} noValidate>
          {isRegister && <label className="auth-field">
            <span>Nombre completo</span>
            <div className="auth-input"><UserRound size={18} aria-hidden="true" /><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Tu nombre" /></div>
          </label>}
          <label className="auth-field">
            <span>Correo electrónico</span>
            <div className="auth-input"><Mail size={18} aria-hidden="true" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputMode="email" placeholder="nombre@empresa.com" /></div>
          </label>
          <label className="auth-field">
            <span>Contraseña</span>
            <div className="auth-input"><LockKeyhole size={18} aria-hidden="true" /><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isRegister ? "new-password" : "current-password"} placeholder="Mínimo 8 caracteres" /><button className="auth-password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            {isRegister && <small>Usa al menos 8 caracteres.</small>}
          </label>
          {feedback && <p className={`auth-feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.text}</p>}
          <button className="auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? "Comprobando…" : isRegister ? "Crear cuenta" : "Entrar al panel"}<ArrowRight size={18} aria-hidden="true" /></button>
        </form>
        <p className="auth-switch">{isRegister ? "¿Ya tienes cuenta?" : "¿Aún no tienes cuenta?"}<button type="button" onClick={() => changeMode(isRegister ? "login" : "register")}>{isRegister ? "Inicia sesión" : "Crea una ahora"}</button></p>
      </div>
    </section>
  </main>;
}
