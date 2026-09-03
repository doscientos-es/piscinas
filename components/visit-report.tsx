'use client'

import { ArrowLeft, CheckCircle2, Clock3, PackagePlus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { buildVisitNotes, standardVisitChecks } from '@/lib/visit-checklist'
import { getInitialVisitReportState } from '@/lib/visit-report-state'
import { validateVisitCompletion, type ProductUsageInput } from '@/lib/visit-validation'

type Product = {
  id: string
  name: string
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
    intervention_products: ExistingConsumption[]
  } | null
}

const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
const quantityFormat = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 })

export function VisitReport({
  visitId,
  readOnly = false,
}: {
  visitId: string
  readOnly?: boolean
}) {
  const router = useRouter()
  const [visit, setVisit] = useState<VisitDetail | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [notes, setNotes] = useState('')
  const [completedCheckIds, setCompletedCheckIds] = useState<string[]>([])
  const [usages, setUsages] = useState<ProductUsageInput[]>([])
  const [productToAdd, setProductToAdd] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [visitResult, productsResult] = await Promise.all([
      supabase
        .from('visits')
        .select(
          'id,status,scheduled_for,technician:profiles!visits_technician_id_fkey(full_name),installations(name,address,instructions,clients(legal_name)),interventions(id,started_at,completed_at,notes,intervention_products(id,product_id,quantity,unit_price,products(name,unit)))',
        )
        .eq('id', visitId)
        .maybeSingle(),
      supabase
        .from('products')
        .select('id,name,unit,stock_quantity')
        .gt('stock_quantity', 0)
        .order('name'),
    ])

    const loadError = visitResult.error || productsResult.error
    if (loadError) {
      setError(loadError.message)
    } else if (!visitResult.data) {
      setError('No tienes acceso a esta visita o ya no existe.')
    } else {
      const detail = visitResult.data as unknown as VisitDetail
      const initialReportState = getInitialVisitReportState(detail.interventions)
      setVisit(detail)
      setProducts((productsResult.data ?? []) as Product[])
      setNotes(initialReportState.notes)
      setUsages(initialReportState.usages)
    }
    setLoading(false)
  }, [visitId])

  useEffect(() => {
    void load()
  }, [load])

  const selectedProductIds = new Set(usages.map((usage) => usage.productId))
  const availableProducts = products.filter((product) => !selectedProductIds.has(product.id))
  const intervention = visit?.interventions
  const isClosed = visit?.status === 'completed'

  function addProduct() {
    const product = availableProducts.find((item) => item.id === productToAdd)
    if (product) setUsages((current) => [...current, { productId: product.id, quantity: 1 }])
    setProductToAdd('')
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

  if (loading) return <div className="report-loading">Cargando el parte…</div>
  if (!visit || !intervention)
    return <div className="report-loading">{error ?? 'No se ha encontrado el parte.'}</div>

  const installation = visit.installations
  return (
    <section className="report-page">
      <Link className="back-link" href="/agenda">
        <ArrowLeft size={17} /> Volver a la agenda
      </Link>
      <div className="report-heading">
        <div>
          <span className="eyebrow">Parte de visita</span>
          <h2>{installation?.clients?.legal_name ?? 'Cliente'}</h2>
          <p>
            {installation?.name ?? 'Instalación'} · {installation?.address ?? 'Sin dirección'}
          </p>
        </div>
        <div className="report-started">
          <Clock3 size={17} />
          <span>Iniciada</span>
          <strong>
            {new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(
              new Date(intervention.started_at ?? visit.scheduled_for),
            )}
          </strong>
        </div>
      </div>

      {installation?.instructions && (
        <aside className="visit-instructions">
          <strong>Indicaciones de acceso</strong>
          <p>{installation.instructions}</p>
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
          completedAt={intervention.completed_at}
        />
      ) : readOnly ? (
        <section className="closed-report">
          <Clock3 size={22} />
          <div>
            <h3>Visita en curso</h3>
            <p>El parte estará disponible para supervisión cuando el técnico cierre la faena.</p>
          </div>
        </section>
      ) : (
        <form className="report-form" onSubmit={submit}>
          <fieldset className="visit-checklist">
            <legend>Tareas realizadas</legend>
            <p>Marca solo las tareas que has hecho en esta visita.</p>
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
              Notas o incidencias <em>Opcional</em>
            </span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Ej.: He detectado una avería o el agua estaba turbia."
              rows={3}
            />
          </label>

          <section className="report-products">
            <div className="section-heading">
              <div>
                <h3>Productos usados</h3>
                <p>Añade solo el material usado durante esta visita.</p>
              </div>
            </div>
            <div className="product-picker">
              <label>
                <span className="sr-only">Producto usado</span>
                <select
                  aria-label="Selecciona el producto usado"
                  value={productToAdd}
                  onChange={(event) => setProductToAdd(event.target.value)}
                  disabled={!availableProducts.length}
                >
                  <option value="">Selecciona un producto…</option>
                  {availableProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} · {quantityFormat.format(product.stock_quantity)}{' '}
                      {product.unit} disponibles
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button secondary product-add"
                type="button"
                onClick={addProduct}
                disabled={!productToAdd}
              >
                <PackagePlus size={17} /> Añadir
              </button>
            </div>
            {usages.length ? (
              <div className="usage-list">
                {usages.map((usage, index) => {
                  const product = products.find((item) => item.id === usage.productId)
                  return (
                    <div className="usage-row" key={usage.productId}>
                      <div className="usage-product">
                        <strong>{product?.name ?? 'Producto no disponible'}</strong>
                        <span>
                          {product
                            ? `${quantityFormat.format(product.stock_quantity)} ${product.unit} disponibles`
                            : 'Producto no disponible'}
                        </span>
                      </div>
                      <label className="usage-quantity">
                        <span>Cantidad {product && <small>en {product.unit}</small>}</span>
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
                        aria-label={`Eliminar ${product?.name ?? 'producto'}`}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="products-empty">
                Sin productos añadidos. Si el trabajo está incluido en la cuota, puedes cerrar la
                visita directamente.
              </p>
            )}
          </section>

          <div className="report-actions">
            <Link className="button secondary" href="/agenda">
              Volver sin guardar
            </Link>
            <button className="button accent" type="submit" disabled={saving}>
              {saving ? (
                'Guardando…'
              ) : (
                <>
                  <CheckCircle2 size={17} /> Cerrar visita
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
  completedAt,
}: {
  notes: string | null
  usages: ExistingConsumption[]
  technicianName: string | null
  completedAt: string | null
}) {
  return (
    <section className="closed-report">
      <CheckCircle2 size={22} />
      <div>
        <h3>Parte cerrado</h3>
        <p>
          Cerrado por <strong>{technicianName ?? 'Técnico no disponible'}</strong>
          {completedAt && (
            <>
              {' '}
              el <strong>{formatDateTime(new Date(completedAt))}</strong>
            </>
          )}
        </p>
        <p>{notes}</p>
        {usages.length ? (
          <ul>
            {usages.map((usage) => (
              <li key={usage.id}>
                {quantityFormat.format(Number(usage.quantity))} {usage.products?.unit} de{' '}
                {usage.products?.name} ·{' '}
                {money.format(Number(usage.quantity) * Number(usage.unit_price))}
              </li>
            ))}
          </ul>
        ) : (
          <p>Sin productos adicionales facturables.</p>
        )}
      </div>
    </section>
  )
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}
