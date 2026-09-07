'use client'

import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  LinkButton,
  PopoverContent,
  PopoverTrigger,
  toast,
} from '@doscientos/ui'
import {
  AlertTriangle,
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
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { AdminStatistics } from '@/components/admin-statistics'
import { Inventory, type Product } from '@/components/inventory'
import { InvoicePreview } from '@/components/invoice-preview'
import { VisitReport } from '@/components/visit-report'
import { WorkEditor, WorkHistory } from '@/components/work-history'
import { getAgendaVisitAction } from '@/lib/agenda-access'
import { canAccessAppView, type AccountRole } from '@/lib/app-access'
import { validateAuthInput } from '@/lib/auth-validation'
import {
  downloadInvoice,
  formatDate,
  getInvoiceLines,
  type Invoice,
} from '@/lib/invoice-template'
import {
  isClientExtensionSchemaPending,
  isLocationSchemaPending,
} from '@/lib/location-schema-compatibility'
import {
  filterInvoicesByBillingPeriod,
  formatBillingPeriod,
  getBillingPeriod,
  getBillingPeriodOptions,
  toBillingPeriodValue,
} from '@/lib/monthly-billing'
import type { SearchParamUpdates } from '@/lib/search-params'
import { createClient } from '@/lib/supabase/client'
import { usePersistentSearchParams } from '@/lib/use-persistent-search-params'
import { getVisitMapUrls } from '@/lib/visit-location'
import {
  canManagePendingWork,
  getDefaultScheduledFor,
  normalizeWorkPlanningNotes,
  type PendingWorkInput,
  type WorkInstallation,
  type WorkTechnician,
} from '@/lib/work-history'

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
  planning_notes: string | null
  technician_id: string | null
  technician: { full_name: string } | null
  installations: {
    name: string
    address: string
    pool_type: string | null
    instructions: string | null
    notes: string | null
    location_latitude: number | null
    location_longitude: number | null
    clients: { legal_name: string; phone: string | null }
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
const money = new Intl.NumberFormat('ca-ES', { style: 'currency', currency: 'EUR' })
const titles: Record<View, string> = {
  inicio: 'Resum operatiu',
  agenda: 'Agenda de visites',
  trabajos: 'Historial de feines',
  facturacion: 'Facturació i cobraments',
  clientes: 'Clients i instal·lacions',
  inventario: 'Inventari de materials',
  estadisticas: 'Estadístiques',
  parte: 'Informe de visita',
}

export function DemoApp({
  view,
  visitId,
  backHref = '/agenda',
}: {
  view: View
  visitId?: string
  backHref?: '/agenda' | '/trabajos'
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [ready, setReady] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [role, setRole] = useState<AccountRole | null>(null)
  const [accountName, setAccountName] = useState('El teu compte')
  const [accountEmail, setAccountEmail] = useState('')
  const [clientSchemaReady, setClientSchemaReady] = useState(true)
  const [visits, setVisits] = useState<Visit[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [technicians, setTechnicians] = useState<WorkTechnician[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [inventorySchemaReady, setInventorySchemaReady] = useState(true)
  const [productCreationVersion, setProductCreationVersion] = useState(0)
  const [workCreationVersion, setWorkCreationVersion] = useState(0)
  const [statisticsReload, setStatisticsReload] = useState(0)
  const [isPreparingBilling, setIsPreparingBilling] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [visitToStart, setVisitToStart] = useState<Visit | null>(null)
  const [editingClient, setEditingClient] = useState<Client | null | 'new'>(null)
  const [startingVisit, setStartingVisit] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const load = useCallback(async () => {
    const s = createClient()
    const { data: userData, error: userError } = await s.auth.getUser()
    if (userError || !userData.user) {
      toast.error("No s'ha pogut identificar la sessió", {
        description: userError?.message,
      })
      return
    }
    const profile = await s
      .from('profiles')
      .select('role,full_name')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (profile.error || !profile.data) {
      toast.error("No s'ha trobat el perfil d'accés", {
        description: profile.error?.message,
      })
      return
    }
    const accountRole = profile.data.role as AccountRole
    setRole(accountRole)
    const metadataName = userData.user.user_metadata.full_name
    const fallbackName =
      typeof metadataName === 'string' ? metadataName.trim() : userData.user.email?.split('@')[0]
    setAccountName(profile.data.full_name?.trim() || fallbackName || 'El teu compte')
    setAccountEmail(userData.user.email ?? '')

    const invoicesRequest =
      accountRole === 'admin'
        ? s
            .from('invoices')
            .select(
              'id,client_id,number,status,subtotal,vat_total,total,issued_on,due_on,billing_period,clients(legal_name,tax_id,billing_email,billing_address),invoice_lines(id,sort_order,contract_id,visit_id,billing_item_id,description,quantity,unit_price,vat_rate,line_total)',
            )
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null })
    const techniciansRequest =
      accountRole === 'admin'
        ? s.from('profiles').select('id,full_name').eq('role', 'technician').order('full_name')
        : Promise.resolve({ data: [] as WorkTechnician[], error: null })
    const [v, i, p, techniciansResult] = await Promise.all([
      s
        .from('visits')
        .select(
          'id,installation_id,scheduled_for,status,planning_notes,technician_id,technician:profiles!visits_technician_id_fkey(full_name),installations(name,address,pool_type,instructions,notes,location_latitude,location_longitude,clients(legal_name,phone)),interventions(completed_at,notes)',
        )
        .order('scheduled_for'),
      invoicesRequest,
      s
        .from('products')
        .select(
          'id,name,reference,category,unit,sale_price,cost_price,stock_quantity,minimum_stock,active,barcode_ean,minimum_purchase_quantity,units_per_pallet,supplier',
        )
        .order('name'),
      techniciansRequest,
    ])
    const locationSchemaPending = isLocationSchemaPending(v.error?.message)
    const visitResponse = locationSchemaPending
      ? await s
          .from('visits')
          .select(
            'id,installation_id,scheduled_for,status,planning_notes,technician_id,technician:profiles!visits_technician_id_fkey(full_name),installations(name,address,pool_type,instructions,notes,clients(legal_name,phone)),interventions(completed_at,notes)',
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
      isClientExtensionSchemaPending(extendedClients?.error?.message) ||
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
    const inventoryMigrationPending =
      /column products\.(minimum_stock|barcode_ean|minimum_purchase_quantity|units_per_pallet|supplier) does not exist/.test(
        p.error?.message ?? '',
      )
    if (visitResponse.error) {
      toast.error("No s'ha pogut carregar l'operativa", {
        description: visitResponse.error.message,
      })
      return
    }
    setVisits((visitResponse.data ?? []) as unknown as Visit[])
    setInvoices((i.data ?? []) as unknown as Invoice[])
    setClients((clientResponse.data ?? []).map((client) => normalizeClient(client)) as Client[])
    setTechnicians((techniciansResult.data ?? []) as WorkTechnician[])
    setProducts((p.data ?? []) as Product[])
    setInventorySchemaReady(!inventoryMigrationPending)
    const secondaryError =
      i.error ||
      clientResponse.error ||
      techniciansResult.error ||
      (inventoryMigrationPending ? null : p.error)
    if (secondaryError) {
      toast.error("Part de la informació no s'ha pogut carregar", {
        description: secondaryError.message,
      })
    }
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
        setAccountName('El teu compte')
        setAccountEmail('')
      }
    })
    return () => data.subscription.unsubscribe()
  }, [load])
  useEffect(() => {
    if (role && !canAccessAppView(role, view)) router.replace('/agenda')
  }, [role, router, view])
  useEffect(() => {
    if (role !== 'admin') return

    const channel = createClient()
      .channel('monthly-invoices')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
        void load()
      })
      .subscribe()

    return () => {
      void channel.unsubscribe()
    }
  }, [load, role])
  if (!ready) return <main className="empty-state">S'està carregant la teva operativa…</main>
  if (!signedIn) return <AuthScreen />
  if (!role) return <main className="empty-state">S'estan carregant els teus permisos…</main>
  const isAdmin = role === 'admin'
  const activeView = canAccessAppView(role, view) ? view : 'agenda'
  const signOut = async () => {
    if (isSigningOut) return

    setIsSigningOut(true)
    setSignOutError(null)
    const { error } = await createClient().auth.signOut()

    if (error) {
      setSignOutError("No s'ha pogut tancar la sessió. Torna-ho a provar.")
      setIsSigningOut(false)
      return
    }

    setSignedIn(false)
    router.replace('/')
    router.refresh()
  }
  const requestStart = (visit: Visit) => {
    setStartError(null)
    setVisitToStart(visit)
  }
  const recordVisitStart = async (visit: Visit) => {
    const { error } = await createClient().rpc('start_visit', {
      p_visit_id: visit.id,
      p_start_latitude: null,
      p_start_longitude: null,
      p_start_accuracy_m: null,
      p_start_outside_schedule_confirmed: false,
      p_exception_reason: null,
    })
    setStartingVisit(false)
    if (error) {
      setStartError(error.message)
      return
    }
    setVisitToStart(null)
    router.push(`/agenda/${visit.id}`)
  }
  const confirmVisitStart = () => {
    if (!visitToStart || startingVisit) return
    setStartingVisit(true)
    setStartError(null)
    void recordVisitStart(visitToStart)
  }
  const pay = async (invoice: Invoice) => {
    const { error } = await createClient()
      .from('invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', invoice.id)
    if (error) {
      toast.error("No s'ha pogut registrar el cobrament", { description: error.message })
      return
    }
    toast.success('Factura marcada com a cobrada', { description: invoice.number ?? undefined })
    await load()
  }
  const generateMonthlyInvoices = async (billingPeriod: string) => {
    const { data, error } = await createClient().rpc('generate_monthly_invoices', {
      p_billing_period: billingPeriod,
    })
    if (error) {
      toast.error("No s'han pogut actualitzar les factures", { description: error.message })
      return
    }
    const generated = (data ?? []).filter((invoice: { created: boolean }) => invoice.created).length
    toast.success('Factures actualitzades', {
      description: generated
        ? `${formatBillingPeriod(billingPeriod)}: ${generated} esborranys nous.`
        : `Les factures de ${formatBillingPeriod(billingPeriod)} ja estaven actualitzades.`,
    })
    await load()
  }
  const prepareMonthlyInvoices = async () => {
    const billingPeriod =
      searchParams.get('mes') ?? toBillingPeriodValue(getBillingPeriod())

    setIsPreparingBilling(true)
    try {
      await generateMonthlyInvoices(billingPeriod)
    } finally {
      setIsPreparingBilling(false)
    }
  }
  const savePendingWork = async (input: PendingWorkInput, id?: string) => {
    const scheduledFor = new Date(input.scheduledFor)
    if (Number.isNaN(scheduledFor.getTime()))
      throw new Error('Selecciona una data i una hora vàlides.')

    const payload = {
      installation_id: input.installationId,
      technician_id: input.technicianId,
      scheduled_for: scheduledFor.toISOString(),
      planning_notes: normalizeWorkPlanningNotes(input.planningNotes),
    }
    const result = id
      ? await createClient()
          .from('visits')
          .update(payload)
          .eq('id', id)
          .select('id')
          .maybeSingle()
      : await createClient()
          .from('visits')
          .insert({ ...payload, status: 'scheduled' })
          .select('id')
          .maybeSingle()
    if (result.error) throw new Error(result.error.message)
    if (!result.data)
      throw new Error('La feina ja no existeix o no tens permís per modificar-la.')

    toast.success(id ? 'Feina actualitzada' : 'Feina programada')
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
    if (!data) throw new Error('La feina ja no està pendent o no tens permís per eliminar-la.')

    toast.success('Feina eliminada')
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
    toast.success(id ? 'Client actualitzat' : 'Client creat')
    await load()
  }
  const deleteClient = async (client: Client) => {
    if (
      !window.confirm(
        `Voleu eliminar ${client.legal_name}? També se n'eliminaran les instal·lacions. Aquesta acció no es pot desfer.`,
      )
    )
      return false
    const { error } = await createClient().from('clients').delete().eq('id', client.id)
    if (error) {
      toast.error("No s'ha pogut eliminar el client", { description: error.message })
      return false
    }
    toast.success('Client eliminat', { description: client.legal_name })
    await load()
    return true
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
    toast.success(id ? 'Instal·lació actualitzada' : 'Instal·lació afegida')
    await load()
  }
  const deleteInstallation = async (installation: Installation) => {
    if (!window.confirm(`Voleu eliminar la instal·lació «${installation.name}»?`)) return
    const { error } = await createClient().from('installations').delete().eq('id', installation.id)
    if (error) {
      toast.error("No s'ha pogut eliminar la instal·lació", { description: error.message })
      return
    }
    toast.success('Instal·lació eliminada', { description: installation.name })
    await load()
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
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-10 flex w-60 flex-col overflow-y-auto border-r border-slate-200 bg-white px-3 py-4 text-slate-900 max-[880px]:static max-[880px]:w-full max-[880px]:overflow-visible max-[880px]:px-4 max-[880px]:py-3">
        <div className="px-2 pb-5 max-[880px]:px-1 max-[880px]:pb-3">
          <Image
            className="h-auto w-[150px] max-[880px]:w-[136px]"
            src="/concepte-blau-logo.png"
            alt="Concepte Blau"
            width={450}
            height={111}
            priority
          />
        </div>
        <nav className="flex flex-col gap-0.5 max-[880px]:flex-row max-[880px]:overflow-x-auto max-[880px]:pb-0.5">
          {isAdmin && (
            <>
              <p className="mx-2 mb-1 mt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 max-[880px]:hidden">
                Visió general
              </p>
              <Nav
                href="/"
                label="Resum"
                icon={<LayoutDashboard size={17} />}
                active={activeView === 'inicio'}
              />
            </>
          )}
          <p className="mx-2 mb-1 mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-400 max-[880px]:hidden">
            Operativa
          </p>
          <Nav
            href="/agenda"
            label="Agenda"
            icon={<CalendarDays size={17} />}
            active={activeView === 'agenda' || (activeView === 'parte' && backHref === '/agenda')}
          />
          <Nav
            href="/trabajos"
            label="Feines"
            icon={<CheckCircle2 size={17} />}
            active={activeView === 'trabajos' || (activeView === 'parte' && backHref === '/trabajos')}
          />
          <Nav
            href="/inventario"
            label="Inventari"
            icon={<Package size={17} />}
            active={activeView === 'inventario'}
          />
          {isAdmin && (
            <>
              <p className="mx-2 mb-1 mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-400 max-[880px]:hidden">
                Gestió
              </p>
              <Nav
                href="/clientes"
                label="Clients"
                icon={<Users size={17} />}
                active={activeView === 'clientes'}
              />
              <Nav
                href="/facturacion"
                label="Facturació"
                icon={<FileText size={17} />}
                active={activeView === 'facturacion'}
              />
              <Nav
                href="/estadisticas"
                label="Estadístiques"
                icon={<LayoutDashboard size={17} />}
                active={activeView === 'estadisticas'}
              />
            </>
          )}
        </nav>
        <div className="mt-auto border-t border-slate-200 pt-3 max-[880px]:hidden">
          <PopoverTrigger>
            <Button
              className="w-full justify-start gap-3 px-2 text-left hover:bg-slate-50"
              type="button"
              variant="ghost"
              aria-label={`Obre el menú de ${accountName}`}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700" aria-hidden="true">
                {accountInitials || 'CB'}
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm font-medium text-slate-800">{accountName}</strong>
                <span className="block truncate text-xs text-slate-500">{isAdmin ? 'Administració' : 'Operativa'}</span>
              </span>
              <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-slate-400" />
            </Button>
            <PopoverContent placement="top start" className="w-64 p-2">
              <div className="flex items-center gap-3 px-2 py-1.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700" aria-hidden="true">
                  {accountInitials || 'CB'}
                </span>
                <span className="min-w-0">
                  <strong className="block truncate text-sm font-medium text-slate-800">{accountName}</strong>
                  <small className="block truncate text-xs text-slate-500">{accountEmail || 'Sessió activa'}</small>
                </span>
              </div>
              <div className="my-2 border-t border-slate-100" />
              <Button
                className="w-full justify-start px-2 text-slate-700 hover:bg-slate-50"
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void signOut()}
                disabled={isSigningOut}
              >
                <LogOut size={16} aria-hidden="true" />
                {isSigningOut ? "S'està tancant la sessió…" : 'Tanca la sessió'}
              </Button>
              {signOutError && <p className="px-2 pt-2 text-xs text-rose-600">{signOutError}</p>}
            </PopoverContent>
          </PopoverTrigger>
        </div>
      </aside>
      <main className="min-h-dvh pl-60 max-[880px]:pl-0">
        {activeView !== 'agenda' && (
          <header className="sticky top-0 z-5 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-8 backdrop-blur max-[880px]:px-5">
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-slate-800">{titles[activeView]}</h1>
            </div>
            <div className="flex items-center gap-2">
              {activeView === 'inicio' && (
                <LinkButton href="/agenda">
                  Veure agenda
                </LinkButton>
              )}
              {activeView === 'clientes' && isAdmin && (
                <Button type="button" onClick={() => setEditingClient('new')}>
                  <Plus size={17} aria-hidden="true" />
                  Client nou
                </Button>
              )}
              {activeView === 'trabajos' && isAdmin && (
                <Button
                  type="button"
                  onClick={() => setWorkCreationVersion((value) => value + 1)}
                >
                  <Plus size={17} aria-hidden="true" />
                  Feina nova
                </Button>
              )}
              {activeView === 'facturacion' && isAdmin && (
                <Button
                  type="button"
                  disabled={isPreparingBilling}
                  onClick={() => void prepareMonthlyInvoices()}
                >
                  <FileText size={17} aria-hidden="true" />
                  {isPreparingBilling ? "S'estan actualitzant…" : 'Actualitza les factures'}
                </Button>
              )}
              {activeView === 'inventario' && isAdmin && (
                <Button
                  className="inventory-create"
                  type="button"
                  onClick={() => setProductCreationVersion((value) => value + 1)}
                >
                  <Plus size={17} aria-hidden="true" />
                  Material nou
                </Button>
              )}
              {activeView === 'estadisticas' && isAdmin && (
                <Button
                  className="analytics-refresh"
                  type="button"
                  variant="outline"
                  onClick={() => setStatisticsReload((value) => value + 1)}
                >
                  <RefreshCw size={16} aria-hidden="true" />
                  Actualitza
                </Button>
              )}
            </div>
          </header>
        )}
        <div
          className={
            activeView === 'agenda'
              ? 'agenda-content min-h-dvh'
              : 'mx-auto max-w-[1560px] px-8 py-7 max-[880px]:px-5 max-[880px]:py-6'
          }
        >
          {activeView === 'inicio' && (
            <Overview
              visits={visits}
              invoices={invoices}
              clients={clients}
              products={products}
              accountName={accountName}
              isAdmin={isAdmin}
              start={requestStart}
            />
          )}
          {activeView === 'agenda' && (
            <Agenda
              visits={visits}
              installations={workInstallations}
              technicians={technicians}
              isAdmin={isAdmin}
              start={requestStart}
              onSavePendingWork={savePendingWork}
              onDeletePendingWork={deletePendingWork}
            />
          )}
          {activeView === 'trabajos' && (
            <WorkHistory
              visits={visits}
              installations={workInstallations}
              technicians={technicians}
              isAdmin={isAdmin}
              onSavePendingWork={savePendingWork}
              onDeletePendingWork={deletePendingWork}
              creationVersion={workCreationVersion}
            />
          )}
          {activeView === 'parte' && visitId && (
            <VisitReport visitId={visitId} readOnly={isAdmin} backHref={backHref} />
          )}
          {activeView === 'facturacion' && (
            <Billing
              invoices={invoices}
              pay={pay}
              clientId={searchParams.get('cliente')}
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
            }
          }}
          title="Registra l'inici de la visita"
          description={
            visitToStart ? (
              <StartVisitConfirmation
                visit={visitToStart}
                error={startError}
              />
            ) : undefined
          }
          confirmLabel={
            startingVisit ? "S'està registrant l'inici…" : "Confirma i registra l'inici"
          }
          cancelLabel="Cancel·la"
          pending={startingVisit}
          onConfirm={confirmVisitStart}
        />
      )}
    </div>
  )
}
function StartVisitConfirmation({
  visit,
  error,
}: {
  visit: Visit
  error: string | null
}) {
  const scheduledFor = new Date(visit.scheduled_for)
  return (
    <div className="start-confirmation">
      <p>
        Confirmes que ets a <strong>{visit.installations?.address ?? "l'adreça assignada"}</strong>{' '}
        per a {visit.installations?.clients?.legal_name ?? 'aquest client'}?
      </p>
      <p className="start-confirmation-schedule">Visita prevista: {formatDateTime(scheduledFor)}</p>
      {visit.planning_notes && (
        <aside className="start-confirmation-notes">
          <strong>Notes de planificació</strong>
          <p>{visit.planning_notes}</p>
        </aside>
      )}
      <p className="start-confirmation-location">
        En confirmar, es registrarà l'hora oficial d'inici de la visita.
      </p>
      {error && <p className="start-confirmation-error">{error}</p>}
    </div>
  )
}
function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat('ca-ES', {
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
    <Link
      className={`flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium transition-colors max-[880px]:h-8 max-[880px]:shrink-0 max-[880px]:gap-2 max-[880px]:px-3 max-[880px]:text-xs ${
        active
          ? 'bg-violet-50 text-violet-700'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
      href={href}
      aria-current={active ? 'page' : undefined}
    >
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
  const scheduledFor = new Date(visit.scheduled_for)
  const status = getAgendaVisitAction(visit.status, true).label
  const statusClass =
    visit.status === 'in_progress'
      ? 'bg-sky-50 text-sky-700 ring-sky-100'
      : visit.status === 'scheduled'
        ? 'bg-violet-50 text-violet-700 ring-violet-100'
        : 'bg-slate-100 text-slate-600 ring-slate-200'

  return (
    <div className="grid grid-cols-[5.25rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1 border-t border-slate-100 py-4 first:border-t-0 sm:grid-cols-[6.25rem_minmax(0,1fr)_auto]">
      <div className="row-span-2 self-start text-sm font-semibold tabular-nums text-slate-900">
        {new Intl.DateTimeFormat('ca-ES', { hour: '2-digit', minute: '2-digit' }).format(scheduledFor)}
        <span className="mt-0.5 block text-xs font-medium capitalize text-slate-500">
          {new Intl.DateTimeFormat('ca-ES', { weekday: 'short', day: 'numeric', month: 'short' }).format(
            scheduledFor,
          )}
        </span>
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900">{x?.clients?.legal_name ?? 'Client'}</div>
        <div className="mt-0.5 truncate text-xs text-slate-500">
          {x?.name ?? 'Instal·lació'} · {x?.address ?? ''}
        </div>
        {isAdmin && (
          <div className="mt-1 text-xs text-slate-500">
            Responsable: {visit.technician?.full_name ?? 'Sense assignar'}
          </div>
        )}
      </div>
      {isAdmin ? (
        <span className={`col-start-2 w-fit rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset sm:col-start-auto ${statusClass}`}>
          {status}
        </span>
      ) : null}
      {!isAdmin && visit.status === 'completed' ? (
        <span className="col-start-2 w-fit rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-100 sm:col-start-auto">
          Completada
        </span>
      ) : null}
      {!isAdmin && visit.status === 'in_progress' ? (
        <Link
          className="col-start-2 w-fit rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-100 sm:col-start-auto"
          href={`/agenda/${visit.id}`}
        >
          Continua
        </Link>
      ) : null}
      {!isAdmin && visit.status === 'cancelled' ? (
        <span className="col-start-2 w-fit rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200 sm:col-start-auto">
          Cancel·lada
        </span>
      ) : null}
      {!isAdmin && visit.status === 'scheduled' ? (
        <Button className="col-start-2 w-fit sm:col-start-auto" type="button" variant="secondary" size="xs" onClick={() => start(visit)}>
          Inicia
        </Button>
      ) : null}
    </div>
  )
}
function Overview({
  visits,
  invoices,
  clients,
  products,
  accountName,
  isAdmin,
  start,
}: {
  visits: Visit[]
  invoices: Invoice[]
  clients: Client[]
  products: Product[]
  accountName: string
  isAdmin: boolean
  start: (v: Visit) => void
}) {
  const now = new Date()
  const today = startOfDay(now)
  const operationalVisits = visits.filter(
    (visit) => visit.status !== 'completed' && visit.status !== 'cancelled',
  )
  const todayVisits = operationalVisits.filter((visit) => isSameDay(new Date(visit.scheduled_for), now))
  const futureVisits = operationalVisits.filter((visit) => new Date(visit.scheduled_for) >= today)
  const displayedVisits = (todayVisits.length ? todayVisits : futureVisits.length ? futureVisits : operationalVisits).slice(0, 4)
  const due = invoices.filter((invoice) => invoice.status !== 'paid')
  const overdueInvoices = due.filter(
    (invoice) => invoice.due_on && new Date(`${invoice.due_on}T12:00:00`) < today,
  )
  const unassignedVisits = operationalVisits.filter((visit) => !visit.technician_id)
  const overdueVisits = operationalVisits.filter((visit) => new Date(visit.scheduled_for) < today)
  const lowStock = products.filter(
    (product) => product.active && product.stock_quantity <= product.minimum_stock,
  )
  const weeklyVisits = futureVisits.filter(
    (visit) => new Date(visit.scheduled_for) < addDays(today, 7),
  )
  const activeClients = clients.filter((client) => client.active)
  const activeInstallations = activeClients.reduce(
    (total, client) => total + client.installations.length,
    0,
  )
  const inProgressVisits = operationalVisits.filter((visit) => visit.status === 'in_progress')
  const currentDate = new Intl.DateTimeFormat('ca-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now)
  const attentionCount = unassignedVisits.length + overdueVisits.length + lowStock.length + overdueInvoices.length
  const daySummary = todayVisits.length
    ? `${todayVisits.length} ${todayVisits.length === 1 ? 'visita prevista' : 'visites previstes'} per avui.`
    : weeklyVisits.length
      ? `No tens visites avui. Hi ha ${weeklyVisits.length} planificades durant els propers 7 dies.`
      : 'No hi ha visites pendents de planificar.'

  return (
    <div className="overview-page">
      <section className="overview-hero" aria-labelledby="overview-title">
        <div className="overview-hero-copy">
          <span className="overview-eyebrow">Centre de control</span>
          <h2 id="overview-title">Bon dia, {accountName}</h2>
          <p>{daySummary}</p>
        </div>
        <div className="overview-hero-meta">
          <span className={`overview-health ${attentionCount ? 'needs-attention' : 'on-track'}`}>
            <span aria-hidden="true" />
            {attentionCount ? `${attentionCount} per revisar` : 'Operativa al dia'}
          </span>
          <time dateTime={now.toISOString()}>
            <CalendarDays size={14} aria-hidden="true" />
            {currentDate}
          </time>
        </div>
      </section>

      <section className="overview-metrics" aria-label="Indicadors operatius">
        <OverviewMetric
          href="/agenda"
          icon={<CalendarDays size={16} />}
          label="Avui"
          value={String(todayVisits.length)}
          detail={inProgressVisits.length ? `${inProgressVisits.length} en curs` : 'visites previstes'}
        />
        <OverviewMetric
          href="/agenda"
          icon={<ArrowRight size={16} />}
          label="Propers 7 dies"
          value={String(weeklyVisits.length)}
          detail="visites planificades"
        />
        <OverviewMetric
          href="/clientes"
          icon={<Users size={16} />}
          label="Cartera activa"
          value={String(activeClients.length)}
          detail={`${activeInstallations} instal·lacions`}
        />
        <OverviewMetric
          href="/facturacion"
          icon={<CircleDollarSign size={16} />}
          label="Per cobrar"
          value={money.format(due.reduce((total, invoice) => total + Number(invoice.total), 0))}
          detail={overdueInvoices.length ? `${overdueInvoices.length} vençudes` : `${due.length} pendents`}
          tone={overdueInvoices.length ? 'danger' : 'default'}
        />
      </section>

      <div className="overview-panels">
        <section className="overview-panel overview-visits-panel" aria-labelledby="upcoming-visits-title">
          <div className="overview-panel-head">
            <div>
              <span>{todayVisits.length ? 'Operativa d’avui' : 'Planificació'}</span>
              <h3 id="upcoming-visits-title">{todayVisits.length ? "Agenda d'avui" : 'Properes visites'}</h3>
            </div>
            <Link className="overview-panel-link" href="/agenda">
              Agenda <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          {displayedVisits.length ? (
            displayedVisits.slice(0, 3).map((visit) => <VisitRow key={visit.id} visit={visit} isAdmin={isAdmin} start={start} />)
          ) : (
            <p className="overview-empty">No hi ha visites assignades o programades.</p>
          )}
        </section>

        <section className="overview-panel overview-attention-panel" aria-labelledby="attention-title">
          <div className="overview-panel-head">
            <div>
              <span>Seguiment</span>
              <h3 id="attention-title">Prioritats</h3>
            </div>
            <span className="overview-alert-count">{attentionCount}</span>
          </div>
          <div className="overview-alerts">
            {unassignedVisits.length > 0 && <OverviewAlert href="/agenda" icon={<AlertTriangle size={16} />} title={`${unassignedVisits.length} visites sense assignar`} detail="Assigna un tècnic abans de la visita." tone="warning" />}
            {overdueVisits.length > 0 && <OverviewAlert href="/agenda" icon={<CalendarDays size={16} />} title={`${overdueVisits.length} visites pendents de tancar`} detail="Revisa els parts que ja han vençut." tone="danger" />}
            {lowStock.length > 0 && <OverviewAlert href="/inventario?stock=low" icon={<Package size={16} />} title={`${lowStock.length} materials amb estoc baix`} detail="Consulta les existències i planifica la reposició." tone="warning" />}
            {overdueInvoices.length > 0 && <OverviewAlert href="/facturacion" icon={<CircleDollarSign size={16} />} title={`${money.format(overdueInvoices.reduce((total, invoice) => total + Number(invoice.total), 0))} vençuts`} detail={`${overdueInvoices.length} factures pendents de cobrament.`} tone="danger" />}
            {!attentionCount && (
              <div className="flex items-start gap-3 py-4 text-emerald-600">
                <CheckCircle2 size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
                <span>
                  <strong className="block text-sm font-semibold text-slate-900">Tot sota control</strong>
                  <small className="mt-0.5 block text-xs leading-5 text-slate-500">No hi ha incidències operatives pendents.</small>
                </span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function OverviewAlert({ href, icon, title, detail, tone }: { href: string; icon: ReactNode; title: string; detail: string; tone: 'warning' | 'danger' }) {
  const toneClass = tone === 'danger' ? 'text-rose-600' : 'text-amber-600'
  return (
    <Link className="-mx-1 flex items-start gap-3 rounded-lg px-1 py-3 transition-colors hover:bg-slate-50 hover:px-2" href={href}>
      <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-md ${tone === 'danger' ? 'bg-rose-50' : 'bg-amber-50'} ${toneClass}`} aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1">
        <strong className="block text-sm font-medium text-slate-800">{title}</strong>
        <small className="mt-0.5 block text-xs leading-5 text-slate-500">{detail}</small>
      </span>
      <ArrowRight size={15} aria-hidden="true" className="mt-2 shrink-0 text-slate-400" />
    </Link>
  )
}

