'use client'

import { ArrowLeft, CheckCircle2, Clock3, MapPin, PackagePlus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { findProducts } from '@/lib/product-search'
import { createClient } from '@/lib/supabase/client'
import { buildVisitNotes, parseVisitNotes, standardVisitChecks } from '@/lib/visit-checklist'
import { getInitialVisitReportState } from '@/lib/visit-report-state'
import { validateVisitCompletion, type ProductUsageInput } from '@/lib/visit-validation'

type Product = {
  id: string
  name: string
  reference: string | null
  unit: string
  stock_quantity: number
}

type ExistingConsumption = {
  id: string
  product_id: string
  quantity: number
  unit_price: number
  products: { name: string; unit: string } | null
}

type VisitDetail = {
  id: string
  status: string
  scheduled_for: string
  planning_notes: string | null
  installations: {
    name: string
    address: string
    instructions: string | null
    clients: { legal_name: string } | null
  } | null
  technician: { full_name: string } | null
  interventions: {
    id: string
    started_at: string | null
    completed_at: string | null
    notes: string | null
    start_latitude: number | null
    start_longitude: number | null
    start_location_accuracy_m: number | null
    start_location_recorded_at: string | null
    intervention_products: ExistingConsumption[]
  } | null
}

const money = new Intl.NumberFormat('ca-ES', { style: 'currency', currency: 'EUR' })
const quantityFormat = new Intl.NumberFormat('ca-ES', { maximumFractionDigits: 3 })

export function VisitReport({
  visitId,
  readOnly = false,
  isAdmin = false,
}: {
  visitId: string
  readOnly?: boolean
  isAdmin?: boolean
}) {
  const router = useRouter()
  const [visit, setVisit] = useState<VisitDetail | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [notes, setNotes] = useState('')
  const [completedCheckIds, setCompletedCheckIds] = useState<string[]>([])
  const [usages, setUsages] = useState<ProductUsageInput[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const interventionFields = isAdmin
      ? 'id,started_at,completed_at,notes,start_latitude,start_longitude,start_location_accuracy_m,start_location_recorded_at,intervention_products(id,product_id,quantity,unit_price,products(name,unit))'
      : 'id,started_at,completed_at,notes,intervention_products(id,product_id,quantity,unit_price,products(name,unit))'
    const [visitResult, productsResult] = await Promise.all([
      supabase
        .from('visits')
        .select(
          `id,status,scheduled_for,planning_notes,technician:profiles!visits_technician_id_fkey(full_name),installations(name,address,instructions,clients(legal_name)),interventions(${interventionFields})`,
        )
        .eq('id', visitId)
        .maybeSingle(),
      supabase
        .from('products')
        .select('id,name,reference,unit,stock_quantity')
        .gt('stock_quantity', 0)
        .order('name'),
    ])

    const loadError = visitResult.error || productsResult.error
    if (loadError) {
      setError(loadError.message)
    } else if (!visitResult.data) {
      setError('No tens accés a aquesta visita o ja no existeix.')
    } else {
      const detail = visitResult.data as unknown as VisitDetail
      const initialReportState = getInitialVisitReportState(detail.interventions)
      setVisit(detail)
      setProducts((productsResult.data ?? []) as Product[])
      setNotes(initialReportState.notes)
      setUsages(initialReportState.usages)
    }
    setLoading(false)
  }, [isAdmin, visitId])

  useEffect(() => {
    void load()
  }, [load])

  const selectedProductIds = new Set(usages.map((usage) => usage.productId))
  const availableProducts = products.filter((product) => !selectedProductIds.has(product.id))
  const matchingProducts = useMemo(
    () => findProducts(availableProducts, productSearch),
    [availableProducts, productSearch],
  )
  const intervention = visit?.interventions
  const isClosed = visit?.status === 'completed'

  function addProduct(productId: string) {
    const product = availableProducts.find((item) => item.id === productId)
    if (product) setUsages((current) => [...current, { productId: product.id, quantity: 1 }])
    setProductSearch('')
  }

  function updateUsage(index: number, patch: Partial<ProductUsageInput>) {
    setUsages((current) =>
      current.map((usage, itemIndex) => (itemIndex === index ? { ...usage, ...patch } : usage)),
    )
  }

  function removeUsage(index: number) {
    setUsages((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  function toggleCheck(checkId: string) {
    setCompletedCheckIds((current) =>
      current.includes(checkId) ? current.filter((id) => id !== checkId) : [...current, checkId],
    )
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const visitNotes = buildVisitNotes(notes, completedCheckIds)
    const validation = validateVisitCompletion(
      visitNotes,
      usages,
      products.map((product) => ({
        id: product.id,
        stockQuantity: Number(product.stock_quantity),
      })),
    )
    if (validation) {
      setError(validation)
      return
    }

    setSaving(true)
    setError(null)
    const { error: completionError } = await createClient().rpc('complete_visit', {
      p_visit_id: visitId,
      p_notes: visitNotes,
      p_products: usages.map((usage) => ({
        product_id: usage.productId,
        quantity: usage.quantity,
      })),
    })
    setSaving(false)

    if (completionError) {
      setError(completionError.message)
      return
    }
    router.replace('/agenda')
    router.refresh()
  }

  if (loading) return <div className="report-loading">S'està carregant l'informe…</div>
  if (!visit || !intervention)
    return <div className="report-loading">{error ?? "No s'ha trobat l'informe."}</div>

  const installation = visit.installations
  return (
    <section className="report-page">
      <Link className="back-link" href="/agenda">
        <ArrowLeft size={17} /> Torna a l'agenda
      </Link>
      <div className="report-heading">
        <div>
          <span className="eyebrow">Informe de visita</span>
          <h2>{installation?.clients?.legal_name ?? 'Client'}</h2>
          <p>
            {installation?.name ?? 'Instal·lació'} · {installation?.address ?? 'Sense adreça'}
          </p>
        </div>
        <div className="report-started">
          <Clock3 size={17} />
          <span>Iniciada</span>
          <strong>
            {new Intl.DateTimeFormat('ca-ES', { hour: '2-digit', minute: '2-digit' }).format(
              new Date(intervention.started_at ?? visit.scheduled_for),
            )}
          </strong>
        </div>
      </div>

      {installation?.instructions && (
        <aside className="visit-instructions">
          <strong>Indicacions d'accés</strong>
          <p>{installation.instructions}</p>
        </aside>
      )}
      {visit.planning_notes && (
        <aside className="visit-instructions visit-planning-notes">
          <strong>Notes de planificació</strong>
          <p>{visit.planning_notes}</p>
        </aside>
      )}
      {error && (
        <p className="report-error" role="alert">
          {error}
        </p>
      )}

      {isClosed ? (
        <ClosedReport
          notes={intervention.notes}
          usages={intervention.intervention_products}
          technicianName={visit.technician?.full_name ?? null}
          startedAt={intervention.started_at}
          completedAt={intervention.completed_at}
          isAdmin={isAdmin}
          startLatitude={intervention.start_latitude}
          startLongitude={intervention.start_longitude}
          startAccuracy={intervention.start_location_accuracy_m}
          startLocationRecordedAt={intervention.start_location_recorded_at}
          installationName={installation?.name ?? 'Instal·lació'}
        />
      ) : readOnly ? (
        <section className="closed-report">
          <Clock3 size={22} />
          <div>
            <h3>Visita en curs</h3>
            <p>L'informe estarà disponible per supervisar-lo quan el tècnic tanqui la feina.</p>
          </div>
        </section>
      ) : (
        <form className="report-form" onSubmit={submit}>
          <fieldset className="visit-checklist">
            <legend>Feines realitzades</legend>
            <p>Marca només les feines que has fet en aquesta visita.</p>
            <div className="visit-checklist-options">
              {standardVisitChecks.map((check) => (
                <label
                  className={
                    completedCheckIds.includes(check.id) ? 'visit-check checked' : 'visit-check'
                  }
                  key={check.id}
                >
                  <input
                    type="checkbox"
                    checked={completedCheckIds.includes(check.id)}
                    onChange={() => toggleCheck(check.id)}
                  />
                  <span>{check.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="report-field">
            <span>
              Notes o incidències <em>Opcional</em>
            </span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="P. ex.: He detectat una avaria o l'aigua estava tèrbola."
              rows={3}
            />
          </label>

          <section className="report-products">
            <div className="section-heading">
              <div>
                <h3>Productes utilitzats</h3>
                <p>Afegeix només el material utilitzat durant aquesta visita.</p>
              </div>
            </div>
            <div className="product-picker">
              <label className="product-search">
                <span>Cerca un producte</span>
                <input
                  type="search"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    if (matchingProducts.length === 1) addProduct(matchingProducts[0].id)
                  }}
                  disabled={!availableProducts.length}
                  placeholder="Nom o referència…"
                />
              </label>
            </div>
            {productSearch.trim() && (
              <ul className="product-search-results" aria-label="Resultats de productes">
                {matchingProducts.length ? (
                  matchingProducts.map((product) => (
                    <li key={product.id}>
                      <button type="button" onClick={() => addProduct(product.id)}>
                        <span>
                          <strong>{product.name}</strong>
                          <small>{product.reference ?? 'Sense referència'}</small>
                        </span>
                        <em>
                          {quantityFormat.format(product.stock_quantity)} {product.unit}
                        </em>
                        <PackagePlus size={17} aria-hidden="true" />
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="product-search-empty">
                    No hi ha coincidències entre els materials amb estoc.
                  </li>
                )}
              </ul>
            )}
            {usages.length ? (
              <div className="usage-list">
                {usages.map((usage, index) => {
                  const product = products.find((item) => item.id === usage.productId)
                  return (
                    <div className="usage-row" key={usage.productId}>
                      <div className="usage-product">
                        <strong>{product?.name ?? 'Producte no disponible'}</strong>
                        <span>
                          {product
                            ? `${quantityFormat.format(product.stock_quantity)} ${product.unit} disponibles`
                            : 'Producte no disponible'}
                        </span>
                      </div>
                      <label className="usage-quantity">
                        <span>Quantitat {product && <small>en {product.unit}</small>}</span>
                        <input
                          type="number"
                          min="0.001"
                          step="0.001"
                          inputMode="decimal"
                          value={usage.quantity}
                          onChange={(event) =>
                            updateUsage(index, { quantity: Number(event.target.value) })
                          }
                        />
                      </label>
                      <button
                        className="usage-delete"
                        type="button"
                        onClick={() => removeUsage(index)}
                        aria-label={`Elimina ${product?.name ?? 'producte'}`}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="products-empty">
                Sense productes afegits. Si la feina està inclosa a la quota, pots tancar la visita
                directament.
              </p>
            )}
          </section>

          <div className="report-actions">
            <Link className="button secondary" href="/agenda">
              Torna sense desar
            </Link>
            <button className="button accent" type="submit" disabled={saving}>
              {saving ? (
                "S'està desant…"
              ) : (
                <>
                  <CheckCircle2 size={17} /> Tanca la visita
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

function ClosedReport({
  notes,
  usages,
  technicianName,
  startedAt,
  completedAt,
  isAdmin,
  startLatitude,
  startLongitude,
  startAccuracy,
  startLocationRecordedAt,
  installationName,
}: {
  notes: string | null
  usages: ExistingConsumption[]
  technicianName: string | null
  startedAt: string | null
  completedAt: string | null
  isAdmin: boolean
  startLatitude: number | null
  startLongitude: number | null
  startAccuracy: number | null
  startLocationRecordedAt: string | null
  installationName: string
}) {
  const { completedCheckIds, details } = parseVisitNotes(notes)
  const completedChecks = standardVisitChecks.filter((check) =>
    completedCheckIds.includes(check.id),
  )
  const latitude = Number(startLatitude)
  const longitude = Number(startLongitude)
  const hasStartLocation =
    startLatitude !== null &&
    startLongitude !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  const mapUrl = hasStartLocation
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - 0.004}%2C${latitude - 0.004}%2C${longitude + 0.004}%2C${latitude + 0.004}&layer=mapnik&marker=${latitude}%2C${longitude}`
    : null
  const mapLink = hasStartLocation
    ? `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`
    : null

  return (
    <section className="closed-report is-complete">
      <header className="closed-report-heading">
        <CheckCircle2 size={24} aria-hidden="true" />
        <div>
          <span className="eyebrow">Visita finalitzada</span>
          <h3>Informe tancat</h3>
          <p>
            Tancat per <strong>{technicianName ?? 'Tècnic no disponible'}</strong>
          </p>
        </div>
      </header>

      <dl className="closed-report-summary">
        <div>
          <dt>Inici</dt>
          <dd>{startedAt ? formatDateTime(new Date(startedAt)) : 'No registrat'}</dd>
        </div>
        <div>
          <dt>Final</dt>
          <dd>{completedAt ? formatDateTime(new Date(completedAt)) : 'No registrat'}</dd>
        </div>
        <div>
          <dt>Durada</dt>
          <dd>{formatDuration(startedAt, completedAt) ?? 'No disponible'}</dd>
        </div>
      </dl>

      <section className="closed-report-section">
        <h4>Feines realitzades</h4>
        {completedChecks.length ? (
          <ul className="closed-report-checks">
            {completedChecks.map((check) => (
              <li key={check.id}>
                <CheckCircle2 size={16} aria-hidden="true" /> {check.label}
              </li>
            ))}
          </ul>
        ) : (
          <p>No s'han marcat feines en aquest informe.</p>
        )}
      </section>

      {details && (
        <section className="closed-report-section">
          <h4>Notes i incidències</h4>
          <p>{details}</p>
        </section>
      )}

      <section className="closed-report-section">
        <h4>Productes utilitzats</h4>
        {usages.length ? (
          <ul className="closed-report-products">
            {usages.map((usage) => (
              <li key={usage.id}>
                <span>
                  {quantityFormat.format(Number(usage.quantity))} {usage.products?.unit} de{' '}
                  {usage.products?.name}
                </span>
                <strong>{money.format(Number(usage.quantity) * Number(usage.unit_price))}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p>Sense productes addicionals facturables.</p>
        )}
      </section>

      {isAdmin && hasStartLocation && mapUrl && mapLink && (
        <section className="closed-report-section closed-report-location">
          <div className="closed-report-location-heading">
            <div>
              <h4>
                <MapPin size={17} aria-hidden="true" /> Inici registrat
              </h4>
              <p>
                {startLocationRecordedAt
                  ? `Registrat el ${formatDateTime(new Date(startLocationRecordedAt))}`
                  : 'Ubicació comunicada pel dispositiu'}
                {startAccuracy !== null &&
                  ` · Precisió aproximada de ${Math.round(Number(startAccuracy))} m`}
              </p>
            </div>
            <span>Només administració</span>
          </div>
          <iframe
            title={`Punt d'inici de ${installationName}`}
            src={mapUrl}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <a href={mapLink} target="_blank" rel="noreferrer">
            Obre el mapa complet
          </a>
        </section>
      )}
    </section>
  )
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat('ca-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

function formatDuration(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) return null
  const durationInMinutes = Math.round(
    (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 60000,
  )
  if (!Number.isFinite(durationInMinutes) || durationInMinutes < 0) return null
  if (durationInMinutes < 60) return `${durationInMinutes} min`

  const hours = Math.floor(durationInMinutes / 60)
  const minutes = durationInMinutes % 60
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`
}
