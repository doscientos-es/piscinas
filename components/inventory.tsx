'use client'

import { History, PackagePlus, Pencil, Trash2, X } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { usePersistentSearchParams } from '@/lib/use-persistent-search-params'

export type Product = {
  id: string
  name: string
  reference: string | null
  category: string | null
  unit: string
  sale_price: number
  cost_price: number | null
  stock_quantity: number
  minimum_stock: number
  active: boolean
}

type Movement = {
  id: string
  product_id: string
  movement_type: 'opening' | 'entry' | 'adjustment' | 'consumption'
  quantity: number
  note: string | null
  occurred_at: string
}

type ProductInput = Omit<Product, 'id'>

const currency = new Intl.NumberFormat('ca-ES', { style: 'currency', currency: 'EUR' })
const emptyProduct: ProductInput = {
  name: '',
  reference: null,
  category: null,
  unit: 'kg',
  sale_price: 0,
  cost_price: null,
  stock_quantity: 0,
  minimum_stock: 0,
  active: true,
}
const numeric = (value: string) => Number(value.replace(',', '.'))
const optionalText = (value: string) => value.trim() || null

export function Inventory({
  products,
  isAdmin,
  schemaReady,
  onRefresh,
  creationVersion,
}: {
  products: Product[]
  isAdmin: boolean
  schemaReady: boolean
  onRefresh: () => Promise<void>
  creationVersion: number
}) {
  const searchParams = useSearchParams()
  const updateSearchParams = usePersistentSearchParams()
  const query = searchParams.get('q') ?? ''
  const [editing, setEditing] = useState<Product | 'new' | null>(null)
  const [movementProduct, setMovementProduct] = useState<Product | null>(null)
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null)
  const [movements, setMovements] = useState<Movement[]>([])
  const [error, setError] = useState<string | null>(null)
  const creationVersionRef = useRef(creationVersion)
  const visible = useMemo(
    () =>
      products.filter(
        (product) =>
          product.name.toLocaleLowerCase('ca').includes(query.toLocaleLowerCase('ca')) ||
          product.reference?.toLocaleLowerCase('ca').includes(query.toLocaleLowerCase('ca')),
      ),
    [products, query],
  )
  const lowStock = products.filter(
    (product) => product.active && product.stock_quantity <= product.minimum_stock,
  )

  useEffect(() => {
    if (!historyProduct) return
    createClient()
      .from('inventory_movements')
      .select('id,product_id,movement_type,quantity,note,occurred_at')
      .eq('product_id', historyProduct.id)
      .order('occurred_at', { ascending: false })
      .limit(30)
      .then(({ data, error: requestError }) => {
        if (requestError) setError(requestError.message)
        else setMovements((data ?? []) as Movement[])
      })
  }, [historyProduct])

  useEffect(() => {
    if (!isAdmin || creationVersion === creationVersionRef.current) return
    creationVersionRef.current = creationVersion
    setEditing('new')
  }, [creationVersion, isAdmin])

  const remove = async (product: Product) => {
    if (
      !window.confirm(
        `Voleu eliminar «${product.name}»? No es pot eliminar si ja s'ha utilitzat en una visita.`,
      )
    )
      return
    const { error: requestError } = await createClient()
      .from('products')
      .delete()
      .eq('id', product.id)
    if (requestError) setError(requestError.message)
    else await onRefresh()
  }

  return (
    <>
      {error && (
        <p className="access-note" role="alert">
          {error}
        </p>
      )}
      {!schemaReady && (
        <p className="access-note" role="status">
          L'inventari s'activarà en aplicar la migració de Supabase inclosa en el projecte.
        </p>
      )}
      {!isAdmin && (
        <p className="access-note" role="status">
          Només els administradors poden modificar l'inventari.
        </p>
      )}
      <section className="inventory-summary" aria-label="Resum de l'inventari">
        <div>
          <span>Materials actius</span>
          <strong>{products.filter((product) => product.active).length}</strong>
        </div>
        <div>
          <span>Estoc baix</span>
          <strong>{lowStock.length}</strong>
        </div>
        <div>
          <span>Valor de cost</span>
          <strong>
            {currency.format(
              products.reduce(
                (total, product) =>
                  total + product.stock_quantity * Number(product.cost_price ?? 0),
                0,
              ),
            )}
          </strong>
        </div>
      </section>
      <div className="client-toolbar">
        <label className="client-search">
          <span className="sr-only">Cerca materials</span>
          <input
            value={query}
            onChange={(event) => updateSearchParams({ q: event.target.value })}
            placeholder="Cerca per material o referència"
          />
        </label>
        <span>{visible.length} materials</span>
      </div>
      <div className="inventory-list">
        {visible.map((product) => (
          <article
            key={product.id}
            className={`inventory-row ${!product.active ? 'is-inactive' : ''}`}
          >
            <div>
              <strong>{product.name}</strong>
              <span>{product.reference || product.category || 'Sense referència'}</span>
            </div>
            <div>
              <span>Existències</span>
              <strong
                className={product.stock_quantity <= product.minimum_stock ? 'stock-low' : ''}
              >
                {product.stock_quantity} {product.unit}
              </strong>
              <small>
                Mín. {product.minimum_stock} {product.unit}
              </small>
            </div>
            <div>
              <span>Cost / venda</span>
              <strong>
                {currency.format(Number(product.cost_price ?? 0))} /{' '}
                {currency.format(Number(product.sale_price))}
              </strong>
            </div>
            <div className="inventory-actions">
              <button
                className="action-link"
                type="button"
                onClick={() => setHistoryProduct(product)}
              >
                <History size={16} aria-hidden="true" />
                Historial
              </button>
              {isAdmin && (
                <>
                  <button
                    className="action-link"
                    type="button"
                    onClick={() => setMovementProduct(product)}
                  >
                    <PackagePlus size={16} aria-hidden="true" />
                    Ajusta
                  </button>
                  <button
                    className="icon-action"
                    type="button"
                    aria-label={`Edita ${product.name}`}
                    onClick={() => setEditing(product)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-action destructive"
                    type="button"
                    aria-label={`Elimina ${product.name}`}
                    onClick={() => void remove(product)}
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {visible.length === 0 && (
        <div className="empty-results">
          <p>No hi ha materials que coincideixin amb la cerca.</p>
        </div>
      )}
      {editing && (
        <ProductForm
          product={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            const payload = {
              ...input,
              name: input.name.trim(),
              reference: optionalText(input.reference ?? ''),
              category: optionalText(input.category ?? ''),
              cost_price: input.cost_price || null,
            }
            const response =
              editing === 'new'
                ? await createClient().from('products').insert(payload)
                : await createClient().from('products').update(payload).eq('id', editing.id)
            if (response.error) throw new Error(response.error.message)
            await onRefresh()
            setEditing(null)
          }}
        />
      )}
      {movementProduct && (
        <MovementForm
          product={movementProduct}
          onClose={() => setMovementProduct(null)}
          onSave={async (quantity, type, note) => {
            const { error: requestError } = await createClient().rpc('record_inventory_movement', {
              p_product_id: movementProduct.id,
              p_quantity: quantity,
              p_movement_type: type,
              p_note: note,
              p_unit_cost: movementProduct.cost_price,
            })
            if (requestError) throw new Error(requestError.message)
            await onRefresh()
            setMovementProduct(null)
          }}
        />
      )}
      {historyProduct && (
        <HistoryModal
          product={historyProduct}
          movements={movements}
          onClose={() => setHistoryProduct(null)}
        />
      )}
    </>
  )
}

function ProductForm({
  product,
  onClose,
  onSave,
}: {
  product?: Product
  onClose: () => void
  onSave: (input: ProductInput) => Promise<void>
}) {
  const [form, setForm] = useState<ProductInput>(product ?? emptyProduct)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }))
  return (
    <Modal title={product ? 'Edita el material' : 'Material nou'} onClose={onClose}>
      <form
        className="record-form"
        onSubmit={(event) => {
          event.preventDefault()
          setSaving(true)
          setError(null)
          onSave(form)
            .catch((reason: unknown) =>
              setError(reason instanceof Error ? reason.message : 'No s'ha pogut desar.'),
            )
            .finally(() => setSaving(false))
        }}
      >
        <div className="form-grid">
          <label className="field form-span-2">
            <span>Nom</span>
            <input
              required
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              placeholder="P. ex. clor granulat"
            />
          </label>
          <label className="field">
            <span>Referència</span>
            <input
              value={form.reference ?? ''}
              onChange={(event) => set('reference', event.target.value)}
            />
          </label>
          <label className="field">
            <span>Categoria</span>
            <input
              value={form.category ?? ''}
              onChange={(event) => set('category', event.target.value)}
              placeholder="Tractament"
            />
          </label>
          <label className="field">
            <span>Unitat</span>
            <select value={form.unit} onChange={(event) => set('unit', event.target.value)}>
              <option value="kg">kg</option>
              <option value="l">l</option>
              <option value="ud">unitats</option>
              <option value="g">g</option>
            </select>
          </label>
          <label className="field">
            <span>Estoc inicial</span>
            <input
              type="number"
              min="0"
              step="0.001"
              value={form.stock_quantity}
              onChange={(event) => set('stock_quantity', numeric(event.target.value))}
            />
          </label>
          <label className="field">
            <span>Estoc mínim</span>
            <input
              type="number"
              min="0"
              step="0.001"
              value={form.minimum_stock}
              onChange={(event) => set('minimum_stock', numeric(event.target.value))}
            />
          </label>
          <label className="field">
            <span>Cost unitari (€)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.cost_price ?? ''}
              onChange={(event) =>
                set('cost_price', event.target.value ? numeric(event.target.value) : null)
              }
            />
          </label>
          <label className="field">
            <span>Preu de venda (€)</span>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={form.sale_price}
              onChange={(event) => set('sale_price', numeric(event.target.value))}
            />
          </label>
        </div>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(event) => set('active', event.target.checked)}
          />
          Material actiu
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-foot">
          <button className="button secondary" type="button" onClick={onClose}>
            Cancel·la
          </button>
          <button className="button" disabled={saving}>
            {saving ? 'S'està desant…' : 'Desa el material'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function MovementForm({
  product,
  onClose,
  onSave,
}: {
  product: Product
  onClose: () => void
  onSave: (quantity: number, type: 'entry' | 'adjustment', note: string) => Promise<void>
}) {
  const [quantity, setQuantity] = useState('')
  const [type, setType] = useState<'entry' | 'adjustment'>('entry')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal title={`Ajusta · ${product.name}`} onClose={onClose}>
      <form
        className="record-form"
        onSubmit={(event) => {
          event.preventDefault()
          setSaving(true)
          setError(null)
          onSave(numeric(quantity), type, note)
            .catch((reason: unknown) =>
              setError(
                reason instanceof Error ? reason.message : 'No s'ha pogut registrar el moviment.',
              ),
            )
            .finally(() => setSaving(false))
        }}
      >
        <p className="movement-current">
          Estoc actual:{' '}
          <strong>
            {product.stock_quantity} {product.unit}
          </strong>
        </p>
        <div className="form-grid">
          <label className="field">
            <span>Tipus</span>
            <select value={type} onChange={(event) => setType(event.target.value as typeof type)}>
              <option value="entry">Entrada de material</option>
              <option value="adjustment">Ajust d'inventari</option>
            </select>
          </label>
          <label className="field">
            <span>Quantitat {type === 'adjustment' ? '(fes servir − per restar)' : ''}</span>
            <input
              required
              type="number"
              step="0.001"
              min={type === 'entry' ? '0.001' : undefined}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>
          <label className="field form-span-2">
            <span>Nota</span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="P. ex. recepció del proveïdor"
            />
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-foot">
          <button className="button secondary" type="button" onClick={onClose}>
            Cancel·la
          </button>
          <button className="button" disabled={saving}>
            {saving ? 'S'està registrant…' : 'Registra el moviment'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function HistoryModal({
  product,
  movements,
  onClose,
}: {
  product: Product
  movements: Movement[]
  onClose: () => void
}) {
  return (
    <Modal title={`Historial · ${product.name}`} onClose={onClose}>
      <div className="movement-history">
        {movements.length === 0 ? (
          <p>Aquest material encara no té moviments registrats.</p>
        ) : (
          movements.map((movement) => (
            <div key={movement.id}>
              <span>
                {new Intl.DateTimeFormat('ca-ES', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(movement.occurred_at))}
              </span>
              <strong className={movement.quantity < 0 ? 'stock-low' : 'stock-positive'}>
                {movement.quantity > 0 ? '+' : ''}
                {movement.quantity} {product.unit}
              </strong>
              <p>
                {movementLabel(movement.movement_type)}
                {movement.note ? ` · ${movement.note}` : ''}
              </p>
            </div>
          ))
        )}
      </div>
    </Modal>
  )
}
function movementLabel(type: Movement['movement_type']) {
  return {
    opening: 'Estoc inicial',
    entry: 'Entrada',
    adjustment: 'Ajust',
    consumption: 'Consum en manteniment',
  }[type]
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal inventory-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-title">
          <h2>{title}</h2>
          <button className="close" type="button" aria-label="Tanca" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}
