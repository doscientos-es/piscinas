'use client'

import { Button, ConfirmDialog, PopoverContent, PopoverTrigger } from '@doscientos/ui'
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  Eye,
  EyeOff,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  Package,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { AdminStatistics } from '@/components/admin-statistics'
import { Inventory, type Product } from '@/components/inventory'
import { InvoicePreview } from '@/components/invoice-preview'
import { VisitReport } from '@/components/visit-report'
import { WorkHistory } from '@/components/work-history'
import { getAgendaVisitAction } from '@/lib/agenda-access'
import { canAccessAppView, type AccountRole } from '@/lib/app-access'
import { validateAuthInput, type AuthMode } from '@/lib/auth-validation'
import { downloadInvoice, formatDate, getInvoiceLines, type Invoice } from '@/lib/invoice-template'
import { isLocationSchemaPending } from '@/lib/location-schema-compatibility'
import {
  filterInvoicesByBillingPeriod,
  formatBillingPeriod,
  getBillingPeriodOptions,
  getPreviousBillingPeriod,
  toBillingPeriodValue,
} from '@/lib/monthly-billing'
import { createClient } from '@/lib/supabase/client'
import {
  defaultTimeTrackingPolicy,
  getStartExceptions,
  startExceptionLabel,
  type StartException,
  type TimeTrackingPolicy,
  type TrackingCoordinates,
} from '@/lib/time-tracking-policy'
import { getVisitStartWarning } from '@/lib/visit-start-validation'
import type { PendingWorkInput, WorkInstallation, WorkTechnician } from '@/lib/work-history'

type View =
  | 'inicio'
  | 'agenda'
  | 'trabajos'
  | 'facturacion'
  | 'clientes'
  | 'inventario'
  | 'estadisticas'
  | 'parte'
type Visit = {
  id: string
  installation_id: string
  scheduled_for: string
  status: string
  technician_id: string | null
  technician: { full_name: string } | null
  installations: {
    name: string
    address: string
    location_latitude: number | null
    location_longitude: number | null
    clients: { legal_name: string }
  } | null
  interventions: { completed_at: string | null; notes: string | null } | null
}
type Installation = {
  id: string
  name: string
  address: string
  pool_type: string | null
  instructions: string | null
  notes: string | null
  location_latitude: number | null
  location_longitude: number | null
}
type Client = {
  id: string
  legal_name: string
  trade_name: string | null
  tax_id: string | null
  billing_email: string | null
  phone: string | null
  billing_address: string | null
  payment_method: string | null
  notes: string | null
  contact_name: string | null
  contact_role: string | null
  contact_email: string | null
  contact_phone: string | null
  client_type: ClientType
  billing_frequency: BillingFrequency
  payment_terms_days: number
  active: boolean
  installations: Installation[]
}
type ClientType = 'residential' | 'community' | 'hotel' | 'business'
type BillingFrequency = 'monthly' | 'quarterly' | 'per_visit'
type ClientInput = Omit<Client, 'id' | 'installations'>
type InstallationInput = Omit<Installation, 'id'>
const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
const titles: Record<View, string> = {
  inicio: 'Resumen operativo',
  agenda: 'Agenda de visitas',
  trabajos: 'Historial de trabajos',
  facturacion: 'Facturación y cobros',
  clientes: 'Clientes e instalaciones',
  inventario: 'Inventario de materiales',
  estadisticas: 'Estadísticas',
  parte: 'Parte de visita',
}

