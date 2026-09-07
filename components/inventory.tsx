'use client'

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  PopoverContent,
  PopoverTrigger,
  toast,
} from '@doscientos/ui'
import { History, PackagePlus, Pencil, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import {
  getInventoryCategories,
  getInventoryPageCount,
  INVENTORY_PAGE_SIZE,
  readInventoryPage,
} from '@/lib/inventory-filters'
import type { SearchParamUpdates } from '@/lib/search-params'
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

type InventoryPageResponse = {
  items: Product[]
  total: number
}

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
  const category = searchParams.get('categoria') ?? ''
  const statusParam = searchParams.get('estado')
  const stockParam = searchParams.get('stock')
  const status = statusParam === 'active' || statusParam === 'inactive' ? statusParam : 'all'
  const stock = stockParam === 'low' || stockParam === 'healthy' ? stockParam : 'all'
  const page = readInventoryPage(searchParams.get('pagina'))
  const [editing, setEditing] = useState<Product | 'new' | null>(null)
  const [movementProduct, setMovementProduct] = useState<Product | null>(null)
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null)
  const [movements, setMovements] = useState<Movement[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remoteProducts, setRemoteProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [reloadVersion, setReloadVersion] = useState(0)
  const creationVersionRef = useRef(creationVersion)
  const categories = useMemo(() => getInventoryCategories(products), [products])
  const hasFilters = Boolean(query || category || status !== 'all' || stock !== 'all')
  const activeFilterCount = Number(Boolean(category)) + Number(status !== 'all') + Number(stock !== 'all')
  const pageCount = getInventoryPageCount(total)
  const updateInventorySearch = (updates: SearchParamUpdates) =>
    updateSearchParams({ ...updates, pagina: null })
  const lowStock = products.filter(
    (product) => product.active && product.stock_quantity <= product.minimum_stock,
  )

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(async () => {
      setLoading(true)
      const { data, error: requestError } = await createClient().rpc('list_inventory_page', {
        p_query: query.trim() || null,
        p_category: category || null,
        p_status: status,
        p_stock: stock,
        p_page: page,
        p_page_size: INVENTORY_PAGE_SIZE,
      })
      if (!active) return
      if (requestError) {
        setError(requestError.message)
        setRemoteProducts([])
        setTotal(0)
      } else {
        const response = data as unknown as InventoryPageResponse
        setError(null)
        setRemoteProducts(response?.items ?? [])
        setTotal(Number(response?.total ?? 0))
      }
      setLoading(false)
    }, 200)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [category, page, query, reloadVersion, status, stock])

  useEffect(() => {
    if (!loading && page > pageCount) updateSearchParams({ pagina: pageCount === 1 ? null : pageCount })
  }, [loading, page, pageCount, updateSearchParams])

  useEffect(() => {
    if (!historyProduct) return
    let active = true
    setHistoryLoading(true)
    setMovements([])
    createClient()
      .from('inventory_movements')
      .select('id,product_id,movement_type,quantity,note,occurred_at')
      .eq('product_id', historyProduct.id)
      .order('occurred_at', { ascending: false })
      .limit(30)
      .then(({ data, error: requestError }) => {
        if (!active) return
        if (requestError) setError(requestError.message)
        else setMovements((data ?? []) as Movement[])
        setHistoryLoading(false)
      })
    return () => {
      active = false
    }
  }, [historyProduct])

  useEffect(() => {
    if (!isAdmin || creationVersion === creationVersionRef.current) return
    creationVersionRef.current = creationVersion
    setEditing('new')
  }, [creationVersion, isAdmin])

  const refreshInventory = async () => {
    await onRefresh()
    setReloadVersion((version) => version + 1)
  }

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
    if (requestError) {
      toast.error("No s'ha pogut eliminar el material", { description: requestError.message })
      return
    }
    toast.success('Material eliminat', { description: product.name })
    await refreshInventory()
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
      <div className="client-toolbar inventory-toolbar">
        <label className="client-search">
          <span className="sr-only">Cerca materials</span>
          <input
            value={query}
            onChange={(event) => updateInventorySearch({ q: event.target.value })}
            placeholder="Cerca per material o referència"
          />
        </label>
        <PopoverTrigger>
          <Button className="inventory-filter-trigger" type="button" variant="outline">
            <SlidersHorizontal size={16} aria-hidden="true" />
            Filtres
            {activeFilterCount > 0 && <span className="inventory-filter-count">{activeFilterCount}</span>}
          </Button>
          <PopoverContent placement="bottom end" className="inventory-filters-popover">
            <header className="inventory-filters-heading">
              <div>
                <strong>Filtra l'inventari</strong>
                <span>Els resultats s'actualitzen al moment.</span>
              </div>
              {activeFilterCount > 0 && (
                <Button
                  className="action-link inventory-clear-filters"
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => updateInventorySearch({ categoria: null, estado: null, stock: null })}
                >
                  Neteja
                </Button>
              )}
            </header>
            <label className="inventory-filter-field">
              <span>Categoria</span>
              <select
                value={category}
                onChange={(event) => updateInventorySearch({ categoria: event.target.value })}
              >
                <option value="">Totes les categories</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="inventory-filter-field">
              <span>Estat</span>
              <select value={status} onChange={(event) => updateInventorySearch({ estado: event.target.value })}>
                <option value="all">Tots els estats</option>
                <option value="active">Actius</option>
                <option value="inactive">Inactius</option>
              </select>
            </label>
            <label className="inventory-filter-field">
              <span>Disponibilitat</span>
              <select value={stock} onChange={(event) => updateInventorySearch({ stock: event.target.value })}>
                <option value="all">Tot l'estoc</option>
                <option value="low">Estoc baix</option>
                <option value="healthy">Estoc correcte</option>
              </select>
            </label>
          </PopoverContent>
        </PopoverTrigger>
        <span className="inventory-result-count">
          {loading ? 'Carregant…' : `${remoteProducts.length} de ${total} materials`}
        </span>
      </div>
      {hasFilters && (
        <div className="inventory-filter-feedback" aria-label="Filtres actius">
          <div className="inventory-active-filters">
            {query && (
              <Button
                className="inventory-filter-chip"
                type="button"
                variant="outline"
                size="xs"
                onClick={() => updateInventorySearch({ q: null })}
                aria-label={`Elimina la cerca ${query}`}
              >
                Cerca: {query} <X size={13} aria-hidden="true" />
              </Button>
            )}
            {category && (
              <Button
                className="inventory-filter-chip"
                type="button"
                variant="outline"
                size="xs"
                onClick={() => updateInventorySearch({ categoria: null })}
                aria-label={`Elimina la categoria ${category}`}
              >
                {category} <X size={13} aria-hidden="true" />
              </Button>
            )}
            {status !== 'all' && (
              <Button
                className="inventory-filter-chip"
                type="button"
                variant="outline"
                size="xs"
                onClick={() => updateInventorySearch({ estado: null })}
              >
                {status === 'active' ? 'Actius' : 'Inactius'} <X size={13} aria-hidden="true" />
              </Button>
            )}
            {stock !== 'all' && (
              <Button
                className="inventory-filter-chip"
                type="button"
                variant="outline"
                size="xs"
                onClick={() => updateInventorySearch({ stock: null })}
              >
                {stock === 'low' ? 'Estoc baix' : 'Estoc correcte'} <X size={13} aria-hidden="true" />
              </Button>
            )}
          </div>
          <Button
            className="action-link inventory-reset-filters"
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => updateInventorySearch({ q: null, categoria: null, estado: null, stock: null })}
          >
            Neteja-ho tot
          </Button>
        </div>
      )}
      <div className="inventory-list">
        {remoteProducts.map((product) => (
          <article
            key={product.id}
            className={`inventory-row ${!product.active ? 'is-inactive' : ''}`}
          >
            <div className="inventory-material">
              <strong>{product.name}</strong>
              <span>{product.reference || 'Sense referència'}</span>
              {product.category && <small className="inventory-category-tag">{product.category}</small>}
            </div>
            <div className="inventory-stock">
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
            <div className="inventory-pricing">
              <span>Cost / venda</span>
              <strong>
                {currency.format(Number(product.cost_price ?? 0))} /{' '}
                {currency.format(Number(product.sale_price))}
              </strong>
            </div>
            <div className="inventory-actions">
              <Button
                className="action-link"
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setHistoryProduct(product)}
              >
                <History size={16} aria-hidden="true" />
                Historial
              </Button>
              {isAdmin && (
                <>
                  <Button
                    className="action-link"
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setMovementProduct(product)}
                  >
                    <PackagePlus size={16} aria-hidden="true" />
                    Ajusta
                  </Button>
                  <Button
                    className="icon-action"
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edita ${product.name}`}
                    onClick={() => setEditing(product)}
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    className="icon-action destructive"
                    type="button"
                    variant="destructive"
                    size="icon-sm"
                    aria-label={`Elimina ${product.name}`}
                    onClick={() => void remove(product)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {!loading && remoteProducts.length === 0 && (
        <div className="empty-results">
          <p>No hi ha materials que coincideixin amb la cerca.</p>
        </div>
      )}
      {loading && <p className="inventory-loading" role="status">S&apos;està carregant l&apos;inventari…</p>}
      {!loading && total > 0 && (
        <nav className="pagination inventory-pagination" aria-label="Paginació de l'inventari">
          <Button
            type="button"
            variant="outline"
            disabled={page === 1}
            onClick={() => updateSearchParams({ pagina: page === 2 ? null : page - 1 })}
          >
            Anterior
          </Button>
          <span>
            Pàgina {page} de {pageCount} · {total} materials
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={page >= pageCount}
            onClick={() => updateSearchParams({ pagina: page + 1 })}
          >
            Següent
          </Button>
        </nav>
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
            await refreshInventory()
            setEditing(null)
            toast.success(editing === 'new' ? 'Material creat' : 'Material actualitzat', {
              description: payload.name,
            })
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
            await refreshInventory()
            setMovementProduct(null)
            toast.success('Moviment registrat', { description: movementProduct.name })
          }}
        />
      )}
      {historyProduct && (
        <HistoryModal
          product={historyProduct}
          movements={movements}
          loading={historyLoading}
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
              setError(reason instanceof Error ? reason.message : "No s'ha pogut desar."),
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
        <DialogFooter className="modal-foot">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel·la
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "S'està desant…" : 'Desa el material'}
          </Button>
        </DialogFooter>
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
                reason instanceof Error ? reason.message : "No s'ha pogut registrar el moviment.",
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
        <DialogFooter className="modal-foot">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel·la
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "S'està registrant…" : 'Registra el moviment'}
          </Button>
        </DialogFooter>
      </form>
    </Modal>
  )
}

function HistoryModal({
  product,
  movements,
  loading,
  onClose,
}: {
  product: Product
  movements: Movement[]
  loading: boolean
  onClose: () => void
}) {
  return (
    <Modal
      title="Historial d'estoc"
      description={product.name}
      className="inventory-history-modal"
      onClose={onClose}
    >
      <section className="inventory-history-summary" aria-label="Resum d'estoc">
        <div>
          <span>Estoc actual</span>
          <strong className={product.stock_quantity <= product.minimum_stock ? 'stock-low' : 'stock-positive'}>
            {product.stock_quantity} {product.unit}
          </strong>
        </div>
        <div>
          <span>Estoc mínim</span>
          <strong>
            {product.minimum_stock} {product.unit}
          </strong>
        </div>
        <p className={product.stock_quantity <= product.minimum_stock ? 'is-low' : 'is-healthy'}>
          {product.stock_quantity <= product.minimum_stock ? 'Cal reposició' : 'Estoc disponible'}
        </p>
      </section>
      <div className="movement-history">
        {loading ? (
          <p className="movement-history-status" role="status">
            S&apos;està carregant l&apos;historial…
          </p>
        ) : movements.length === 0 ? (
          <p>Aquest material encara no té moviments registrats.</p>
        ) : (
          movements.map((movement) => (
            <article className={`movement-history-row movement-${movement.movement_type}`} key={movement.id}>
              <div className="movement-history-detail">
                <strong>{movementLabel(movement.movement_type)}</strong>
                <p>{movement.note || 'Sense observacions.'}</p>
              </div>
              <div className="movement-history-value">
                <strong className={movement.quantity < 0 ? 'stock-low' : 'stock-positive'}>
                  {movement.quantity > 0 ? '+' : ''}
                  {movement.quantity} {product.unit}
                </strong>
                <time dateTime={movement.occurred_at}>
                {new Intl.DateTimeFormat('ca-ES', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(movement.occurred_at))}
                </time>
              </div>
            </article>
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
  description,
  className,
  onClose,
  children,
}: {
  title: string
  description?: React.ReactNode
  className?: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={`modal inventory-modal ${className ?? ''}`} showCloseButton>
        <DialogHeader className="modal-title">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