function OverviewMetric({
  icon,
  label,
  value,
  detail,
  href,
  tone = 'default',
}: {
  icon: ReactNode
  label: string
  value: string
  detail: string
  href: string
  tone?: 'default' | 'danger'
}) {
  return (
    <Link className={`overview-metric ${tone === 'danger' ? 'is-danger' : ''}`} href={href}>
      <span className="overview-metric-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="overview-metric-content">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </span>
      <ArrowRight className="overview-metric-arrow" size={15} aria-hidden="true" />
    </Link>
  )
}
type CalendarView = 'day' | 'week' | 'month'

function Agenda({
  visits,
  installations,
  technicians,
  isAdmin,
  start,
  onSavePendingWork,
  onDeletePendingWork,
}: {
  visits: Visit[]
  installations: WorkInstallation[]
  technicians: WorkTechnician[]
  isAdmin: boolean
  start: (v: Visit) => void
  onSavePendingWork: (input: PendingWorkInput, id?: string) => Promise<void>
  onDeletePendingWork: (id: string) => Promise<void>
}) {
  const [calendarView, setCalendarView] = useState<CalendarView>('week')
  const [activeDate, setActiveDate] = useState(() => startOfDay(new Date()))
  const [editingVisit, setEditingVisit] = useState<Visit | 'new' | null>(null)
  const [initialScheduledFor, setInitialScheduledFor] = useState<string | undefined>()
  const [deletingVisit, setDeletingVisit] = useState<Visit | null>(null)
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [operationError, setOperationError] = useState<string | null>(null)
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
  const createWork = (date: Date) => {
    if (!isAdmin) return
    setOperationError(null)
    setInitialScheduledFor(getDefaultScheduledFor(date))
    setEditingVisit('new')
  }
  const editWork = (visit: Visit) => {
    if (!canManagePendingWork(isAdmin, visit.status)) return
    setOperationError(null)
    setInitialScheduledFor(undefined)
    setEditingVisit(visit)
  }
  const requestDeleteWork = (visit: Visit) => {
    if (!canManagePendingWork(isAdmin, visit.status)) return
    setOperationError(null)
    setDeletingVisit(visit)
  }
  const openVisitDetails = (visit: Visit) => {
    if (!isAdmin && visit.status === 'scheduled') setSelectedVisit(visit)
  }

  return (
    <>
      <section
        className={`calendar-shell calendar-${calendarView}`}
        aria-label="Calendari de visites"
      >
        <header className="calendar-toolbar">
          <div className="calendar-period">
            <span>Calendari</span>
            <h3>{calendarPeriodLabel(activeDate, calendarView)}</h3>
          </div>
          <div className="calendar-controls">
            {isAdmin && (
              <Button type="button" size="sm" onClick={() => createWork(activeDate)}>
                <Plus size={16} aria-hidden="true" />
                Feina nova
              </Button>
            )}
            <div className="calendar-pagination">
              <button
                type="button"
                className="calendar-icon-button"
                onClick={previous}
                aria-label="Període anterior"
              >
                <ChevronLeft size={19} />
              </button>
              <button
                type="button"
                className="calendar-today"
                onClick={() => setActiveDate(startOfDay(new Date()))}
              >
                Avui
              </button>
              <button
                type="button"
                className="calendar-icon-button"
                onClick={next}
                aria-label="Període següent"
              >
                <ChevronRight size={19} />
              </button>
            </div>
            <div className="calendar-view-switch" role="tablist" aria-label="Vista de calendari">
              {(
                [
                  ['day', 'Dia'],
                  ['week', 'Setmana'],
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
            onPreview={openVisitDetails}
            onCreate={createWork}
            onEdit={editWork}
            onDelete={requestDeleteWork}
          />
        )}
        {calendarView === 'week' && (
          <WeekCalendar
            days={days}
            visits={visits}
            isAdmin={isAdmin}
            onPreview={openVisitDetails}
            onCreate={createWork}
            onEdit={editWork}
            onDelete={requestDeleteWork}
          />
        )}
        {calendarView === 'month' && (
          <MonthCalendar
            days={days}
            activeDate={activeDate}
            visits={visits}
            isAdmin={isAdmin}
            onPreview={openVisitDetails}
            onCreate={createWork}
            onEdit={editWork}
            onDelete={requestDeleteWork}
          />
        )}
      </section>
      {operationError && <p className="form-error">{operationError}</p>}
      {selectedVisit && (
        <VisitPreview
          visit={selectedVisit}
          onClose={() => setSelectedVisit(null)}
          onStart={() => {
            setSelectedVisit(null)
            start(selectedVisit)
          }}
        />
      )}
      {editingVisit && (
        <WorkEditor
          key={`${editingVisit === 'new' ? 'new' : editingVisit.id}-${initialScheduledFor ?? ''}`}
          visit={editingVisit}
          installations={installations}
          technicians={technicians}
          initialScheduledFor={initialScheduledFor}
          onClose={() => setEditingVisit(null)}
          onSave={async (input) => {
            await onSavePendingWork(input, editingVisit === 'new' ? undefined : editingVisit.id)
            setEditingVisit(null)
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(deletingVisit)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeletingVisit(null)
        }}
        title="Elimina la feina programada?"
        description="Aquesta acció no es pot desfer."
        confirmLabel="Elimina la feina"
        cancelLabel="Cancel·la"
        destructive
        pending={isDeleting}
        onConfirm={() => {
          if (!deletingVisit) return
          setIsDeleting(true)
          void onDeletePendingWork(deletingVisit.id)
            .catch((error: unknown) => {
              setOperationError(error instanceof Error ? error.message : "No s'ha pogut eliminar la feina.")
            })
            .finally(() => {
              setIsDeleting(false)
              setDeletingVisit(null)
            })
        }}
      />
    </>
  )
}

function VisitPreview({ visit, onClose, onStart }: { visit: Visit; onClose: () => void; onStart: () => void }) {
  const installation = visit.installations
  const scheduledFor = new Date(visit.scheduled_for)
  const { embedUrl, directionsUrl } = getVisitMapUrls({
    installationName: installation?.name,
    address: installation?.address,
    latitude: installation?.location_latitude,
    longitude: installation?.location_longitude,
  })

  return (
    <Modal
      title={installation?.clients?.legal_name ?? 'Detalls de la visita'}
      description="Revisa la informació abans de registrar l'inici."
      onClose={onClose}
      className="visit-preview-modal"
    >
      <div className="visit-preview-content">
        <div className="visit-preview-schedule">
          <CalendarDays size={19} aria-hidden="true" />
          <div>
            <span>Visita programada</span>
            <strong>{formatDateTime(scheduledFor)}</strong>
          </div>
        </div>
        <section className="visit-preview-installation">
          <div className="visit-preview-section-heading">
            <Building2 size={18} aria-hidden="true" />
            <div>
              <strong>{installation?.name ?? 'Instal·lació'}</strong>
              {installation?.pool_type && <span>{installation.pool_type}</span>}
            </div>
          </div>
          <address>{installation?.address ?? 'No hi ha cap adreça registrada.'}</address>
          {installation?.clients?.phone && (
            <a href={`tel:${installation.clients.phone}`} className="visit-preview-phone">
              <Phone size={15} aria-hidden="true" /> {installation.clients.phone}
            </a>
          )}
        </section>
        <section className="visit-preview-map" aria-label="Ubicació de la instal·lació">
          <iframe
            title={`Mapa de ${installation?.name ?? 'la instal·lació'}`}
            src={embedUrl}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <a href={directionsUrl} target="_blank" rel="noreferrer" className="visit-preview-map-link">
            <MapPin size={16} aria-hidden="true" /> Obre la ruta a Google Maps
          </a>
        </section>
        {visit.planning_notes && (
          <aside className="visit-preview-notes">
            <strong>Indicacions de la visita</strong>
            <p>{visit.planning_notes}</p>
          </aside>
        )}
        {installation?.instructions && (
          <aside className="visit-preview-notes">
            <strong>Instruccions de la instal·lació</strong>
            <p>{installation.instructions}</p>
          </aside>
        )}
        {installation?.notes && (
          <aside className="visit-preview-notes subtle">
            <strong>Notes de la instal·lació</strong>
            <p>{installation.notes}</p>
          </aside>
        )}
      </div>
      <DialogFooter className="modal-foot visit-preview-footer">
        <Button variant="outline" type="button" onClick={onClose}>Torna a l'agenda</Button>
        <Button type="button" onClick={onStart}>Inicia la visita</Button>
      </DialogFooter>
    </Modal>
  )
}

function DayCalendar({
  date,
  visits,
  isAdmin,
  onPreview,
  onCreate,
  onEdit,
  onDelete,
}: {
  date: Date
  visits: Visit[]
  isAdmin: boolean
  onPreview: (visit: Visit) => void
  onCreate: (date: Date) => void
  onEdit: (visit: Visit) => void
  onDelete: (visit: Visit) => void
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
        <div
          className={`day-track ${isAdmin ? 'can-create-work' : ''}`}
          onClick={() => onCreate(date)}
        >
          {hours.map((hour) => (
            <div className="day-hour" key={hour} />
          ))}
          {visits.map((visit) => (
            <CalendarEvent
              key={visit.id}
              visit={visit}
              isAdmin={isAdmin}
              onPreview={onPreview}
              onEdit={onEdit}
              onDelete={onDelete}
              timed
            />
          ))}
          {visits.length === 0 && (
            <p className="calendar-empty">No hi ha visites previstes per a aquest dia.</p>
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
  onPreview,
  onCreate,
  onEdit,
  onDelete,
}: {
  days: Date[]
  visits: Visit[]
  isAdmin: boolean
  onPreview: (visit: Visit) => void
  onCreate: (date: Date) => void
  onEdit: (visit: Visit) => void
  onDelete: (visit: Visit) => void
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
          <div
            className={`week-day ${isToday(day) ? 'today' : ''} ${isAdmin ? 'can-create-work' : ''}`}
            key={day.toISOString()}
            onClick={() => onCreate(day)}
          >
            {visitsForDay(visits, day).map((visit) => (
              <CalendarEvent
                key={visit.id}
                visit={visit}
                isAdmin={isAdmin}
                onPreview={onPreview}
                onEdit={onEdit}
                onDelete={onDelete}
                compact
              />
            ))}
            {visitsForDay(visits, day).length === 0 && (
              <span className="calendar-free">Lliure</span>
            )}
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
  onPreview,
  onCreate,
  onEdit,
  onDelete,
}: {
  days: Date[]
  activeDate: Date
  visits: Visit[]
  isAdmin: boolean
  onPreview: (visit: Visit) => void
  onCreate: (date: Date) => void
  onEdit: (visit: Visit) => void
  onDelete: (visit: Visit) => void
}) {
  return (
    <div className="month-calendar">
      <div className="month-weekdays">
        {['Dl.', 'Dt.', 'Dc.', 'Dj.', 'Dv.', 'Ds.', 'Dg.'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="month-grid">
        {days.map((day) => {
          const isCurrentMonth = day.getMonth() === activeDate.getMonth()
          const dayVisits = visitsForDay(visits, day)
          return (
            <div
              className={`month-day ${isCurrentMonth ? '' : 'outside-month'} ${isToday(day) ? 'today' : ''} ${isAdmin ? 'can-create-work' : ''}`}
              key={day.toISOString()}
              onClick={() => onCreate(day)}
            >
              <span className="month-date">{day.getDate()}</span>
              <div className="month-events">
                {dayVisits.slice(0, 3).map((visit) => (
                  <CalendarEvent
                    key={visit.id}
                    visit={visit}
                    isAdmin={isAdmin}
                    onPreview={onPreview}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    compact
                  />
                ))}
                {dayVisits.length > 3 && (
                  <span className="more-events">+{dayVisits.length - 3} més</span>
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
  onPreview,
  onEdit,
  onDelete,
  compact,
  timed,
}: {
  visit: Visit
  isAdmin: boolean
  onPreview: (visit: Visit) => void
  onEdit: (visit: Visit) => void
  onDelete: (visit: Visit) => void
  compact?: boolean
  timed?: boolean
}) {
  const scheduled = new Date(visit.scheduled_for)
  const minutes = scheduled.getHours() * 60 + scheduled.getMinutes()
  const top = Math.max(0, (minutes - 420) * 1.15)
  const action = getAgendaVisitAction(visit.status, isAdmin)
  const canManage = canManagePendingWork(isAdmin, visit.status)
  const content = (
    <>
      <time>
        {new Intl.DateTimeFormat('ca-ES', { hour: '2-digit', minute: '2-digit' }).format(scheduled)}
      </time>
      <strong>{visit.installations?.clients?.legal_name ?? 'Client'}</strong>
      {!compact && <span>{visit.installations?.name ?? 'Instal·lació'}</span>}
      {isAdmin && (
        <span className="event-assignee">
          Responsable: {visit.technician?.full_name ?? 'Sense assignar'}
        </span>
      )}
    </>
  )
  const className = `calendar-event ${visit.status} ${compact ? 'compact' : ''} ${action.isInteractive || canManage ? 'operational' : ''}`
  if (canManage)
    return (
      <div className={className} style={timed ? { top } : undefined} onClick={(event) => event.stopPropagation()}>
        {content}
        <div className="calendar-event-actions">
          <button type="button" className="calendar-event-action" onClick={() => onEdit(visit)}>
            <Pencil size={13} aria-hidden="true" /> Edita
          </button>
          <button
            type="button"
            className="calendar-event-action destructive"
            onClick={() => onDelete(visit)}
          >
            <Trash2 size={13} aria-hidden="true" /> Elimina
          </button>
        </div>
      </div>
    )
  if (action.isInteractive && visit.status === 'scheduled')
    return (
      <button
        type="button"
        className={className}
        style={timed ? { top } : undefined}
        onClick={(event) => {
          event.stopPropagation()
          onPreview(visit)
        }}
      >
        {content}
        <em>{action.label}</em>
      </button>
    )
  if (action.isInteractive && (visit.status === 'in_progress' || visit.status === 'completed'))
    return (
      <Link
        className={className}
        style={timed ? { top } : undefined}
        href={`/agenda/${visit.id}`}
        onClick={(event) => event.stopPropagation()}
      >
        {content}
        <em>{action.label}</em>
      </Link>
    )
  return (
    <div className={className} style={timed ? { top } : undefined} onClick={(event) => event.stopPropagation()}>
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
  return new Intl.DateTimeFormat('ca-ES', { weekday: 'short' }).format(date).replace('.', '')
}
function calendarPeriodLabel(date: Date, view: CalendarView) {
  if (view === 'month')
    return new Intl.DateTimeFormat('ca-ES', { month: 'long', year: 'numeric' }).format(date)
  if (view === 'day')
    return new Intl.DateTimeFormat('ca-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(date)
  const end = addDays(startOfWeek(date), 6)
  return `${new Intl.DateTimeFormat('ca-ES', { day: 'numeric', month: 'short' }).format(startOfWeek(date))} — ${new Intl.DateTimeFormat('ca-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(end)}`
}
function Billing({
  invoices,
  pay,
  clientId,
}: {
  invoices: Invoice[]
  pay: (i: Invoice) => void
  clientId: string | null
}) {
  const searchParams = useSearchParams()
  const updateSearchParams = usePersistentSearchParams()
  const [previewedInvoice, setPreviewedInvoice] = useState<Invoice | null>(null)
  const billingPeriod = searchParams.get('mes') ?? toBillingPeriodValue(getBillingPeriod())
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
      <section className="billing-summary" aria-label="Resum de facturació">
        <div className="billing-summary-card">
          <FileText size={19} aria-hidden="true" />
          <div>
            <span>Facturat</span>
            <strong>{money.format(billedTotal)}</strong>
            <small>{displayedInvoices.length} factures emeses</small>
          </div>
        </div>
        <div className="billing-summary-card pending">
          <CircleDollarSign size={19} aria-hidden="true" />
          <div>
            <span>Pendent de cobrament</span>
            <strong>{money.format(pendingTotal)}</strong>
            <small>{pendingInvoices.length} per gestionar</small>
          </div>
        </div>
        <div className="billing-summary-card paid">
          <CheckCircle2 size={19} aria-hidden="true" />
          <div>
            <span>Cobrades</span>
            <strong>{paidInvoices.length}</strong>
            <small>factures conciliades</small>
          </div>
        </div>
      </section>
      <section className="billing-list-panel" aria-labelledby="invoice-list-title">
        <header className="billing-list-header">
          <div>
            <span className="billing-list-kicker">Registre de factures</span>
            <h3 id="invoice-list-title">
              {filteredClientName ? `Factures de ${filteredClientName}` : 'Totes les factures'}
            </h3>
          </div>
          <div className="billing-list-controls">
            {clientId && <Link href={`/facturacion?mes=${billingPeriod}`}>Veure-les totes</Link>}
            <select
              value={billingPeriod}
              onChange={(event) => updateSearchParams({ mes: event.target.value })}
            >
              {getBillingPeriodOptions().map((period) => (
                <option key={period.value} value={period.value}>
                  {period.label}
                </option>
              ))}
            </select>
            <span className="billing-list-count">{displayedInvoices.length} en total</span>
          </div>
        </header>
        {displayedInvoices.length ? (
          <div className="invoice-list" aria-label="Llista de factures">
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
                      <span className="invoice-number">{invoice.number ?? 'Esborrany'}</span>
                      <strong>{invoice.clients?.legal_name ?? 'Client sense assignar'}</strong>
                      <div className="invoice-dates">
                        <span>Període {formatBillingPeriod(invoice.billing_period)}</span>
                        <span>Emesa {formatDate(invoice.issued_on)}</span>
                        <span>Venç {formatDate(invoice.due_on)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="invoice-concepts">
                    <span className="invoice-concepts-label">
                      <FileText size={14} aria-hidden="true" />
                      {lineCountLabel}
                    </span>
                    <strong>{lines[0]?.description}</strong>
                    {lines.length > 1 && <small>+ {lines.length - 1} més</small>}
                  </div>
                  <div className="invoice-amount">
                    <span>Total</span>
                    <strong>{money.format(Number(invoice.total))}</strong>
                    <small>IVA incl.</small>
                  </div>
                  <div className="invoice-actions">
                    <div className="invoice-utility-actions">
                      <Button
                        className="invoice-action"
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewedInvoice(invoice)}
                        aria-label={`Veure la factura ${invoice.number ?? invoice.id}`}
                      >
                        <Eye size={16} aria-hidden="true" />
                        <span>Veure</span>
                      </Button>
                      <Button
                        className="invoice-action"
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => downloadInvoice(invoice)}
                        aria-label={`Descarrega la factura ${invoice.number ?? invoice.id}`}
                      >
                        <Download size={16} aria-hidden="true" />
                        <span>Descarrega</span>
                      </Button>
                    </div>
                    {isPaid ? (
                      <span className="invoice-status-pill paid">
                        <CheckCircle2 size={14} aria-hidden="true" />
                        Cobrada
                      </span>
                    ) : (
                      <Button
                        className="invoice-status-pill pending"
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => pay(invoice)}
                      >
                        Marca com a cobrada
                      </Button>
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
              <strong>Encara no hi ha factures</strong>
              <p>Actualitza les factures del mes per crear els esborranys dels clients actius.</p>
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
  onDeleteClient: (client: Client) => Promise<boolean>
  onSaveInstallation: (
    clientId: string,
    installation: InstallationInput,
    id?: string,
  ) => Promise<void>
  onDeleteInstallation: (installation: Installation) => Promise<void>
}) {
  const searchParams = useSearchParams()
  const updateSearchParams = usePersistentSearchParams()
  const search = searchParams.get('q') ?? ''
  const statusFilter: 'all' | 'active' | 'inactive' =
    searchParams.get('estado') === 'active'
      ? 'active'
      : searchParams.get('estado') === 'inactive'
        ? 'inactive'
        : 'all'
  const typeParam = searchParams.get('tipo')
  const typeFilter: 'all' | ClientType =
    typeParam === 'residential' ||
    typeParam === 'community' ||
    typeParam === 'hotel' ||
    typeParam === 'business'
      ? typeParam
      : 'all'
  const requestedPage = Number(searchParams.get('pagina') ?? '1')
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage - 1 : 0
  const updateFilters = (updates: SearchParamUpdates) =>
    updateSearchParams({ ...updates, pagina: null })
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
          Només els administradors poden crear o modificar clients.
        </p>
      )}
      <div className="client-toolbar">
        <label className="client-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Cerca clients</span>
          <input
            value={search}
            onChange={(event) => {
              updateFilters({ q: event.target.value })
            }}
            placeholder="Cerca per nom"
          />
        </label>
        <select
          value={statusFilter}
          onChange={(event) => {
            updateFilters({ estado: event.target.value })
          }}
        >
          <option value="all">Tots els estats</option>
          <option value="active">Actius</option>
          <option value="inactive">Inactius</option>
        </select>
        <select
          value={typeFilter}
          onChange={(event) => {
            updateFilters({ tipo: event.target.value })
          }}
        >
          <option value="all">Tots els tipus</option>
          <option value="residential">Particular</option>
          <option value="community">Comunitat</option>
          <option value="hotel">Hotel</option>
          <option value="business">Empresa</option>
        </select>
        <span>{total} clients</span>
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
                  {!client.active && <span className="badge pending">Inactiu</span>}
                </div>
                <p>{client.trade_name || clientTypeLabel(client.client_type)}</p>
              </div>
              <span className="client-type">{clientTypeLabel(client.client_type)}</span>
            </div>
            <div className="client-contact">
              <span className="client-contact-primary">
                <UserRound size={15} aria-hidden="true" />
                {client.contact_name || 'Sense contacte assignat'}
              </span>
              {(client.contact_email || client.contact_phone) && (
                <span className="client-contact-secondary">
                  {client.contact_email && (
                    <span>
                      <Mail size={14} aria-hidden="true" />
                      {client.contact_email}
                    </span>
                  )}
                  {client.contact_phone && (
                    <span>
                      <Phone size={14} aria-hidden="true" />
                      {client.contact_phone}
                    </span>
                  )}
                </span>
              )}
            </div>
            <div className="client-details">
              <span className="client-details-primary">
                <Building2 size={15} aria-hidden="true" />
                {client.installations.length}{' '}
                {client.installations.length === 1 ? 'instal·lació' : 'instal·lacions'}
              </span>
              <span className="client-details-secondary">
                Cobrament {paymentLabel(client.payment_method)} · {client.payment_terms_days} dies
              </span>
            </div>
            <div className="client-card-actions">
              <Button
                className="icon-action"
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Veure la fitxa de ${client.legal_name}`}
                onClick={() => setSelectedClient(client)}
              >
                <Eye size={16} aria-hidden="true" />
              </Button>
            </div>
          </article>
        ))}
      </div>
      {visibleClients.length === 0 && (
        <div className="empty-results">
          <Users size={25} aria-hidden="true" />
          <p>No hi ha clients que coincideixin amb la cerca.</p>
        </div>
      )}
      <nav className="pagination" aria-label="Paginació de clients">
        <Button
          type="button"
          variant="outline"
          disabled={page === 0}
          onClick={() => updateSearchParams({ pagina: page > 1 ? page : null })}
        >
          Anterior
        </Button>
        <span>
          Pàgina {page + 1} de {pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={page + 1 >= pageCount}
          onClick={() => updateSearchParams({ pagina: page + 2 })}
        >
          Següent
        </Button>
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
          onDeleteClient={async () => {
            if (await onDeleteClient(selectedClient)) setSelectedClient(null)
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
  ({ residential: 'Particular', community: 'Comunitat', hotel: 'Hotel', business: 'Empresa' })[type]
const paymentLabel = (method: string | null) =>
  ({ direct_debit: 'domiciliat', transfer: 'per transferència', card: 'amb targeta' })[
    method ?? ''
  ] ?? 'sense definir'
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
      title={client ? 'Edita el client' : 'Client nou'}
      description="Els camps amb asterisc són obligatoris."
      onClose={onClose}
      className="client-form-modal"
    >
      <form className="record-form" onSubmit={submit}>
        <h3>Dades generals</h3>
        <div className="form-grid">
          <Field label="Raó social" required>
            <input
              required
              value={form.legal_name}
              onChange={(e) => update('legal_name', e.target.value)}
            />
          </Field>
          <Field label="Nom comercial">
            <input
              value={form.trade_name ?? ''}
              onChange={(e) => update('trade_name', e.target.value)}
            />
          </Field>
          <Field label="Tipus de client">
            <select
              value={form.client_type}
              onChange={(e) => update('client_type', e.target.value as ClientType)}
            >
              <option value="residential">Particular</option>
              <option value="community">Comunitat</option>
              <option value="hotel">Hotel</option>
              <option value="business">Empresa</option>
            </select>
          </Field>
          <Field label="CIF / NIF">
            <input value={form.tax_id ?? ''} onChange={(e) => update('tax_id', e.target.value)} />
          </Field>
        </div>
        <h3>Contacte i facturació</h3>
        <div className="form-grid">
          <Field label="Persona de contacte">
            <input
              value={form.contact_name ?? ''}
              onChange={(e) => update('contact_name', e.target.value)}
            />
          </Field>
          <Field label="Càrrec">
            <input
              value={form.contact_role ?? ''}
              onChange={(e) => update('contact_role', e.target.value)}
            />
          </Field>
          <Field label="Adreça electrònica de contacte">
            <input
              type="email"
              value={form.contact_email ?? ''}
              onChange={(e) => update('contact_email', e.target.value)}
            />
          </Field>
          <Field label="Telèfon de contacte">
            <input
              type="tel"
              value={form.contact_phone ?? ''}
              onChange={(e) => update('contact_phone', e.target.value)}
            />
          </Field>
          <Field label="Adreça electrònica de facturació">
            <input
              type="email"
              value={form.billing_email ?? ''}
              onChange={(e) => update('billing_email', e.target.value)}
            />
          </Field>
          <Field label="Telèfon general">
            <input
              type="tel"
              value={form.phone ?? ''}
              onChange={(e) => update('phone', e.target.value)}
            />
          </Field>
          <Field label="Freqüència de cobrament">
            <select
              value={form.billing_frequency}
              onChange={(e) => update('billing_frequency', e.target.value as BillingFrequency)}
            >
              <option value="monthly">Mensual</option>
              <option value="quarterly">Trimestral</option>
              <option value="per_visit">Per visita</option>
            </select>
          </Field>
          <Field label="Termini de pagament (dies)">
            <input
              type="number"
              min="0"
              max="120"
              value={form.payment_terms_days}
              onChange={(e) => update('payment_terms_days', Number(e.target.value))}
            />
          </Field>
          <Field label="Mètode de pagament">
            <select
              value={form.payment_method ?? ''}
              onChange={(e) => update('payment_method', e.target.value || null)}
            >
              <option value="">Sense definir</option>
              <option value="direct_debit">Domiciliació</option>
              <option value="transfer">Transferència</option>
              <option value="card">Targeta</option>
            </select>
          </Field>
          <Field label="Adreça de facturació" className="form-span-2">
            <input
              value={form.billing_address ?? ''}
              onChange={(e) => update('billing_address', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Notes internes">
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
          Client actiu
        </label>
        <DialogFooter className="modal-foot">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel·la
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "S'està desant…" : client ? 'Desa els canvis' : 'Crea el client'}
          </Button>
        </DialogFooter>
      </form>
    </Modal>
  )
}

function ClientDetail({
  client,
  isAdmin,
  onClose,
  onEditClient,
  onDeleteClient,
  onNewInstallation,
  onEditInstallation,
  onDeleteInstallation,
}: {
  client: Client
  isAdmin: boolean
  onClose: () => void
  onEditClient: () => void
  onDeleteClient: () => Promise<void>
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
            <h3>Contacte</h3>
            {isAdmin && (
              <div className="client-detail-actions">
                <Button className="action-link" type="button" variant="ghost" size="sm" onClick={onEditClient}>
                  <Pencil size={15} aria-hidden="true" />
                  Edita el client
                </Button>
                <Button
                  className="icon-action destructive"
                  type="button"
                  variant="destructive"
                  size="icon-sm"
                  aria-label={`Elimina ${client.legal_name}`}
                  onClick={() => void onDeleteClient()}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>
          <div className="detail-list">
            <p>
              <UserRound size={16} />
              {client.contact_name || 'Sense persona de contacte'}
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
            <h3>Instal·lacions</h3>
            {isAdmin && (
              <Button className="action-link" type="button" variant="ghost" size="sm" onClick={onNewInstallation}>
                <Plus size={15} />
                Afegeix
              </Button>
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
                    <Button
                      className="icon-action"
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edita ${installation.name}`}
                      onClick={() => onEditInstallation(installation)}
                    >
                      <Pencil size={15} />
                    </Button>
                    <Button
                      className="icon-action destructive"
                      type="button"
                      variant="destructive"
                      size="icon-sm"
                      aria-label={`Elimina ${installation.name}`}
                      onClick={() => void onDeleteInstallation(installation)}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {client.installations.length === 0 && (
              <p className="empty-installations">No hi ha instal·lacions registrades.</p>
            )}
          </div>
        </div>
        <div className="sheet-section compact">
          <h3>Facturació</h3>
          <p>
            {paymentLabel(client.payment_method)} ·{' '}
            {client.billing_frequency === 'per_visit'
              ? 'Per visita'
              : client.billing_frequency === 'quarterly'
                ? 'Trimestral'
                : 'Mensual'}{' '}
            · pagament a {client.payment_terms_days} dies
          </p>
          {isAdmin && (
            <Link className="client-invoices-link" href={`/facturacion?cliente=${client.id}`}>
              Veure les factures d'aquest client
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
        <h3>Control horari</h3>
        <span>Només administració</span>
      </div>
      <p className="time-tracking-intro">
        Inicis registrats amb l'hora oficial del servidor i el punt comunicat pel dispositiu.
      </p>
      {loading && <p className="time-tracking-empty">S'estan carregant els registres…</p>}
      {error && (
        <p className="time-tracking-error">No s'ha pogut carregar el control horari: {error}</p>
      )}
      {!loading && !error && startedLogs.length === 0 && (
        <p className="time-tracking-empty">
          Encara no hi ha inicis de visita amb la ubicació registrada.
        </p>
      )}
      <div className="time-tracking-list">
        {startedLogs.map(({ visit, intervention }) => (
          <article className="time-tracking-entry" key={visit.id}>
            <div className="time-tracking-entry-head">
              <div>
                <strong>{formatDateTimeWithSeconds(new Date(intervention.started_at!))}</strong>
                <span>
                  {visit.installations?.name ?? 'Instal·lació'} · prevista{' '}
                  {formatDateTime(new Date(visit.scheduled_for))}
                </span>
              </div>
              <span className="time-tracking-accuracy">
                Precisió {Math.round(Number(intervention.start_location_accuracy_m ?? 0))} m
              </span>
            </div>
            <VisitStartMap
              latitude={Number(intervention.start_latitude)}
              longitude={Number(intervention.start_longitude)}
              installationName={visit.installations?.name ?? 'Instal·lació'}
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
      <Button type="button" variant="outline" size="sm" onClick={() => setMapOpen((open) => !open)}>
        <MapPin size={15} aria-hidden="true" />{' '}
        {mapOpen ? 'Amaga el mapa' : 'Veure el punt al mapa'}
      </Button>
      {mapOpen && (
        <>
          <iframe
            title={`Punt d'inici de ${installationName}`}
            src={mapUrl}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <a href={mapLink} target="_blank" rel="noreferrer">
            Obre el mapa complet
          </a>
        </>
      )}
    </div>
  )
}

function formatDateTimeWithSeconds(value: Date) {
  return new Intl.DateTimeFormat('ca-ES', {
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
      setLocationError('Aquest dispositiu no permet obtenir la ubicació.')
      return
    }
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        update('location_latitude', Number(position.coords.latitude.toFixed(6)))
        update('location_longitude', Number(position.coords.longitude.toFixed(6)))
      },
      () => setLocationError("No s'ha pogut obtenir la ubicació de la instal·lació."),
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
      title={installation ? 'Edita la instal·lació' : 'Instal·lació nova'}
      description={`Client: ${clientName}`}
      onClose={onClose}
    >
      <form className="record-form" onSubmit={submit}>
        <div className="form-grid">
          <Field label="Nom" required>
            <input required value={form.name} onChange={(e) => update('name', e.target.value)} />
          </Field>
          <Field label="Tipus de piscina">
            <input
              value={form.pool_type ?? ''}
              onChange={(e) => update('pool_type', e.target.value)}
              placeholder="P. ex. comunitària"
            />
          </Field>
          <Field label="Adreça" required className="form-span-2">
            <input
              required
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Instruccions per a la visita">
          <textarea
            rows={3}
            value={form.instructions ?? ''}
            onChange={(e) => update('instructions', e.target.value)}
          />
        </Field>
        <div className="installation-location-fields">
          <div className="sheet-heading">
            <div>
              <h3>Ubicació de la instal·lació</h3>
              <p>Opcional. Activa la comprovació de distància en iniciar una visita.</p>
            </div>
            <Button variant="outline" size="sm" type="button" onClick={setCurrentLocation}>
              <MapPin size={15} aria-hidden="true" /> Fes servir la meva ubicació
            </Button>
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
        <Field label="Notes internes">
          <textarea
            rows={3}
            value={form.notes ?? ''}
            onChange={(e) => update('notes', e.target.value)}
          />
        </Field>
        <DialogFooter className="modal-foot">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel·la
          </Button>
          <Button type="submit" disabled={saving}>
            {saving
              ? "S'està desant…"
              : installation
                ? 'Desa els canvis'
                : 'Afegeix la instal·lació'}
          </Button>
        </DialogFooter>
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
  className,
}: {
  title: string
  description: string
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={`modal client-modal max-h-[calc(100dvh-2rem)] max-w-[min(760px,calc(100vw-2rem))] ${className ?? ''}`}
      >
        <DialogHeader className="modal-title pr-10">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
function AuthScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validationError = validateAuthInput({ email, password })
    if (validationError) {
      setFeedback({ kind: 'error', text: validationError })
      return
    }

    setIsSubmitting(true)
    setFeedback(null)
    const supabase = createClient()
    const result = await supabase.auth.signInWithPassword({ email: email.trim(), password })

    setIsSubmitting(false)
    if (result.error) {
      setFeedback({ kind: 'error', text: result.error.message })
      return
    }

    setFeedback({ kind: 'success', text: "Sessió iniciada. S'està carregant el tauler…" })
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
          <span className="auth-kicker">Gestió del manteniment</span>
          <h1>Tot el control de les teves piscines, en un sol lloc.</h1>
          <p>
            Centralitza visites, clients i facturació amb dades protegides i sempre actualitzades.
          </p>
        </div>
        <ul className="auth-benefits">
          <li>
            <CheckCircle2 size={18} aria-hidden="true" />
            Agenda i informes de treball
          </li>
          <li>
            <CheckCircle2 size={18} aria-hidden="true" />
            Clients i instal·lacions connectats
          </li>
          <li>
            <CheckCircle2 size={18} aria-hidden="true" />
            Facturació i cobraments al dia
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
              Àrea privada
            </span>
            <h2>Benvingut de nou</h2>
            <p>Accedeix per continuar amb la teva operativa diària.</p>
          </div>
          <form className="auth-form" onSubmit={submit} noValidate>
            <label className="auth-field">
              <span>Adreça electrònica</span>
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
              <span>Contrasenya</span>
              <div className="auth-input">
                <LockKeyhole size={18} aria-hidden="true" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="Mínim 8 caràcters"
                />
                <Button
                  className="auth-password-toggle"
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Amaga la contrasenya' : 'Mostra la contrasenya'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </Button>
              </div>
            </label>
            {feedback && (
              <p
                className={`auth-feedback ${feedback.kind}`}
                role={feedback.kind === 'error' ? 'alert' : 'status'}
              >
                {feedback.text}
              </p>
            )}
            <Button className="auth-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "S'està comprovant…" : 'Entra al tauler'}
              <ArrowRight size={18} aria-hidden="true" />
            </Button>
          </form>
          <p className="auth-switch">
            Accés exclusiu per invitació. Si encara no tens compte, contacta amb l'administració.
          </p>
        </div>
      </section>
    </main>
  )
}
