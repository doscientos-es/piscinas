'use client'

import { AlertTriangle, History, PackagePlus, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { createClient } from '@/lib/supabase/client'

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

const currency = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
const emptyProduct: ProductInput = { name: '', reference: null, category: null, unit: 'kg', sale_price: 0, cost_price: null, stock_quantity: 0, minimum_stock: 0, active: true }
const numeric = (value: string) => Number(value.replace(',', '.'))
const optionalText = (value: string) => value.trim() || null

export function Inventory({ products, isAdmin, schemaReady, onRefresh }: { products: Product[]; isAdmin: boolean; schemaReady: boolean; onRefresh: () => Promise<void> }) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Product | 'new' | null>(null)
  const [movementProduct, setMovementProduct] = useState<Product | null>(null)
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null)
  const [movements, setMovements] = useState<Movement[]>([])
  const [error, setError] = useState<string | null>(null)
  const visible = useMemo(() => products.filter((product) => product.name.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')) || product.reference?.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es'))), [products, query])
  const lowStock = products.filter((product) => product.active && product.stock_quantity <= product.minimum_stock)

  useEffect(() => {
    if (!historyProduct) return
    createClient().from('inventory_movements').select('id,product_id,movement_type,quantity,note,occurred_at').eq('product_id', historyProduct.id).order('occurred_at', { ascending: false }).limit(30).then(({ data, error: requestError }) => {
      if (requestError) setError(requestError.message)
      else setMovements((data ?? []) as Movement[])
    })
  }, [historyProduct])

  const remove = async (product: Product) => {
    if (!window.confirm(`¿Eliminar «${product.name}»? No se puede eliminar si ya se ha usado en una visita.`)) return
    const { error: requestError } = await createClient().from('products').delete().eq('id', product.id)
    if (requestError) setError(requestError.message)
    else await onRefresh()
  }

  return <>
    <section className="intro client-intro">
      <div><h2>Materiales e inventario</h2><p>Controla existencias, coste y precio de venta. Los consumos de los partes se descuentan y quedan listos para facturar.</p></div>
      {isAdmin && <button className="button" type="button" onClick={() => setEditing('new')}><Plus size={17} aria-hidden="true" />Nuevo material</button>}
    </section>
    {error && <p className="access-note" role="alert">{error}</p>}
    {!schemaReady && <p className="access-note" role="status">El inventario se activará al aplicar la migración de Supabase incluida en el proyecto.</p>}
    {!isAdmin && <p className="access-note" role="status">Solo los administradores pueden modificar el inventario.</p>}
    <section className="inventory-summary" aria-label="Resumen de inventario">
      <div><span>Materiales activos</span><strong>{products.filter((product) => product.active).length}</strong></div>
      <div><span>Stock bajo</span><strong>{lowStock.length}</strong></div>
      <div><span>Valor de coste</span><strong>{currency.format(products.reduce((total, product) => total + product.stock_quantity * Number(product.cost_price ?? 0), 0))}</strong></div>
    </section>
    {lowStock.length > 0 && <p className="inventory-alert"><AlertTriangle size={17} aria-hidden="true" />{lowStock.map((product) => product.name).join(', ')} {lowStock.length === 1 ? 'está' : 'están'} en o por debajo del mínimo.</p>}
    <div className="client-toolbar"><label className="client-search"><span className="sr-only">Buscar materiales</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por material o referencia" /></label><span>{visible.length} materiales</span></div>
    <div className="inventory-list">
      {visible.map((product) => <article key={product.id} className={`inventory-row ${!product.active ? 'is-inactive' : ''}`}>
        <div><strong>{product.name}</strong><span>{product.reference || product.category || 'Sin referencia'}</span></div>
        <div><span>Existencias</span><strong className={product.stock_quantity <= product.minimum_stock ? 'stock-low' : ''}>{product.stock_quantity} {product.unit}</strong><small>Mín. {product.minimum_stock} {product.unit}</small></div>
        <div><span>Coste / venta</span><strong>{currency.format(Number(product.cost_price ?? 0))} / {currency.format(Number(product.sale_price))}</strong></div>
        <div className="inventory-actions"><button className="action-link" type="button" onClick={() => setHistoryProduct(product)}><History size={16} aria-hidden="true" />Historial</button>{isAdmin && <><button className="action-link" type="button" onClick={() => setMovementProduct(product)}><PackagePlus size={16} aria-hidden="true" />Ajustar</button><button className="icon-action" type="button" aria-label={`Editar ${product.name}`} onClick={() => setEditing(product)}><Pencil size={16} /></button><button className="icon-action destructive" type="button" aria-label={`Eliminar ${product.name}`} onClick={() => void remove(product)}><Trash2 size={16} /></button></>}</div>
      </article>)}
    </div>
    {visible.length === 0 && <div className="empty-results"><p>No hay materiales que coincidan con la búsqueda.</p></div>}
    {editing && <ProductForm product={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSave={async (input) => { const payload = { ...input, name: input.name.trim(), reference: optionalText(input.reference ?? ''), category: optionalText(input.category ?? ''), cost_price: input.cost_price || null }; const response = editing === 'new' ? await createClient().from('products').insert(payload) : await createClient().from('products').update(payload).eq('id', editing.id); if (response.error) throw new Error(response.error.message); await onRefresh(); setEditing(null) }} />}
    {movementProduct && <MovementForm product={movementProduct} onClose={() => setMovementProduct(null)} onSave={async (quantity, type, note) => { const { error: requestError } = await createClient().rpc('record_inventory_movement', { p_product_id: movementProduct.id, p_quantity: quantity, p_movement_type: type, p_note: note, p_unit_cost: movementProduct.cost_price }); if (requestError) throw new Error(requestError.message); await onRefresh(); setMovementProduct(null) }} />}
    {historyProduct && <HistoryModal product={historyProduct} movements={movements} onClose={() => setHistoryProduct(null)} />}
  </>
}

