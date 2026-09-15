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

const currency = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
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
        `¿Quieres eliminar «${product.name}»? No se puede eliminar si ya se ha utilizado en una visita.`,
      )
    )
      return
    const { error: requestError } = await createClient()
      .from('products')
      .delete()
      .eq('id', product.id)
    if (requestError) {
      toast.error('No se ha podido eliminar el material', { description: requestError.message })
      return
    }
    toast.success('Material eliminado', { description: product.name })
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
          El inventario se activará al aplicar la migración de Supabase incluida en el proyecto.
        </p>
      )}
      {!isAdmin && (
        <p className="access-note" role="status">
          Solo los administradores pueden modificar el inventario.
        </p>
      )}
      <section className="inventory-summary" aria-label="Resumen del inventario">
        <div>
          <span>Materiales activos</span>
          <strong>{products.filter((product) => product.active).length}</strong>
        </div>
        <div>
          <span>Stock bajo</span>
          <strong>{lowStock.length}</strong>
        </div>
        <div>
          <span>Valor de coste</span>
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
          <span className="sr-only">Buscar materiales</span>
          <input
            value={query}
            onChange={(event) => updateInventorySearch({ q: event.target.value })}
            placeholder="Buscar por material o referencia"
          />
        </label>
        <PopoverTrigger>
          <Button className="inventory-filter-trigger" type="button" variant="outline">
            <SlidersHorizontal size={16} aria-hidden="true" />
            Filtros
            {activeFilterCount > 0 && <span className="inventory-filter-count">{activeFilterCount}</span>}
          </Button>
          <PopoverContent placement="bottom end" className="inventory-filters-popover">
            <header className="inventory-filters-heading">
              <div>
                <strong>Filtrar el inventario</strong>
                <span>Los resultados se actualizan al momento.</span>
              </div>
              {activeFilterCount > 0 && (
                <Button
                  className="action-link inventory-clear-filters"
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => updateInventorySearch({ categoria: null, estado: null, stock: null })}
                >
                  Limpiar
                </Button>
              )}
            </header>
            <label className="inventory-filter-field">
              <span>Categoria</span>
              <select
                value={category}
                onChange={(event) => updateInventorySearch({ categoria: event.target.value })}
              >
                <option value="">Todas las categorías</option>
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
                <option value="all">Todos los estados</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
              </select>
            </label>
            <label className="inventory-filter-field">
              <span>Disponibilidad</span>
              <select value={stock} onChange={(event) => updateInventorySearch({ stock: event.target.value })}>
                <option value="all">Todo el stock</option>
                <option value="low">Stock bajo</option>
                <option value="healthy">Stock correcto</option>
              </select>
            </label>
          </PopoverContent>
        </PopoverTrigger>
        <span className="inventory-result-count">
          {loading ? 'Cargando…' : `${remoteProducts.length} de ${total} materiales`}
        </span>
      </div>
      {hasFilters && (
        <div className="inventory-filter-feedback" aria-label="Filtros activos">
          <div className="inventory-active-filters">
            {query && (
              <Button
                className="inventory-filter-chip"
                type="button"
                variant="outline"
                size="xs"
                onClick={() => updateInventorySearch({ q: null })}
                aria-label={`Eliminar la búsqueda ${query}`}
              >
                Búsqueda: {query} <X size={13} aria-hidden="true" />
              </Button>
            )}
            {category && (
              <Button
                className="inventory-filter-chip"
                type="button"
                variant="outline"
                size="xs"
                onClick={() => updateInventorySearch({ categoria: null })}
                aria-label={`Eliminar la categoría ${category}`}
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
                {status === 'active' ? 'Activos' : 'Inactivos'} <X size={13} aria-hidden="true" />
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
                {stock === 'low' ? 'Stock bajo' : 'Stock correcto'} <X size={13} aria-hidden="true" />
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
            Limpiar todo
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
              <span>{product.reference || 'Sin referencia'}</span>
              {product.category && <small className="inventory-category-tag">{product.category}</small>}
            </div>
            <div className="inventory-stock">
              <span>Existencias</span>
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
              <span>Coste / venta</span>
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
                    Ajustar
                  </Button>
                  <Button
                    className="icon-action"
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Editar ${product.name}`}
                    onClick={() => setEditing(product)}
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    className="icon-action destructive"
                    type="button"
                    variant="destructive"
                    size="icon-sm"
                    aria-label={`Eliminar ${product.name}`}
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
          <p>No hay materiales que coincidan con la búsqueda.</p>
        </div>
      )}
      {loading && <p className="inventory-loading" role="status">Cargando el inventario…</p>}
      {!loading && total > 0 && (
        <nav className="pagination inventory-pagination" aria-label="Paginación del inventario">
          <Button
            type="button"
            variant="outline"
            disabled={page === 1}
            onClick={() => updateSearchParams({ pagina: page === 2 ? null : page - 1 })}
          >
            Anterior
          </Button>
          <span>
            Página {page} de {pageCount} · {total} materiales
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={page >= pageCount}
            onClick={() => updateSearchParams({ pagina: page + 1 })}
          >
            Siguiente
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
            toast.success(editing === 'new' ? 'Material creado' : 'Material actualizado', {
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
            toast.success('Movimiento registrado', { description: movementProduct.name })
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
    <Modal title={product ? 'Editar material' : 'Material nuevo'} onClose={onClose}>
      <form
        className="record-form"
        onSubmit={(event) => {
          event.preventDefault()
          setSaving(true)
          setError(null)
          onSave(form)
            .catch((reason: unknown) =>
              setError(reason instanceof Error ? reason.message : 'No se ha podido guardar.'),
            )
            .finally(() => setSaving(false))
        }}
      >
        <div className="form-grid">
          <label className="field form-span-2">
            <span>Nombre</span>
            <input
              required
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              placeholder="P. ej. cloro granulado"
            />
          </label>
          <label className="field">
            <span>Referencia</span>
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
            <span>Unidad</span>
            <select value={form.unit} onChange={(event) => set('unit', event.target.value)}>
              <option value="kg">kg</option>
              <option value="l">l</option>
              <option value="ud">unidades</option>
              <option value="g">g</option>
            </select>
          </label>
          <label className="field">
            <span>Stock inicial</span>
            <input
              type="number"
              min="0"
              step="0.001"
              value={form.stock_quantity}
              onChange={(event) => set('stock_quantity', numeric(event.target.value))}
            />
          </label>
          <label className="field">
            <span>Stock mínimo</span>
            <input
              type="number"
              min="0"
              step="0.001"
              value={form.minimum_stock}
              onChange={(event) => set('minimum_stock', numeric(event.target.value))}
            />
          </label>
          <label className="field">
            <span>Coste unitario (€)</span>
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
            <span>Precio de venta (€)</span>
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
          Material activo
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <DialogFooter className="modal-foot">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar material'}
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
    <Modal title={`Ajustar · ${product.name}`} onClose={onClose}>
      <form
        className="record-form"
        onSubmit={(event) => {
          event.preventDefault()
          setSaving(true)
          setError(null)
          onSave(numeric(quantity), type, note)
            .catch((reason: unknown) =>
              setError(
                reason instanceof Error ? reason.message : 'No se ha podido registrar el movimiento.',
              ),
            )
            .finally(() => setSaving(false))
        }}
      >
        <p className="movement-current">
          Stock actual:{' '}
          <strong>
            {product.stock_quantity} {product.unit}
          </strong>
        </p>
        <div className="form-grid">
          <label className="field">
            <span>Tipus</span>
            <select value={type} onChange={(event) => setType(event.target.value as typeof type)}>
              <option value="entry">Entrada de material</option>
              <option value="adjustment">Ajuste de inventario</option>
            </select>
          </label>
          <label className="field">
            <span>Cantidad {type === 'adjustment' ? '(usa − para restar)' : ''}</span>
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
              placeholder="P. ej. recepción del proveedor"
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
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Registrando…' : 'Registrar movimiento'}
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
      title="Historial de stock"
      description={product.name}
      className="inventory-history-modal"
      onClose={onClose}
    >
      <section className="inventory-history-summary" aria-label="Resumen de stock">
        <div>
          <span>Stock actual</span>
          <strong className={product.stock_quantity <= product.minimum_stock ? 'stock-low' : 'stock-positive'}>
            {product.stock_quantity} {product.unit}
          </strong>
        </div>
        <div>
          <span>Stock mínimo</span>
          <strong>
            {product.minimum_stock} {product.unit}
          </strong>
        </div>
        <p className={product.stock_quantity <= product.minimum_stock ? 'is-low' : 'is-healthy'}>
          {product.stock_quantity <= product.minimum_stock ? 'Necesita reposición' : 'Stock disponible'}
        </p>
      </section>
      <div className="movement-history">
        {loading ? (
          <p className="movement-history-status" role="status">
            Cargando el historial…
          </p>
        ) : movements.length === 0 ? (
          <p>Este material aún no tiene movimientos registrados.</p>
        ) : (
          movements.map((movement) => (
            <article className={`movement-history-row movement-${movement.movement_type}`} key={movement.id}>
              <div className="movement-history-detail">
                <strong>{movementLabel(movement.movement_type)}</strong>
                <p>{movement.note || 'Sin observaciones.'}</p>
              </div>
              <div className="movement-history-value">
                <strong className={movement.quantity < 0 ? 'stock-low' : 'stock-positive'}>
                  {movement.quantity > 0 ? '+' : ''}
                  {movement.quantity} {product.unit}
                </strong>
                <time dateTime={movement.occurred_at}>
                  {new Intl.DateTimeFormat('es-ES', {
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
    opening: 'Stock inicial',
    entry: 'Entrada',
    adjustment: 'Ajuste',
    consumption: 'Consumo en mantenimiento',
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