export function DemoApp({ view, visitId }: { view: View; visitId?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [ready, setReady] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [role, setRole] = useState<AccountRole | null>(null)
  const [accountName, setAccountName] = useState('Tu cuenta')
  const [accountEmail, setAccountEmail] = useState('')
  const [clientSchemaReady, setClientSchemaReady] = useState(true)
  const [visits, setVisits] = useState<Visit[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [technicians, setTechnicians] = useState<WorkTechnician[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [inventorySchemaReady, setInventorySchemaReady] = useState(true)
  const [productCreationVersion, setProductCreationVersion] = useState(0)
  const [statisticsReload, setStatisticsReload] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [visitToStart, setVisitToStart] = useState<Visit | null>(null)
  const [editingClient, setEditingClient] = useState<Client | null | 'new'>(null)
  const [startingVisit, setStartingVisit] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [startPosition, setStartPosition] = useState<TrackingCoordinates | null>(null)
  const [startExceptions, setStartExceptions] = useState<StartException[]>([])
  const [requiresExceptionReason, setRequiresExceptionReason] = useState(false)
  const [exceptionReason, setExceptionReason] = useState('')
  const [timeTrackingPolicy, setTimeTrackingPolicy] =
    useState<TimeTrackingPolicy>(defaultTimeTrackingPolicy)
  const load = useCallback(async () => {
    const s = createClient()
    const { data: userData, error: userError } = await s.auth.getUser()
    if (userError || !userData.user) {
      setMessage(userError?.message ?? 'No se ha podido identificar la sesión.')
      return
    }
    const profile = await s
      .from('profiles')
      .select('role,full_name')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (profile.error || !profile.data) {
      setMessage(profile.error?.message ?? 'No se ha encontrado el perfil de acceso.')
      return
    }
    const accountRole = profile.data.role as AccountRole
    setRole(accountRole)
    const metadataName = userData.user.user_metadata.full_name
    const fallbackName =
      typeof metadataName === 'string' ? metadataName.trim() : userData.user.email?.split('@')[0]
    setAccountName(profile.data.full_name?.trim() || fallbackName || 'Tu cuenta')
    setAccountEmail(userData.user.email ?? '')

    const invoicesRequest =
      accountRole === 'admin'
        ? s
            .from('invoices')
            .select(
              'id,client_id,number,status,subtotal,vat_total,total,issued_on,due_on,billing_period,clients(legal_name,tax_id,billing_email,billing_address),invoice_lines(id,description,quantity,unit_price,vat_rate,line_total)',
            )
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null })
    const techniciansRequest =
      accountRole === 'admin'
        ? s.from('profiles').select('id,full_name').eq('role', 'technician').order('full_name')
        : Promise.resolve({ data: [] as WorkTechnician[], error: null })
    const [v, i, p, settings, techniciansResult] = await Promise.all([
      s
        .from('visits')
        .select(
          'id,installation_id,scheduled_for,status,technician_id,technician:profiles!visits_technician_id_fkey(full_name),installations(name,address,location_latitude,location_longitude,clients(legal_name)),interventions(completed_at,notes)',
        )
        .order('scheduled_for'),
      invoicesRequest,
      s
        .from('products')
        .select(
          'id,name,reference,category,unit,sale_price,cost_price,stock_quantity,minimum_stock,active',
        )
        .order('name'),
      s
        .from('time_tracking_settings')
        .select(
          'early_start_tolerance_minutes,late_start_tolerance_minutes,geofence_radius_m,max_location_accuracy_m,require_exception_reason',
        )
        .eq('id', true)
        .maybeSingle(),
      techniciansRequest,
    ])
    const locationSchemaPending = isLocationSchemaPending(v.error?.message)
    const visitResponse = locationSchemaPending
      ? await s
          .from('visits')
          .select(
            'id,installation_id,scheduled_for,status,technician_id,technician:profiles!visits_technician_id_fkey(full_name),installations(name,address,clients(legal_name)),interventions(completed_at,notes)',
          )
          .order('scheduled_for')
      : v
    const extendedClients =
      accountRole === 'admin'
        ? await s
            .from('clients')
            .select(
              'id,legal_name,trade_name,tax_id,billing_email,phone,billing_address,payment_method,notes,contact_name,contact_role,contact_email,contact_phone,client_type,billing_frequency,payment_terms_days,active,installations(id,name,address,pool_type,instructions,notes,location_latitude,location_longitude)',
            )
            .order('legal_name')
        : null
    const migrationPending =
      extendedClients?.error?.message.includes('column clients.trade_name does not exist') ||
      isLocationSchemaPending(extendedClients?.error?.message)
    const clientResponse = migrationPending
      ? await s
          .from('clients')
          .select(
            'id,legal_name,tax_id,billing_email,phone,billing_address,payment_method,notes,installations(id,name,address,pool_type,instructions,notes)',
          )
          .order('legal_name')
      : (extendedClients ?? { data: [], error: null })
    setClientSchemaReady(!migrationPending)
    const inventoryMigrationPending = p.error?.message.includes(
      'column products.minimum_stock does not exist',
    )
    const error =
      visitResponse.error ||
      i.error ||
      clientResponse.error ||
      techniciansResult.error ||
      (inventoryMigrationPending ? null : p.error)
    if (error) {
      setMessage(error.message)
      return
    }
    setVisits((visitResponse.data ?? []) as unknown as Visit[])
    setInvoices((i.data ?? []) as unknown as Invoice[])
    setClients((clientResponse.data ?? []).map((client) => normalizeClient(client)) as Client[])
    setTechnicians((techniciansResult.data ?? []) as WorkTechnician[])
    setProducts((p.data ?? []) as Product[])
    setInventorySchemaReady(!inventoryMigrationPending)
    setTimeTrackingPolicy(
      settings.data
        ? { ...defaultTimeTrackingPolicy, ...(settings.data as Partial<TimeTrackingPolicy>) }
        : defaultTimeTrackingPolicy,
    )
  }, [])
  useEffect(() => {
    const s = createClient()
    s.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session))
      setReady(true)
      if (data.session) void load()
    })
    const { data } = s.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session))
      if (session) {
        void load()
      } else {
        setRole(null)
        setAccountName('Tu cuenta')
        setAccountEmail('')
      }
    })
    return () => data.subscription.unsubscribe()
  }, [load])
  useEffect(() => {
    if (role && !canAccessAppView(role, view)) router.replace('/agenda')
  }, [role, router, view])
  if (!ready) return <main className="empty-state">Cargando tu operativa…</main>
  if (!signedIn) return <AuthScreen />
  if (!role) return <main className="empty-state">Cargando tus permisos…</main>
  const isAdmin = role === 'admin'
  const activeView = canAccessAppView(role, view) ? view : 'agenda'
  const signOut = async () => {
    if (isSigningOut) return

    setIsSigningOut(true)
    setSignOutError(null)
    const { error } = await createClient().auth.signOut()

    if (error) {
      setSignOutError('No se ha podido cerrar la sesión. Inténtalo de nuevo.')
      setIsSigningOut(false)
      return
    }

    setSignedIn(false)
    router.replace('/')
    router.refresh()
  }
  const requestStart = (visit: Visit) => {
    setMessage(null)
    setStartError(null)
    setStartPosition(null)
    setStartExceptions([])
    setRequiresExceptionReason(false)
    setExceptionReason('')
    setVisitToStart(visit)
  }
  const recordVisitStart = async (visit: Visit, position: TrackingCoordinates) => {
    const { error } = await createClient().rpc('start_visit', {
      p_visit_id: visit.id,
      p_start_latitude: position.latitude,
      p_start_longitude: position.longitude,
      p_start_accuracy_m: position.accuracy,
      p_start_outside_schedule_confirmed: startExceptions.some((exception) =>
        ['different_day', 'too_early', 'too_late'].includes(exception),
      ),
      p_exception_reason: exceptionReason.trim() || null,
    })
    setStartingVisit(false)
    if (error) {
      if (error.message.startsWith('START_EXCEPTION:')) {
        setRequiresExceptionReason(true)
        setStartError(error.message.replace('START_EXCEPTION: ', ''))
      } else {
        setStartError(error.message)
      }
      return
    }
    setVisitToStart(null)
    router.push(`/agenda/${visit.id}`)
  }
  const confirmVisitStart = () => {
    if (!visitToStart || startingVisit) return
    if (startPosition) {
      if (
        (startExceptions.length > 0 || requiresExceptionReason) &&
        timeTrackingPolicy.require_exception_reason &&
        !exceptionReason.trim()
      ) {
        setStartError('Indica brevemente el motivo para registrar este inicio excepcional.')
        return
      }
      setStartingVisit(true)
      void recordVisitStart(visitToStart, startPosition)
      return
    }
    if (!navigator.geolocation) {
      setStartError('Este dispositivo no permite obtener la ubicación necesaria para iniciar.')
      return
    }
    setStartingVisit(true)
    setStartError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const currentPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }
        const exceptions = getStartExceptions({
          scheduledFor: visitToStart.scheduled_for,
          now: new Date(),
          position: currentPosition,
          installation: visitToStart.installations
            ? {
                latitude:
                  visitToStart.installations.location_latitude === null ||
                  visitToStart.installations.location_latitude === undefined
                    ? null
                    : Number(visitToStart.installations.location_latitude),
                longitude:
                  visitToStart.installations.location_longitude === null ||
                  visitToStart.installations.location_longitude === undefined
                    ? null
                    : Number(visitToStart.installations.location_longitude),
              }
            : undefined,
          policy: timeTrackingPolicy,
        })
        setStartPosition(currentPosition)
        setStartExceptions(exceptions)
        if (exceptions.length > 0 && timeTrackingPolicy.require_exception_reason) {
          setStartingVisit(false)
          return
        }
        void recordVisitStart(visitToStart, currentPosition)
      },
      (error) => {
        setStartingVisit(false)
        setStartError(geolocationErrorMessage(error))
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    )
  }
  const pay = async (invoice: Invoice) => {
    const { error } = await createClient()
      .from('invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', invoice.id)
    setMessage(error ? error.message : 'Factura marcada como cobrada.')
    await load()
  }
  const generateMonthlyInvoices = async (billingPeriod: string) => {
    const { data, error } = await createClient().rpc('generate_monthly_invoices', {
      p_billing_period: billingPeriod,
    })
    if (error) {
      setMessage(error.message)
      return
    }
    const generated = (data ?? []).filter((invoice: { created: boolean }) => invoice.created).length
    setMessage(
      generated
        ? `Cierre de ${formatBillingPeriod(billingPeriod)} preparado: ${generated} borradores nuevos.`
        : `El cierre de ${formatBillingPeriod(billingPeriod)} ya estaba preparado.`,
    )
    await load()
  }
  const savePendingWork = async (input: PendingWorkInput, id?: string) => {
    const scheduledFor = new Date(input.scheduledFor)
    if (Number.isNaN(scheduledFor.getTime()))
      throw new Error('Selecciona una fecha y hora válidas.')

    const payload = {
      installation_id: input.installationId,
      technician_id: input.technicianId,
      scheduled_for: scheduledFor.toISOString(),
    }
    const result = id
      ? await createClient()
          .from('visits')
          .update(payload)
          .eq('id', id)
          .eq('status', 'scheduled')
          .select('id')
          .maybeSingle()
      : await createClient()
          .from('visits')
          .insert({ ...payload, status: 'scheduled' })
          .select('id')
          .maybeSingle()
    if (result.error) throw new Error(result.error.message)
    if (!result.data)
      throw new Error('El trabajo ya no está pendiente o no tienes permiso para modificarlo.')

    setMessage(id ? 'Trabajo actualizado.' : 'Trabajo programado.')
    await load()
  }
  const deletePendingWork = async (id: string) => {
    const { data, error } = await createClient()
      .from('visits')
      .delete()
      .eq('id', id)
      .eq('status', 'scheduled')
      .select('id')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data)
      throw new Error('El trabajo ya no está pendiente o no tienes permiso para eliminarlo.')

    setMessage('Trabajo eliminado.')
    await load()
  }
  const saveClient = async (client: ClientInput, id?: string) => {
    const basePayload = {
      legal_name: client.legal_name.trim(),
      tax_id: blankToNull(client.tax_id),
      billing_email: blankToNull(client.billing_email),
      phone: blankToNull(client.phone),
      billing_address: blankToNull(client.billing_address),
      payment_method: client.payment_method,
      notes: blankToNull(client.notes),
    }
    const payload = clientSchemaReady
      ? {
          ...basePayload,
          payment_terms_days: Number(client.payment_terms_days),
          trade_name: blankToNull(client.trade_name),
          contact_name: blankToNull(client.contact_name),
          contact_role: blankToNull(client.contact_role),
          contact_email: blankToNull(client.contact_email),
          contact_phone: blankToNull(client.contact_phone),
          client_type: client.client_type,
          billing_frequency: client.billing_frequency,
          active: client.active,
        }
      : basePayload
    const query = id
      ? createClient().from('clients').update(payload).eq('id', id)
      : createClient().from('clients').insert(payload)
    const { error } = await query
    if (error) throw new Error(error.message)
    setMessage(id ? 'Cliente actualizado.' : 'Cliente creado.')
    await load()
  }
  const deleteClient = async (client: Client) => {
    if (
      !window.confirm(
        `¿Eliminar a ${client.legal_name}? También se eliminarán sus instalaciones. Esta acción no se puede deshacer.`,
      )
    )
      return
    const { error } = await createClient().from('clients').delete().eq('id', client.id)
    setMessage(error ? error.message : 'Cliente eliminado.')
    if (!error) await load()
  }
  const saveInstallation = async (
    clientId: string,
    installation: InstallationInput,
    id?: string,
  ) => {
    const payload = {
      ...installation,
      name: installation.name.trim(),
      address: installation.address.trim(),
      pool_type: blankToNull(installation.pool_type),
      instructions: blankToNull(installation.instructions),
      notes: blankToNull(installation.notes),
    }
    const query = id
      ? createClient().from('installations').update(payload).eq('id', id)
      : createClient()
          .from('installations')
          .insert({ ...payload, client_id: clientId })
    const { error } = await query
    if (error) throw new Error(error.message)
    setMessage(id ? 'Instalación actualizada.' : 'Instalación añadida.')
    await load()
  }
  const deleteInstallation = async (installation: Installation) => {
    if (!window.confirm(`¿Eliminar la instalación «${installation.name}»?`)) return
    const { error } = await createClient().from('installations').delete().eq('id', installation.id)
    setMessage(error ? error.message : 'Instalación eliminada.')
    if (!error) await load()
  }
  const accountInitials = accountName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  const workInstallations: WorkInstallation[] = clients.flatMap((client) =>
    client.installations.map((installation) => ({
      id: installation.id,
      name: installation.name,
      address: installation.address,
      clientId: client.id,
      clientName: client.legal_name,
    })),
  )
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Image
            src="/concepte-blau-logo.png"
            alt="Concepte Blau"
            width={450}
            height={111}
            priority
          />
        </div>
        <nav className={`nav ${isAdmin ? 'nav-admin' : 'nav-worker'}`}>
          {isAdmin && (
            <Nav
              href="/"
              label="Resumen"
              icon={<LayoutDashboard size={18} />}
              active={activeView === 'inicio'}
            />
          )}
          <Nav
            href="/agenda"
            label="Agenda"
            icon={<CalendarDays size={18} />}
            active={activeView === 'agenda' || activeView === 'parte'}
          />
          <Nav
            href="/trabajos"
            label="Trabajos"
            icon={<CheckCircle2 size={18} />}
            active={activeView === 'trabajos'}
          />
          {isAdmin && (
            <>
              <Nav
                href="/clientes"
                label="Clientes"
                icon={<Users size={18} />}
                active={activeView === 'clientes'}
              />
              <Nav
                href="/facturacion"
                label="Facturación"
                icon={<FileText size={18} />}
                active={activeView === 'facturacion'}
              />
            </>
          )}
          <Nav
            href="/inventario"
            label="Inventario"
            icon={<Package size={18} />}
            active={activeView === 'inventario'}
          />
          {isAdmin && (
            <Nav
              href="/estadisticas"
              label="Estadísticas"
              icon={<LayoutDashboard size={18} />}
              active={activeView === 'estadisticas'}
            />
          )}
        </nav>
        <div className="profile">
          <PopoverTrigger>
            <Button
              className="profile-trigger"
              type="button"
              variant="ghost"
              aria-label={`Abrir menú de ${accountName}`}
            >
              <span className="avatar" aria-hidden="true">
                {accountInitials || 'CB'}
              </span>
              <span className="profile-summary">
                <strong>{accountName}</strong>
                <span>{isAdmin ? 'Administración' : 'Operativa'}</span>
              </span>
              <ChevronDown className="profile-chevron" size={16} aria-hidden="true" />
            </Button>
            <PopoverContent placement="top start" className="profile-popover">
              <div className="profile-popover-header">
                <span className="avatar profile-popover-avatar" aria-hidden="true">
                  {accountInitials || 'CB'}
                </span>
                <span>
                  <strong>{accountName}</strong>
                  <small>{accountEmail || 'Sesión activa'}</small>
                </span>
              </div>
              <div className="profile-popover-divider" />
              <button
                className="profile-sign-out"
                type="button"
                onClick={() => void signOut()}
                disabled={isSigningOut}
              >
                <LogOut size={16} aria-hidden="true" />
                {isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
              </button>
              {signOutError && <p className="profile-sign-out-error">{signOutError}</p>}
            </PopoverContent>
          </PopoverTrigger>
        </div>
      </aside>
      <main className={activeView === 'agenda' ? 'main agenda-main' : 'main'}>
        {activeView !== 'agenda' && (
          <header className="topbar">
            <div>
              <h1>{titles[activeView]}</h1>
            </div>
            <div className="top-actions">
              {activeView === 'inicio' && (
                <Link className="button accent" href="/agenda">
                  Ver agenda
                </Link>
              )}
              {activeView === 'clientes' && isAdmin && (
                <button className="button" type="button" onClick={() => setEditingClient('new')}>
                  <Plus size={17} aria-hidden="true" />
                  Nuevo cliente
                </button>
              )}
              {activeView === 'inventario' && isAdmin && (
                <button
                  className="button inventory-create"
                  type="button"
                  onClick={() => setProductCreationVersion((value) => value + 1)}
                >
                  <Plus size={17} aria-hidden="true" />
                  Nuevo material
                </button>
              )}
              {activeView === 'estadisticas' && isAdmin && (
                <button
                  className="button secondary analytics-refresh"
                  type="button"
                  onClick={() => setStatisticsReload((value) => value + 1)}
                >
                  <RefreshCw size={16} aria-hidden="true" />
                  Actualizar
                </button>
              )}
            </div>
          </header>
        )}
        <div className={activeView === 'agenda' ? 'content agenda-content' : 'content'}>
          {message && (
            <p className="toast" role="status">
              {message}
            </p>
          )}
          {activeView === 'inicio' && (
            <Overview
              visits={visits}
              invoices={invoices}
              clients={clients}
              isAdmin={isAdmin}
              start={requestStart}
            />
          )}
          {activeView === 'agenda' && (
            <Agenda visits={visits} isAdmin={isAdmin} start={requestStart} />
          )}
          {activeView === 'trabajos' && (
            <WorkHistory
              visits={visits}
              installations={workInstallations}
              technicians={technicians}
              isAdmin={isAdmin}
              onSavePendingWork={savePendingWork}
              onDeletePendingWork={deletePendingWork}
            />
          )}
          {activeView === 'parte' && visitId && (
            <VisitReport visitId={visitId} readOnly={isAdmin} />
          )}
          {activeView === 'facturacion' && (
            <Billing
              invoices={invoices}
              pay={pay}
              clientId={searchParams.get('cliente')}
              generateMonthlyInvoices={generateMonthlyInvoices}
            />
          )}
          {activeView === 'estadisticas' && (
            <AdminStatistics isAdmin={isAdmin} reloadVersion={statisticsReload} />
          )}
          {activeView === 'clientes' && (
            <Clients
              clients={clients}
              isAdmin={isAdmin}
              clientSchemaReady={clientSchemaReady}
              editingClient={editingClient}
              setEditingClient={setEditingClient}
              onSaveClient={saveClient}
              onDeleteClient={deleteClient}
              onSaveInstallation={saveInstallation}
              onDeleteInstallation={deleteInstallation}
            />
          )}
          {activeView === 'inventario' && (
            <Inventory
              products={products}
              isAdmin={isAdmin}
              schemaReady={inventorySchemaReady}
              onRefresh={load}
              creationVersion={productCreationVersion}
            />
          )}
        </div>
      </main>
      {!isAdmin && (
        <ConfirmDialog
          open={Boolean(visitToStart)}
          onOpenChange={(open) => {
            if (!open && !startingVisit) {
              setVisitToStart(null)
              setStartPosition(null)
            }
          }}
          title={
            startExceptions.length || requiresExceptionReason
              ? 'Justificar inicio excepcional'
              : 'Registrar inicio de visita'
          }
          description={
            visitToStart ? (
              <StartVisitConfirmation
                visit={visitToStart}
                warning={getVisitStartWarning(visitToStart.scheduled_for)}
                error={startError}
                position={startPosition}
                exceptions={startExceptions}
                requiresExceptionReason={requiresExceptionReason}
                exceptionReason={exceptionReason}
                onExceptionReasonChange={setExceptionReason}
              />
            ) : undefined
          }
          confirmLabel={
            startingVisit
              ? 'Obteniendo ubicación…'
              : startExceptions.length || requiresExceptionReason
                ? 'Registrar inicio excepcional'
                : 'Confirmar y registrar inicio'
          }
          cancelLabel="Cancelar"
          pending={startingVisit}
          onConfirm={confirmVisitStart}
        />
      )}
    </div>
  )
}
function StartVisitConfirmation({
  visit,
  warning,
  error,
  position,
  exceptions,
  requiresExceptionReason,
  exceptionReason,
  onExceptionReasonChange,
}: {
  visit: Visit
  warning: ReturnType<typeof getVisitStartWarning>
  error: string | null
  position: TrackingCoordinates | null
  exceptions: StartException[]
  requiresExceptionReason: boolean
  exceptionReason: string
  onExceptionReasonChange: (value: string) => void
}) {
  const scheduledFor = new Date(visit.scheduled_for)
  const mustExplain = exceptions.length > 0 || requiresExceptionReason
  return (
    <div className="start-confirmation">
      <p>
        ¿Confirmas que estás en{' '}
        <strong>{visit.installations?.address ?? 'la dirección asignada'}</strong> para{' '}
        {visit.installations?.clients?.legal_name ?? 'este cliente'}?
      </p>
      <p className="start-confirmation-schedule">Visita prevista: {formatDateTime(scheduledFor)}</p>
      {warning && (
        <p className="start-confirmation-warning">
          {warning === 'different_day'
            ? 'Esta visita está programada para otro día. Confirma que corresponde iniciarla ahora.'
            : 'La hora real difiere más de 90 minutos de la prevista. Confirma que corresponde iniciarla ahora.'}
        </p>
      )}
      <p className="start-confirmation-location">
        {position
          ? `Ubicación obtenida con una precisión aproximada de ±${Math.round(position.accuracy)} m.`
          : 'Al confirmar, el navegador pedirá permiso para registrar tu ubicación precisa y la hora oficial de inicio.'}
      </p>
      {mustExplain && (
        <div className="start-exception">
          <strong>Este inicio necesita justificación</strong>
          {exceptions.length > 0 && (
            <ul>
              {exceptions.map((exception) => (
                <li key={exception}>{startExceptionLabel[exception]}</li>
              ))}
            </ul>
          )}
          <label>
            Motivo de la excepción
            <textarea
              rows={2}
              value={exceptionReason}
              onChange={(event) => onExceptionReasonChange(event.target.value)}
              placeholder="Ej. avería urgente, acceso restringido o imprecisión GPS"
            />
          </label>
        </div>
      )}
      {error && <p className="start-confirmation-error">{error}</p>}
    </div>
  )
}
function geolocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return 'Necesitamos el permiso de ubicación para registrar el inicio de la visita.'
  }
  if (error.code === error.TIMEOUT) {
    return 'La ubicación ha tardado demasiado. Comprueba la cobertura e inténtalo de nuevo.'
  }
  return 'No se ha podido obtener una ubicación precisa. Activa la ubicación e inténtalo de nuevo.'
}
function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}
const blankToNull = (value: string | null) => value?.trim() || null
const normalizeClient = (
  client: Omit<Partial<Client>, 'installations'> & { installations?: Partial<Installation>[] },
): Client => ({
  ...emptyClient,
  ...client,
  id: client.id ?? '',
  installations: (client.installations ?? []).map((installation) => ({
    ...installation,
    id: installation.id ?? '',
    name: installation.name ?? '',
    address: installation.address ?? '',
    pool_type: installation.pool_type ?? null,
    instructions: installation.instructions ?? null,
    notes: installation.notes ?? null,
    location_latitude: installation.location_latitude ?? null,
    location_longitude: installation.location_longitude ?? null,
  })),
})
function Nav({
  href,
  label,
  icon,
  active,
}: {
  href: string
  label: string
  icon: ReactNode
  active: boolean
}) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined}>
      {icon}
      <span>{label}</span>
    </Link>
  )
}
function VisitRow({
  visit,
  isAdmin,
  start,
}: {
  visit: Visit
  isAdmin: boolean
  start: (v: Visit) => void
}) {
  const x = visit.installations
  return (
    <div className="visit">
      <div className="time">
        {new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(
          new Date(visit.scheduled_for),
        )}
      </div>
      <div>
        <div className="visit-title">{x?.clients?.legal_name ?? 'Cliente'}</div>
        <div className="visit-meta">
          {x?.name ?? 'Instalación'} · {x?.address ?? ''}
        </div>
        {isAdmin && (
          <div className="visit-meta">
            Responsable: {visit.technician?.full_name ?? 'Sin asignar'}
          </div>
        )}
      </div>
      {isAdmin ? (
        <span className="badge">{getAgendaVisitAction(visit.status, true).label}</span>
      ) : null}
      {!isAdmin && visit.status === 'completed' ? (
        <span className="badge ok">Completada</span>
      ) : null}
      {!isAdmin && visit.status === 'in_progress' ? (
        <Link className="badge progress" href={`/agenda/${visit.id}`}>
          Continuar
        </Link>
      ) : null}
      {!isAdmin && visit.status === 'cancelled' ? (
        <span className="badge pending">Cancelada</span>
      ) : null}
      {!isAdmin && visit.status === 'scheduled' ? (
        <button className="badge progress" onClick={() => start(visit)}>
          Iniciar
        </button>
      ) : null}
    </div>
  )
}
function Overview({
  visits,
  invoices,
  clients,
  isAdmin,
  start,
}: {
  visits: Visit[]
  invoices: Invoice[]
  clients: Client[]
  isAdmin: boolean
  start: (v: Visit) => void
}) {
  const due = invoices.filter((i) => i.status !== 'paid')
  return (
    <>
      <section className="stats">
        <Stat
          icon={<CalendarDays size={19} />}
          label="Visitas"
          value={String(visits.length)}
          foot={`${visits.filter((v) => v.status === 'completed').length} completadas`}
        />
        <Stat
          icon={<Users size={19} />}
          label="Clientes activos"
          value={String(clients.filter((client) => client.active).length)}
          foot={`${clients.length} clientes registrados`}
        />
        <Stat
          icon={<FileText size={19} />}
          label="Facturas pendientes"
          value={String(due.length)}
          foot={money.format(due.reduce((n, i) => n + Number(i.total), 0))}
        />
        <Stat
          icon={<CircleDollarSign size={19} />}
          label="Facturación"
          value={money.format(invoices.reduce((n, i) => n + Number(i.total), 0))}
          foot="Importe total emitido"
        />
      </section>
      <section className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <h3>Próximas visitas</h3>
        </div>
        {visits.map((v) => (
          <VisitRow key={v.id} visit={v} isAdmin={isAdmin} start={start} />
        ))}
      </section>
    </>
  )
}
function Stat({
  icon,
  label,
  value,
  foot,
}: {
  icon: ReactNode
  label: string
  value: string
  foot: string
}) {
  return (
    <div className="stat">
      <div className="stat-heading">
        <div className="stat-label">{label}</div>
        <span className="stat-icon" aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">{foot}</div>
    </div>
  )
}
type CalendarView = 'day' | 'week' | 'month'