function ProductForm({ product, onClose, onSave }: { product?: Product; onClose: () => void; onSave: (input: ProductInput) => Promise<void> }) {
  const [form, setForm] = useState<ProductInput>(product ?? emptyProduct); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) => setForm((current) => ({ ...current, [key]: value }))
  return <Modal title={product ? 'Editar material' : 'Nuevo material'} onClose={onClose}><form className="record-form" onSubmit={(event) => { event.preventDefault(); setSaving(true); setError(null); onSave(form).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo guardar.')).finally(() => setSaving(false)) }}><div className="form-grid"><label className="field form-span-2"><span>Nombre</span><input required value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="Ej. Cloro granulado" /></label><label className="field"><span>Referencia</span><input value={form.reference ?? ''} onChange={(event) => set('reference', event.target.value)} /></label><label className="field"><span>Categoría</span><input value={form.category ?? ''} onChange={(event) => set('category', event.target.value)} placeholder="Tratamiento" /></label><label className="field"><span>Unidad</span><select value={form.unit} onChange={(event) => set('unit', event.target.value)}><option value="kg">kg</option><option value="l">l</option><option value="ud">unidades</option><option value="g">g</option></select></label><label className="field"><span>Stock inicial</span><input type="number" min="0" step="0.001" value={form.stock_quantity} onChange={(event) => set('stock_quantity', numeric(event.target.value))} /></label><label className="field"><span>Stock mínimo</span><input type="number" min="0" step="0.001" value={form.minimum_stock} onChange={(event) => set('minimum_stock', numeric(event.target.value))} /></label><label className="field"><span>Coste unitario (€)</span><input type="number" min="0" step="0.01" value={form.cost_price ?? ''} onChange={(event) => set('cost_price', event.target.value ? numeric(event.target.value) : null)} /></label><label className="field"><span>Precio de venta (€)</span><input required type="number" min="0" step="0.01" value={form.sale_price} onChange={(event) => set('sale_price', numeric(event.target.value))} /></label></div><label className="toggle-field"><input type="checkbox" checked={form.active} onChange={(event) => set('active', event.target.checked)} />Material activo</label>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-foot"><button className="button secondary" type="button" onClick={onClose}>Cancelar</button><button className="button" disabled={saving}>{saving ? 'Guardando…' : 'Guardar material'}</button></div></form></Modal>
}

function MovementForm({ product, onClose, onSave }: { product: Product; onClose: () => void; onSave: (quantity: number, type: 'entry' | 'adjustment', note: string) => Promise<void> }) {
  const [quantity, setQuantity] = useState(''); const [type, setType] = useState<'entry' | 'adjustment'>('entry'); const [note, setNote] = useState(''); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null)
  return <Modal title={`Ajustar · ${product.name}`} onClose={onClose}><form className="record-form" onSubmit={(event) => { event.preventDefault(); setSaving(true); setError(null); onSave(numeric(quantity), type, note).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo registrar el movimiento.')).finally(() => setSaving(false)) }}><p className="movement-current">Stock actual: <strong>{product.stock_quantity} {product.unit}</strong></p><div className="form-grid"><label className="field"><span>Tipo</span><select value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="entry">Entrada de material</option><option value="adjustment">Ajuste de inventario</option></select></label><label className="field"><span>Cantidad {type === 'adjustment' ? '(usa − para restar)' : ''}</span><input required type="number" step="0.001" min={type === 'entry' ? '0.001' : undefined} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label className="field form-span-2"><span>Nota</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej. Recepción de proveedor" /></label></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-foot"><button className="button secondary" type="button" onClick={onClose}>Cancelar</button><button className="button" disabled={saving}>{saving ? 'Registrando…' : 'Registrar movimiento'}</button></div></form></Modal>
}

function HistoryModal({ product, movements, onClose }: { product: Product; movements: Movement[]; onClose: () => void }) { return <Modal title={`Historial · ${product.name}`} onClose={onClose}><div className="movement-history">{movements.length === 0 ? <p>Este material aún no tiene movimientos registrados.</p> : movements.map((movement) => <div key={movement.id}><span>{new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(movement.occurred_at))}</span><strong className={movement.quantity < 0 ? 'stock-low' : 'stock-positive'}>{movement.quantity > 0 ? '+' : ''}{movement.quantity} {product.unit}</strong><p>{movementLabel(movement.movement_type)}{movement.note ? ` · ${movement.note}` : ''}</p></div>)}</div></Modal> }
function movementLabel(type: Movement['movement_type']) { return ({ opening: 'Stock inicial', entry: 'Entrada', adjustment: 'Ajuste', consumption: 'Consumo en mantenimiento' })[type] }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop" role="presentation"><section className="modal inventory-modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-title"><h2>{title}</h2><button className="close" type="button" aria-label="Cerrar" onClick={onClose}><X size={19} /></button></div>{children}</section></div> }