function Agenda({
  visits,
  isAdmin,
  start,
}: {
  visits: Visit[]
  isAdmin: boolean
  start: (v: Visit) => void
}) {
  const [calendarView, setCalendarView] = useState<CalendarView>('week')
  const [activeDate, setActiveDate] = useState(() => startOfDay(new Date()))
  useEffect(() => {
    if (window.matchMedia('(max-width: 560px)').matches) setCalendarView('day')
  }, [])
  const weekStart = startOfWeek(activeDate)
  const days =
    calendarView === 'month'
      ? getMonthGrid(activeDate)
      : calendarView === 'week'
        ? Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
        : [activeDate]
  const previous = () =>
    setActiveDate((date) =>
      addDays(
        date,
        calendarView === 'month' ? -getDaysInMonth(date) : calendarView === 'week' ? -7 : -1,
      ),
    )
  const next = () =>
    setActiveDate((date) =>
      addDays(
        date,
        calendarView === 'month' ? getDaysInMonth(date) : calendarView === 'week' ? 7 : 1,
      ),
    )

  return (
    <>
      <section
        className={`calendar-shell calendar-${calendarView}`}
        aria-label="Calendario de visitas"
      >
        <header className="calendar-toolbar">
          <div className="calendar-period">
            <span>Calendario</span>
            <h3>{calendarPeriodLabel(activeDate, calendarView)}</h3>
          </div>
          <div className="calendar-controls">
            <div className="calendar-pagination">
              <button
                type="button"
                className="calendar-icon-button"
                onClick={previous}
                aria-label="Periodo anterior"
              >
                <ChevronLeft size={19} />
              </button>
              <button
                type="button"
                className="calendar-today"
                onClick={() => setActiveDate(startOfDay(new Date()))}
              >
                Hoy
              </button>
              <button
                type="button"
                className="calendar-icon-button"
                onClick={next}
                aria-label="Periodo siguiente"
              >
                <ChevronRight size={19} />
              </button>
            </div>
            <div className="calendar-view-switch" role="tablist" aria-label="Vista de calendario">
              {(
                [
                  ['day', 'Día'],
                  ['week', 'Semana'],
                  ['month', 'Mes'],
                ] as [CalendarView, string][]
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  role="tab"
                  aria-selected={calendarView === value}
                  className={calendarView === value ? 'active' : ''}
                  onClick={() => setCalendarView(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {calendarView === 'day' && (
          <DayCalendar
            date={activeDate}
            visits={visitsForDay(visits, activeDate)}
            isAdmin={isAdmin}
            start={start}
          />
        )}
        {calendarView === 'week' && (
          <WeekCalendar days={days} visits={visits} isAdmin={isAdmin} start={start} />
        )}
        {calendarView === 'month' && (
          <MonthCalendar
            days={days}
            activeDate={activeDate}
            visits={visits}
            isAdmin={isAdmin}
            start={start}
          />
        )}
      </section>
    </>
  )
}

function DayCalendar({
  date,
  visits,
  isAdmin,
  start,
}: {
  date: Date
  visits: Visit[]
  isAdmin: boolean
  start: (visit: Visit) => void
}) {
  const hours = Array.from({ length: 13 }, (_, index) => index + 7)
  return (
    <div className="day-calendar">
      <div className="day-calendar-title">
        <span>{dayLabel(date)}</span>
        <strong>{date.getDate()}</strong>
      </div>
      <div className="day-calendar-grid">
        <div className="calendar-hours">
          {hours.map((hour) => (
            <span key={hour}>{`${String(hour).padStart(2, '0')}:00`}</span>
          ))}
        </div>
        <div className="day-track">
          {hours.map((hour) => (
            <div className="day-hour" key={hour} />
          ))}
          {visits.map((visit) => (
            <CalendarEvent key={visit.id} visit={visit} isAdmin={isAdmin} start={start} timed />
          ))}
          {visits.length === 0 && (
            <p className="calendar-empty">No hay visitas previstas para este día.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function WeekCalendar({
  days,
  visits,
  isAdmin,
  start,
}: {
  days: Date[]
  visits: Visit[]
  isAdmin: boolean
  start: (visit: Visit) => void
}) {
  return (
    <div className="week-calendar">
      <div className="week-day-headers">
        {days.map((day) => (
          <div className={isToday(day) ? 'today' : ''} key={day.toISOString()}>
            <span>{dayLabel(day)}</span>
            <strong>{day.getDate()}</strong>
          </div>
        ))}
      </div>
      <div className="week-day-columns">
        {days.map((day) => (
          <div className={`week-day ${isToday(day) ? 'today' : ''}`} key={day.toISOString()}>
            {visitsForDay(visits, day).map((visit) => (
              <CalendarEvent key={visit.id} visit={visit} isAdmin={isAdmin} start={start} compact />
            ))}
            {visitsForDay(visits, day).length === 0 && <span className="calendar-free">Libre</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function MonthCalendar({
  days,
  activeDate,
  visits,
  isAdmin,
  start,
}: {
  days: Date[]
  activeDate: Date
  visits: Visit[]
  isAdmin: boolean
  start: (visit: Visit) => void
}) {
  return (
    <div className="month-calendar">
      <div className="month-weekdays">
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="month-grid">
        {days.map((day) => {
          const isCurrentMonth = day.getMonth() === activeDate.getMonth()
          const dayVisits = visitsForDay(visits, day)
          return (
            <div
              className={`month-day ${isCurrentMonth ? '' : 'outside-month'} ${isToday(day) ? 'today' : ''}`}
              key={day.toISOString()}
            >
              <span className="month-date">{day.getDate()}</span>
              <div className="month-events">
                {dayVisits.slice(0, 3).map((visit) => (
                  <CalendarEvent
                    key={visit.id}
                    visit={visit}
                    isAdmin={isAdmin}
                    start={start}
                    compact
                  />
                ))}
                {dayVisits.length > 3 && (
                  <span className="more-events">+{dayVisits.length - 3} más</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CalendarEvent({
  visit,
  isAdmin,
  start,
  compact,
  timed,
}: {
  visit: Visit
  isAdmin: boolean
  start: (visit: Visit) => void
  compact?: boolean
  timed?: boolean
}) {
  const scheduled = new Date(visit.scheduled_for)
  const minutes = scheduled.getHours() * 60 + scheduled.getMinutes()
  const top = Math.max(0, (minutes - 420) * 1.15)
  const action = getAgendaVisitAction(visit.status, isAdmin)
  const content = (
    <>
      <time>
        {new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(scheduled)}
      </time>
      <strong>{visit.installations?.clients?.legal_name ?? 'Cliente'}</strong>
      {!compact && <span>{visit.installations?.name ?? 'Instalación'}</span>}
      {isAdmin && (
        <span className="event-assignee">
          Responsable: {visit.technician?.full_name ?? 'Sin asignar'}
        </span>
      )}
    </>
  )
  const className = `calendar-event ${visit.status} ${compact ? 'compact' : ''} ${action.isInteractive ? 'operational' : ''}`
  if (action.isInteractive && visit.status === 'scheduled')
    return (
      <button
        type="button"
        className={className}
        style={timed ? { top } : undefined}
        onClick={() => start(visit)}
      >
        {content}
        <em>{action.label}</em>
      </button>
    )
  if (action.isInteractive && (visit.status === 'in_progress' || visit.status === 'completed'))
    return (
      <Link className={className} style={timed ? { top } : undefined} href={`/agenda/${visit.id}`}>
        {content}
        <em>{action.label}</em>
      </Link>
    )
  return (
    <div className={className} style={timed ? { top } : undefined}>
      {content}
      <em>{action.label}</em>
    </div>
  )
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}
function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}
function startOfWeek(date: Date) {
  return addDays(startOfDay(date), -((date.getDay() + 6) % 7))
}
function getDaysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}
function getMonthGrid(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1)
  const leadingDays = (first.getDay() + 6) % 7
  const count = Math.ceil((leadingDays + getDaysInMonth(date)) / 7) * 7
  return Array.from({ length: count }, (_, index) => addDays(first, index - leadingDays))
}
function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}
function isToday(date: Date) {
  return isSameDay(date, new Date())
}
function visitsForDay(visits: Visit[], date: Date) {
  return visits
    .filter((visit) => isSameDay(new Date(visit.scheduled_for), date))
    .sort((left, right) => left.scheduled_for.localeCompare(right.scheduled_for))
}
function dayLabel(date: Date) {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(date).replace('.', '')
}
function calendarPeriodLabel(date: Date, view: CalendarView) {
  if (view === 'month')
    return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(date)
  if (view === 'day')
    return new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(date)
  const end = addDays(startOfWeek(date), 6)
  return `${new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(startOfWeek(date))} — ${new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(end)}`
}
function Billing({
  invoices,
  pay,
  clientId,
  generateMonthlyInvoices,
}: {
  invoices: Invoice[]
  pay: (i: Invoice) => void
  clientId: string | null
  generateMonthlyInvoices: (billingPeriod: string) => Promise<void>
}) {
  const [previewedInvoice, setPreviewedInvoice] = useState<Invoice | null>(null)
  const [billingPeriod, setBillingPeriod] = useState(
    toBillingPeriodValue(getPreviousBillingPeriod()),
  )
  const [generating, setGenerating] = useState(false)
  const clientInvoices = clientId
    ? invoices.filter((invoice) => invoice.client_id === clientId)
    : invoices
  const displayedInvoices = filterInvoicesByBillingPeriod(clientInvoices, billingPeriod)
  const filteredClientName = clientId ? clientInvoices[0]?.clients?.legal_name : null
  const pendingInvoices = displayedInvoices.filter((invoice) => invoice.status !== 'paid')
  const paidInvoices = displayedInvoices.filter((invoice) => invoice.status === 'paid')
  const pendingTotal = pendingInvoices.reduce((total, invoice) => total + Number(invoice.total), 0)
  const billedTotal = displayedInvoices.reduce((total, invoice) => total + Number(invoice.total), 0)

  return (
    <>
      <section className="billing-summary" aria-label="Resumen de facturación">
        <div className="billing-summary-card">
          <FileText size={19} aria-hidden="true" />
          <div>
            <span>Facturado</span>
            <strong>{money.format(billedTotal)}</strong>
            <small>{displayedInvoices.length} facturas emitidas</small>
          </div>
        </div>
        <div className="billing-summary-card pending">
          <CircleDollarSign size={19} aria-hidden="true" />
          <div>
            <span>Pendiente de cobro</span>
            <strong>{money.format(pendingTotal)}</strong>
            <small>{pendingInvoices.length} por gestionar</small>
          </div>
        </div>
        <div className="billing-summary-card paid">
          <CheckCircle2 size={19} aria-hidden="true" />
          <div>
            <span>Cobradas</span>
            <strong>{paidInvoices.length}</strong>
            <small>facturas conciliadas</small>
          </div>
        </div>
      </section>
      <section className="billing-list-panel" aria-labelledby="invoice-list-title">
        <header className="billing-list-header">
          <div>
            <span className="billing-list-kicker">Registro de facturas</span>
            <h3 id="invoice-list-title">
              {filteredClientName ? `Facturas de ${filteredClientName}` : 'Todas las facturas'}
            </h3>
          </div>
          <div className="billing-list-controls">
            {clientId && <Link href="/facturacion">Ver todas</Link>}
            <select
              value={billingPeriod}
              onChange={(event) => setBillingPeriod(event.target.value)}
            >
              {getBillingPeriodOptions().map((period) => (
                <option key={period.value} value={period.value}>
                  {period.label}
                </option>
              ))}
            </select>
            <button
              className="button secondary"
              type="button"
              disabled={generating}
              onClick={async () => {
                setGenerating(true)
                await generateMonthlyInvoices(billingPeriod)
                setGenerating(false)
              }}
            >
              {generating ? 'Preparando…' : 'Preparar cierre mensual'}
            </button>
            <span className="billing-list-count">{displayedInvoices.length} en total</span>
          </div>
        </header>
        {displayedInvoices.length ? (
          <div className="invoice-list" aria-label="Listado de facturas">
            {displayedInvoices.map((invoice) => {
              const lines = getInvoiceLines(invoice)
              const isPaid = invoice.status === 'paid'
              const lineCountLabel = `${lines.length} ${lines.length === 1 ? 'concepto' : 'conceptos'}`

              return (
                <article
                  className={`invoice ${isPaid ? 'is-paid' : 'is-pending'}`}
                  key={invoice.id}
                >
                  <div className="invoice-main">
                    <div className="invoice-document-icon" aria-hidden="true">
                      {isPaid ? <CheckCircle2 size={20} /> : <FileText size={20} />}
                    </div>
                    <div className="invoice-client">
                      <span className="invoice-number">{invoice.number ?? 'Borrador'}</span>
                      <strong>{invoice.clients?.legal_name ?? 'Cliente sin asignar'}</strong>
                      <div className="invoice-dates">
                        <span>Período {formatBillingPeriod(invoice.billing_period)}</span>
                        <span>Emitida {formatDate(invoice.issued_on)}</span>
                        <span>Vence {formatDate(invoice.due_on)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="invoice-concepts">
                    <span className="invoice-concepts-label">
                      <FileText size={14} aria-hidden="true" />
                      {lineCountLabel}
                    </span>
                    <strong>{lines[0]?.description}</strong>
                    {lines.length > 1 && <small>+ {lines.length - 1} más</small>}
                  </div>
                  <div className="invoice-amount">
                    <span>Total</span>
                    <strong>{money.format(Number(invoice.total))}</strong>
                    <small>IVA incl.</small>
                  </div>
                  <div className="invoice-actions">
                    <div className="invoice-utility-actions">
                      <button
                        className="invoice-action"
                        type="button"
                        onClick={() => setPreviewedInvoice(invoice)}
                        aria-label={`Ver factura ${invoice.number ?? invoice.id}`}
                      >
                        <Eye size={16} aria-hidden="true" />
                        <span>Ver</span>
                      </button>
                      <button
                        className="invoice-action"
                        type="button"
                        onClick={() => downloadInvoice(invoice)}
                        aria-label={`Descargar factura ${invoice.number ?? invoice.id}`}
                      >
                        <Download size={16} aria-hidden="true" />
                        <span>Descargar</span>
                      </button>
                    </div>
                    {isPaid ? (
                      <span className="invoice-status-pill paid">
                        <CheckCircle2 size={14} aria-hidden="true" />
                        Cobrada
                      </span>
                    ) : (
                      <button
                        className="invoice-status-pill pending"
                        type="button"
                        onClick={() => pay(invoice)}
                      >
                        Marcar cobrada
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="invoice-empty">
            <FileText size={24} aria-hidden="true" />
            <div>
              <strong>Aún no hay facturas</strong>
              <p>Prepara el cierre mensual para crear los borradores pendientes de revisión.</p>
            </div>
          </div>
        )}
      </section>
      {previewedInvoice && (
        <InvoicePreview
          invoice={previewedInvoice}
          onClose={() => setPreviewedInvoice(null)}
          onDownload={downloadInvoice}
        />
      )}
    </>
  )
}
function Clients({
  clients,
  isAdmin,
  clientSchemaReady,
  editingClient,
  setEditingClient,
  onSaveClient,
  onDeleteClient,
  onSaveInstallation,
  onDeleteInstallation,
}: {
  clients: Client[]
  isAdmin: boolean
  clientSchemaReady: boolean
  editingClient: Client | null | 'new'
  setEditingClient: (client: Client | null | 'new') => void
  onSaveClient: (client: ClientInput, id?: string) => Promise<void>
  onDeleteClient: (client: Client) => Promise<void>
  onSaveInstallation: (
    clientId: string,
    installation: InstallationInput,
    id?: string,
  ) => Promise<void>
  onDeleteInstallation: (installation: Installation) => Promise<void>
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | ClientType>('all')
  const [page, setPage] = useState(0)
  const [remoteClients, setRemoteClients] = useState<Client[]>(clients)
  const [total, setTotal] = useState(clients.length)
  const pageSize = 10
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [editingInstallation, setEditingInstallation] = useState<Installation | 'new' | null>(null)
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const from = page * pageSize
      let query = createClient()
        .from('clients')
        .select(
          'id,legal_name,trade_name,tax_id,billing_email,phone,billing_address,payment_method,notes,contact_name,contact_role,contact_email,contact_phone,client_type,billing_frequency,payment_terms_days,active,installations(id,name,address,pool_type,instructions,notes,location_latitude,location_longitude)',
          { count: 'exact' },
        )
        .order('legal_name')
        .range(from, from + pageSize - 1)
      if (search.trim()) query = query.ilike('legal_name', `%${search.trim()}%`)
      if (statusFilter !== 'all') query = query.eq('active', statusFilter === 'active')
      if (typeFilter !== 'all') query = query.eq('client_type', typeFilter)
      const result = await query
      if (!result.error) {
        setRemoteClients((result.data ?? []).map((client) => normalizeClient(client)))
        setTotal(result.count ?? 0)
      } else if (!clientSchemaReady) {
        let fallback = createClient()
          .from('clients')
          .select(
            'id,legal_name,tax_id,billing_email,phone,billing_address,payment_method,notes,installations(id,name,address,pool_type,instructions,notes)',
            { count: 'exact' },
          )
          .order('legal_name')
          .range(from, from + pageSize - 1)
        if (search.trim()) fallback = fallback.ilike('legal_name', `%${search.trim()}%`)
        const old = await fallback
        setRemoteClients((old.data ?? []).map((client) => normalizeClient(client)))
        setTotal(old.count ?? 0)
      }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search, statusFilter, typeFilter, page, clients, clientSchemaReady])
  const visibleClients = remoteClients
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  return (
    <>
      {!isAdmin && (
        <p className="access-note" role="status">
          Solo los administradores pueden crear o modificar clientes.
        </p>
      )}
      {!clientSchemaReady && (
        <p className="access-note" role="status">
          La ficha ampliada se activará automáticamente al aplicar la migración de Supabase.
          Mientras tanto, el CRUD básico e instalaciones siguen disponibles.
        </p>
      )}
      <div className="client-toolbar">
        <label className="client-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Buscar clientes</span>
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(0)
            }}
            placeholder="Buscar por nombre"
          />
        </label>
        <select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as typeof statusFilter)
            setPage(0)
          }}
        >
          <option value="all">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
        <select
          value={typeFilter}
          onChange={(event) => {
            setTypeFilter(event.target.value as typeof typeFilter)
            setPage(0)
          }}
        >
          <option value="all">Todos los tipos</option>
          <option value="residential">Particular</option>
          <option value="community">Comunidad</option>
          <option value="hotel">Hotel</option>
          <option value="business">Empresa</option>
        </select>
        <span>{total} clientes</span>
      </div>
      <div className="client-list" role="list">
        {visibleClients.map((client) => (
          <article
            className={`client-row client-card ${client.active ? '' : 'is-inactive'}`}
            key={client.id}
            role="listitem"
          >
            <div className="client-card-head">
              <div>
                <div className="client-name-row">
                  <h3>{client.legal_name}</h3>
                  {!client.active && <span className="badge pending">Inactivo</span>}
                </div>
                <p>{client.trade_name || clientTypeLabel(client.client_type)}</p>
              </div>
              <span className="client-type">{clientTypeLabel(client.client_type)}</span>
            </div>
            <div className="client-contact">
              <span>
                <UserRound size={15} aria-hidden="true" />
                {client.contact_name || 'Sin contacto asignado'}
              </span>
              {client.contact_email && (
                <span>
                  <Mail size={15} aria-hidden="true" />
                  {client.contact_email}
                </span>
              )}
              {client.contact_phone && (
                <span>
                  <Phone size={15} aria-hidden="true" />
                  {client.contact_phone}
                </span>
              )}
            </div>
            <div className="client-details">
              <span>
                <Building2 size={15} aria-hidden="true" />
                {client.installations.length}{' '}
                {client.installations.length === 1 ? 'instalación' : 'instalaciones'}
              </span>
              <span>
                Cobro {paymentLabel(client.payment_method)} · {client.payment_terms_days} días
              </span>
            </div>
            <div className="client-card-actions">
              <button
                className="action-link"
                type="button"
                onClick={() => setSelectedClient(client)}
              >
                Ver ficha
              </button>
              {isAdmin && (
                <>
                  <button
                    className="icon-action"
                    type="button"
                    aria-label={`Editar ${client.legal_name}`}
                    onClick={() => setEditingClient(client)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-action destructive"
                    type="button"
                    aria-label={`Eliminar ${client.legal_name}`}
                    onClick={() => void onDeleteClient(client)}
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {visibleClients.length === 0 && (
        <div className="empty-results">
          <Users size={25} aria-hidden="true" />
          <p>No hay clientes que coincidan con la búsqueda.</p>
        </div>
      )}
      <nav className="pagination" aria-label="Paginación de clientes">
        <button
          className="button secondary"
          type="button"
          disabled={page === 0}
          onClick={() => setPage((value) => value - 1)}
        >
          Anterior
        </button>
        <span>
          Página {page + 1} de {pageCount}
        </span>
        <button
          className="button secondary"
          type="button"
          disabled={page + 1 >= pageCount}
          onClick={() => setPage((value) => value + 1)}
        >
          Siguiente
        </button>
      </nav>
      {editingClient && (
        <ClientForm
          client={editingClient === 'new' ? undefined : editingClient}
          onClose={() => setEditingClient(null)}
          onSave={async (input) => {
            await onSaveClient(input, editingClient === 'new' ? undefined : editingClient.id)
            setEditingClient(null)
          }}
        />
      )}
      {selectedClient && (
        <ClientDetail
          client={selectedClient}
          isAdmin={isAdmin}
          onClose={() => setSelectedClient(null)}
          onEditClient={() => {
            setSelectedClient(null)
            setEditingClient(selectedClient)
          }}
          onNewInstallation={() => setEditingInstallation('new')}
          onEditInstallation={(installation) => setEditingInstallation(installation)}
          onDeleteInstallation={async (installation) => {
            await onDeleteInstallation(installation)
            setSelectedClient(null)
          }}
        />
      )}
      {selectedClient && editingInstallation && (
        <InstallationForm
          installation={editingInstallation === 'new' ? undefined : editingInstallation}
          clientName={selectedClient.legal_name}
          onClose={() => setEditingInstallation(null)}
          onSave={async (input) => {
            await onSaveInstallation(
              selectedClient.id,
              input,
              editingInstallation === 'new' ? undefined : editingInstallation.id,
            )
            setEditingInstallation(null)
            setSelectedClient(null)
          }}
        />
      )}
    </>
  )
}

const clientTypeLabel = (type: ClientType) =>
  ({ residential: 'Particular', community: 'Comunidad', hotel: 'Hotel', business: 'Empresa' })[type]
const paymentLabel = (method: string | null) =>
  ({ direct_debit: 'domiciliado', transfer: 'por transferencia', card: 'con tarjeta' })[
    method ?? ''
  ] ?? 'sin definir'
const emptyClient: ClientInput = {
  legal_name: '',
  trade_name: null,
  tax_id: null,
  billing_email: null,
  phone: null,
  billing_address: null,
  payment_method: null,
  notes: null,
  contact_name: null,
  contact_role: null,
  contact_email: null,
  contact_phone: null,
  client_type: 'residential',
  billing_frequency: 'monthly',
  payment_terms_days: 30,
  active: true,
}
const emptyInstallation: InstallationInput = {
  name: '',
  address: '',
  pool_type: null,
  instructions: null,
  notes: null,
  location_latitude: null,
  location_longitude: null,
}
const clientToInput = ({
  id: _id,
  installations: _installations,
  ...client
}: Client): ClientInput => client

function ClientForm({
  client,
  onClose,
  onSave,
}: {
  client?: Client
  onClose: () => void
  onSave: (input: ClientInput) => Promise<void>
}) {
  const [form, setForm] = useState<ClientInput>(client ? clientToInput(client) : emptyClient)
  const [saving, setSaving] = useState(false)
  const update = <K extends keyof ClientInput>(key: K, value: ClientInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }))
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      title={client ? 'Editar cliente' : 'Nuevo cliente'}
      description="Los campos con asterisco son obligatorios."
      onClose={onClose}
    >
      <form className="record-form" onSubmit={submit}>
        <h3>Datos generales</h3>
        <div className="form-grid">
          <Field label="Razón social" required>
            <input
              required
              value={form.legal_name}
              onChange={(e) => update('legal_name', e.target.value)}
            />
          </Field>
          <Field label="Nombre comercial">
            <input
              value={form.trade_name ?? ''}
              onChange={(e) => update('trade_name', e.target.value)}
            />
          </Field>
          <Field label="Tipo de cliente">
            <select
              value={form.client_type}
              onChange={(e) => update('client_type', e.target.value as ClientType)}
            >
              <option value="residential">Particular</option>
              <option value="community">Comunidad</option>
              <option value="hotel">Hotel</option>
              <option value="business">Empresa</option>
            </select>
          </Field>
          <Field label="CIF / NIF">
            <input value={form.tax_id ?? ''} onChange={(e) => update('tax_id', e.target.value)} />
          </Field>
        </div>
        <h3>Contacto y facturación</h3>
        <div className="form-grid">
          <Field label="Persona de contacto">
            <input
              value={form.contact_name ?? ''}
              onChange={(e) => update('contact_name', e.target.value)}
            />
          </Field>
          <Field label="Cargo">
            <input
              value={form.contact_role ?? ''}
              onChange={(e) => update('contact_role', e.target.value)}
            />
          </Field>
          <Field label="Email de contacto">
            <input
              type="email"
              value={form.contact_email ?? ''}
              onChange={(e) => update('contact_email', e.target.value)}
            />
          </Field>
          <Field label="Teléfono de contacto">
            <input
              type="tel"
              value={form.contact_phone ?? ''}
              onChange={(e) => update('contact_phone', e.target.value)}
            />
          </Field>
          <Field label="Email de facturación">
            <input
              type="email"
              value={form.billing_email ?? ''}
              onChange={(e) => update('billing_email', e.target.value)}
            />
          </Field>
          <Field label="Teléfono general">
            <input
              type="tel"
              value={form.phone ?? ''}
              onChange={(e) => update('phone', e.target.value)}
            />
          </Field>
          <Field label="Frecuencia de cobro">
            <select
              value={form.billing_frequency}
              onChange={(e) => update('billing_frequency', e.target.value as BillingFrequency)}
            >
              <option value="monthly">Mensual</option>
              <option value="quarterly">Trimestral</option>
              <option value="per_visit">Por visita</option>
            </select>
          </Field>
          <Field label="Plazo de pago (días)">
            <input
              type="number"
              min="0"
              max="120"
              value={form.payment_terms_days}
              onChange={(e) => update('payment_terms_days', Number(e.target.value))}
            />
          </Field>
          <Field label="Método de pago">
            <select
              value={form.payment_method ?? ''}
              onChange={(e) => update('payment_method', e.target.value || null)}
            >
              <option value="">Sin definir</option>
              <option value="direct_debit">Domiciliación</option>
              <option value="transfer">Transferencia</option>
              <option value="card">Tarjeta</option>
            </select>
          </Field>
          <Field label="Dirección de facturación" className="form-span-2">
            <input
              value={form.billing_address ?? ''}
              onChange={(e) => update('billing_address', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Notas internas">
          <textarea
            rows={3}
            value={form.notes ?? ''}
            onChange={(e) => update('notes', e.target.value)}
          />
        </Field>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => update('active', e.target.checked)}
          />
          Cliente activo
        </label>
        <div className="modal-foot">
          <button className="button secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="button" disabled={saving} type="submit">
            {saving ? 'Guardando…' : client ? 'Guardar cambios' : 'Crear cliente'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ClientDetail({
  client,
  isAdmin,
  onClose,
  onEditClient,
  onNewInstallation,
  onEditInstallation,
  onDeleteInstallation,
}: {
  client: Client
  isAdmin: boolean
  onClose: () => void
  onEditClient: () => void
  onNewInstallation: () => void
  onEditInstallation: (installation: Installation) => void
  onDeleteInstallation: (installation: Installation) => Promise<void>
}) {
  return (
    <Modal
      title={client.legal_name}
      description={client.trade_name || clientTypeLabel(client.client_type)}
      onClose={onClose}
    >
      <div className="client-sheet">
        <div className="sheet-section">
          <div className="sheet-heading">
            <h3>Contacto</h3>
            {isAdmin && (
              <button className="action-link" type="button" onClick={onEditClient}>
                Editar ficha
              </button>
            )}
          </div>
          <div className="detail-list">
            <p>
              <UserRound size={16} />
              {client.contact_name || 'Sin persona de contacto'}
              {client.contact_role ? ` · ${client.contact_role}` : ''}
            </p>
            {client.contact_email && (
              <p>
                <Mail size={16} />
                <a href={`mailto:${client.contact_email}`}>{client.contact_email}</a>
              </p>
            )}
            {client.contact_phone && (
              <p>
                <Phone size={16} />
                <a href={`tel:${client.contact_phone}`}>{client.contact_phone}</a>
              </p>
            )}
            {client.billing_address && (
              <p>
                <MapPin size={16} />
                {client.billing_address}
              </p>
            )}
          </div>
        </div>
        <div className="sheet-section">
          <div className="sheet-heading">
            <h3>Instalaciones</h3>
            {isAdmin && (
              <button className="action-link" type="button" onClick={onNewInstallation}>
                <Plus size={15} />
                Añadir
              </button>
            )}
          </div>
          <div className="installation-list">
            {client.installations.map((installation) => (
              <div className="installation-row" key={installation.id}>
                <div>
                  <strong>{installation.name}</strong>
                  <span>
                    {installation.pool_type || 'Piscina'} · {installation.address}
                  </span>
                  {installation.instructions && <small>{installation.instructions}</small>}
                </div>
                {isAdmin && (
                  <div>
                    <button
                      className="icon-action"
                      type="button"
                      aria-label={`Editar ${installation.name}`}
                      onClick={() => onEditInstallation(installation)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-action destructive"
                      type="button"
                      aria-label={`Eliminar ${installation.name}`}
                      onClick={() => void onDeleteInstallation(installation)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {client.installations.length === 0 && (
              <p className="empty-installations">No hay instalaciones registradas.</p>
            )}
          </div>
        </div>
        <div className="sheet-section compact">
          <h3>Facturación</h3>
          <p>
            {paymentLabel(client.payment_method)} ·{' '}
            {client.billing_frequency === 'per_visit'
              ? 'Por visita'
              : client.billing_frequency === 'quarterly'
                ? 'Trimestral'
                : 'Mensual'}{' '}
            · pago a {client.payment_terms_days} días
          </p>
          {isAdmin && (
            <Link className="client-invoices-link" href={`/facturacion?cliente=${client.id}`}>
              Ver facturas de este cliente
            </Link>
          )}
        </div>
        {isAdmin && <ClientTimeTracking client={client} />}
      </div>
    </Modal>
  )
}

type TimeTrackingVisit = {
  id: string
  scheduled_for: string
  installations: { name: string } | null
  interventions: {
    started_at: string | null
    start_latitude: number | null
    start_longitude: number | null
    start_location_accuracy_m: number | null
  }[]
}

function ClientTimeTracking({ client }: { client: Client }) {
  const [logs, setLogs] = useState<TimeTrackingVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const installationIds = client.installations.map((installation) => installation.id)
    if (installationIds.length === 0) {
      setLogs([])
      setLoading(false)
      return () => {
        active = false
      }
    }
    const loadTimeTracking = async () => {
      setLoading(true)
      const result = await createClient()
        .from('visits')
        .select(
          'id,scheduled_for,installations(name),interventions(started_at,start_latitude,start_longitude,start_location_accuracy_m)',
        )
        .in('installation_id', installationIds)
        .order('scheduled_for', { ascending: false })
      if (!active) return
      if (result.error) {
        setError(result.error.message)
      } else {
        setLogs((result.data ?? []) as unknown as TimeTrackingVisit[])
        setError(null)
      }
      setLoading(false)
    }
    void loadTimeTracking()
    return () => {
      active = false
    }
  }, [client])

  const startedLogs = logs.flatMap((visit) => {
    const intervention = visit.interventions[0]
    if (
      !intervention?.started_at ||
      intervention.start_latitude === null ||
      intervention.start_longitude === null
    ) {
      return []
    }
    return [{ visit, intervention }]
  })

  return (
    <section className="sheet-section time-tracking">
      <div className="sheet-heading">
        <h3>Control horario</h3>
        <span>Solo administración</span>
      </div>
      <p className="time-tracking-intro">
        Inicios registrados con la hora oficial del servidor y el punto comunicado por el
        dispositivo.
      </p>
      {loading && <p className="time-tracking-empty">Cargando registros…</p>}
      {error && (
        <p className="time-tracking-error">No se ha podido cargar el control horario: {error}</p>
      )}
      {!loading && !error && startedLogs.length === 0 && (
        <p className="time-tracking-empty">
          Todavía no hay inicios de visita con ubicación registrada.
        </p>
      )}
      <div className="time-tracking-list">
        {startedLogs.map(({ visit, intervention }) => (
          <article className="time-tracking-entry" key={visit.id}>
            <div className="time-tracking-entry-head">
              <div>
                <strong>{formatDateTimeWithSeconds(new Date(intervention.started_at!))}</strong>
                <span>
                  {visit.installations?.name ?? 'Instalación'} · prevista{' '}
                  {formatDateTime(new Date(visit.scheduled_for))}
                </span>
              </div>
              <span className="time-tracking-accuracy">
                Precisión {Math.round(Number(intervention.start_location_accuracy_m ?? 0))} m
              </span>
            </div>
            <VisitStartMap
              latitude={Number(intervention.start_latitude)}
              longitude={Number(intervention.start_longitude)}
              installationName={visit.installations?.name ?? 'Instalación'}
            />
          </article>
        ))}
      </div>
    </section>
  )
}

function VisitStartMap({
  latitude,
  longitude,
  installationName,
}: {
  latitude: number
  longitude: number
  installationName: string
}) {
  const [mapOpen, setMapOpen] = useState(false)
  const offset = 0.004
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - offset}%2C${latitude - offset}%2C${longitude + offset}%2C${latitude + offset}&layer=mapnik&marker=${latitude}%2C${longitude}`
  const mapLink = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`
  return (
    <div className="time-tracking-map">
      <button type="button" onClick={() => setMapOpen((open) => !open)}>
        <MapPin size={15} aria-hidden="true" /> {mapOpen ? 'Ocultar mapa' : 'Ver punto en el mapa'}
      </button>
      {mapOpen && (
        <>
          <iframe
            title={`Punto de inicio de ${installationName}`}
            src={mapUrl}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <a href={mapLink} target="_blank" rel="noreferrer">
            Abrir mapa completo
          </a>
        </>
      )}
    </div>
  )
}

function formatDateTimeWithSeconds(value: Date) {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(value)
}

function InstallationForm({
  installation,
  clientName,
  onClose,
  onSave,
}: {
  installation?: Installation
  clientName: string
  onClose: () => void
  onSave: (input: InstallationInput) => Promise<void>
}) {
  const [form, setForm] = useState<InstallationInput>(installation ?? emptyInstallation)
  const [saving, setSaving] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const update = <K extends keyof InstallationInput>(key: K, value: InstallationInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }))
  const setCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Este dispositivo no permite obtener la ubicación.')
      return
    }
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        update('location_latitude', Number(position.coords.latitude.toFixed(6)))
        update('location_longitude', Number(position.coords.longitude.toFixed(6)))
      },
      () => setLocationError('No se ha podido obtener la ubicación de la instalación.'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    )
  }
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      title={installation ? 'Editar instalación' : 'Nueva instalación'}
      description={`Cliente: ${clientName}`}
      onClose={onClose}
    >
      <form className="record-form" onSubmit={submit}>
        <div className="form-grid">
          <Field label="Nombre" required>
            <input required value={form.name} onChange={(e) => update('name', e.target.value)} />
          </Field>
          <Field label="Tipo de piscina">
            <input
              value={form.pool_type ?? ''}
              onChange={(e) => update('pool_type', e.target.value)}
              placeholder="Ej. Comunitaria"
            />
          </Field>
          <Field label="Dirección" required className="form-span-2">
            <input
              required
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Instrucciones para la visita">
          <textarea
            rows={3}
            value={form.instructions ?? ''}
            onChange={(e) => update('instructions', e.target.value)}
          />
        </Field>
        <div className="installation-location-fields">
          <div className="sheet-heading">
            <div>
              <h3>Ubicación de la instalación</h3>
              <p>Opcional. Activa la comprobación de distancia al iniciar una visita.</p>
            </div>
            <button className="button secondary" type="button" onClick={setCurrentLocation}>
              <MapPin size={15} aria-hidden="true" /> Usar mi ubicación
            </button>
          </div>
          <div className="form-grid">
            <Field label="Latitud">
              <input
                type="number"
                step="0.000001"
                min="-90"
                max="90"
                value={form.location_latitude ?? ''}
                onChange={(event) =>
                  update(
                    'location_latitude',
                    event.target.value === '' ? null : Number(event.target.value),
                  )
                }
              />
            </Field>
            <Field label="Longitud">
              <input
                type="number"
                step="0.000001"
                min="-180"
                max="180"
                value={form.location_longitude ?? ''}
                onChange={(event) =>
                  update(
                    'location_longitude',
                    event.target.value === '' ? null : Number(event.target.value),
                  )
                }
              />
            </Field>
          </div>
          {locationError && <p className="installation-location-error">{locationError}</p>}
        </div>
        <Field label="Notas internas">
          <textarea
            rows={3}
            value={form.notes ?? ''}
            onChange={(e) => update('notes', e.target.value)}
          />
        </Field>
        <div className="modal-foot">
          <button className="button secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="button" disabled={saving} type="submit">
            {saving ? 'Guardando…' : installation ? 'Guardar cambios' : 'Añadir instalación'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string
  required?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <label className={`field ${className ?? ''}`}>
      <span>
        {label}
        {required && ' *'}
      </span>
      {children}
    </label>
  )
}
function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string
  description: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal client-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-title">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button className="close" type="button" onClick={onClose} aria-label="Cerrar">
            <X size={19} />
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}
function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isRegister = mode === 'register'

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    setFeedback(null)
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validationError = validateAuthInput({ email, password, name, mode })
    if (validationError) {
      setFeedback({ kind: 'error', text: validationError })
      return
    }

    setIsSubmitting(true)
    setFeedback(null)
    const supabase = createClient()
    const result = isRegister
      ? await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() } },
        })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password })

    setIsSubmitting(false)
    if (result.error) {
      setFeedback({ kind: 'error', text: result.error.message })
      return
    }

    if (isRegister && !result.data.session) {
      setFeedback({
        kind: 'success',
        text: 'Cuenta creada. Revisa tu correo para confirmarla y después inicia sesión.',
      })
      return
    }
    setFeedback({
      kind: 'success',
      text: isRegister
        ? 'Cuenta creada. Ya puedes acceder al panel.'
        : 'Sesión iniciada. Cargando el panel…',
    })
  }

  return (
    <main className="auth-page">
      <section className="auth-brand-panel" aria-label="Concepte Blau">
        <Image
          className="auth-logo"
          src="/concepte-blau-logo.png"
          alt="Concepte Blau"
          width={450}
          height={111}
          priority
        />
        <div className="auth-brand-copy">
          <span className="auth-kicker">Gestión de mantenimiento</span>
          <h1>Todo el control de tus piscinas, en un solo lugar.</h1>
          <p>
            Centraliza visitas, clientes y facturación con datos protegidos y siempre actualizados.
          </p>
        </div>
        <ul className="auth-benefits">
          <li>
            <CheckCircle2 size={18} aria-hidden="true" />
            Agenda y partes de trabajo
          </li>
          <li>
            <CheckCircle2 size={18} aria-hidden="true" />
            Clientes e instalaciones conectados
          </li>
          <li>
            <CheckCircle2 size={18} aria-hidden="true" />
            Facturación y cobros al día
          </li>
        </ul>
      </section>
      <section className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-mobile-logo">
            <Image
              src="/concepte-blau-logo.png"
              alt="Concepte Blau"
              width={450}
              height={111}
              priority
            />
          </div>
          <div className="auth-heading">
            <span className="auth-eyebrow">
              <LockKeyhole size={15} aria-hidden="true" />
              Área privada
            </span>
            <h2>{isRegister ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}</h2>
            <p>
              {isRegister
                ? 'Regístrate para empezar a gestionar tu operativa.'
                : 'Accede para continuar con tu operativa diaria.'}
            </p>
          </div>
          <div className="auth-tabs" role="tablist" aria-label="Opciones de acceso">
            <button
              type="button"
              className={!isRegister ? 'active' : ''}
              role="tab"
              aria-selected={!isRegister}
              onClick={() => changeMode('login')}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              className={isRegister ? 'active' : ''}
              role="tab"
              aria-selected={isRegister}
              onClick={() => changeMode('register')}
            >
              Crear cuenta
            </button>
          </div>
          <form className="auth-form" onSubmit={submit} noValidate>
            {isRegister && (
              <label className="auth-field">
                <span>Nombre completo</span>
                <div className="auth-input">
                  <UserRound size={18} aria-hidden="true" />
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    placeholder="Tu nombre"
                  />
                </div>
              </label>
            )}
            <label className="auth-field">
              <span>Correo electrónico</span>
              <div className="auth-input">
                <Mail size={18} aria-hidden="true" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  placeholder="nombre@empresa.com"
                />
              </div>
            </label>
            <label className="auth-field">
              <span>Contraseña</span>
              <div className="auth-input">
                <LockKeyhole size={18} aria-hidden="true" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  placeholder="Mínimo 8 caracteres"
                />
                <button
                  className="auth-password-toggle"
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {isRegister && <small>Usa al menos 8 caracteres.</small>}
            </label>
            {feedback && (
              <p
                className={`auth-feedback ${feedback.kind}`}
                role={feedback.kind === 'error' ? 'alert' : 'status'}
              >
                {feedback.text}
              </p>
            )}
            <button className="auth-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Comprobando…' : isRegister ? 'Crear cuenta' : 'Entrar al panel'}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </form>
          <p className="auth-switch">
            {isRegister ? '¿Ya tienes cuenta?' : '¿Aún no tienes cuenta?'}
            <button type="button" onClick={() => changeMode(isRegister ? 'login' : 'register')}>
              {isRegister ? 'Inicia sesión' : 'Crea una ahora'}
            </button>
          </p>
        </div>
      </section>
    </main>
  )
}
