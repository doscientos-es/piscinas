-- Inventory is kept in the product catalog so maintenance and billing retain
-- their existing integration. This ledger makes every manual stock change auditable.
alter table public.products
  add column minimum_stock numeric(12, 3) not null default 0 check (minimum_stock >= 0),
  add column active boolean not null default true,
  add column updated_at timestamptz not null default now(),
  add column updated_by uuid references public.profiles(id) on delete set null;

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type in ('opening', 'entry', 'adjustment', 'consumption')),
  quantity numeric(12, 3) not null check (quantity <> 0),
  unit_cost numeric(12, 2) check (unit_cost is null or unit_cost >= 0),
  note text,
  source_type text not null default 'manual' check (source_type in ('manual', 'intervention', 'purchase', 'correction')),
  source_id uuid,
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index inventory_movements_product_occurred_idx
  on public.inventory_movements(product_id, occurred_at desc);

alter table public.inventory_movements enable row level security;
revoke all on table public.inventory_movements from anon, authenticated;
grant select, insert on table public.inventory_movements to authenticated;

create policy "admins manage inventory movements" on public.inventory_movements
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create or replace function public.set_product_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  new.updated_by = (select auth.uid());
  return new;
end;
$$;

create trigger products_set_updated_at
before update on public.products
for each row execute procedure public.set_product_updated_at();

create or replace function public.log_product_stock_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.stock_quantity <> 0 then
    insert into public.inventory_movements (product_id, movement_type, quantity, unit_cost, note, source_type, created_by)
    values (new.id, 'opening', new.stock_quantity, new.cost_price, 'Stock inicial', 'manual', (select auth.uid()));
  elsif tg_op = 'UPDATE'
    and new.stock_quantity is distinct from old.stock_quantity
    and coalesce(current_setting('app.inventory_movement_logged', true), 'false') <> 'true' then
    insert into public.inventory_movements (product_id, movement_type, quantity, unit_cost, note, source_type, created_by)
    values (new.id, 'adjustment', new.stock_quantity - old.stock_quantity, new.cost_price, 'Ajuste de stock', 'correction', (select auth.uid()));
  end if;
  return new;
end;
$$;

create trigger products_log_stock_change
after insert or update of stock_quantity on public.products
for each row execute procedure public.log_product_stock_change();

create or replace function public.record_inventory_movement(
  p_product_id uuid,
  p_quantity numeric,
  p_movement_type text,
  p_note text default null,
  p_unit_cost numeric default null
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_stock numeric(12, 3);
begin
  if not (select public.is_admin()) then
    raise exception 'No tienes permiso para modificar el inventario.' using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity = 0 then
    raise exception 'La cantidad debe ser distinta de cero.' using errcode = '22023';
  end if;

  if p_movement_type not in ('entry', 'adjustment') then
    raise exception 'El tipo de movimiento no es válido.' using errcode = '22023';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'El material ya no existe.' using errcode = 'P0002';
  end if;

  v_stock := v_product.stock_quantity + p_quantity;
  if v_stock < 0 then
    raise exception 'El ajuste dejaría el stock por debajo de cero.' using errcode = '22023';
  end if;

  perform set_config('app.inventory_movement_logged', 'true', true);
  update public.products set stock_quantity = v_stock where id = p_product_id;

  insert into public.inventory_movements (product_id, movement_type, quantity, unit_cost, note, source_type, created_by)
  values (p_product_id, p_movement_type, p_quantity, p_unit_cost, nullif(btrim(p_note), ''), 'manual', (select auth.uid()));

  return v_stock;
end;
$$;

revoke all on function public.record_inventory_movement(uuid, numeric, text, text, numeric) from public;
revoke all on function public.record_inventory_movement(uuid, numeric, text, text, numeric) from anon;
grant execute on function public.record_inventory_movement(uuid, numeric, text, text, numeric) to authenticated;

-- Record maintenance consumption in the ledger while preserving the already
-- atomic visit-closing workflow and the price snapshot sent to billing.
create or replace function public.complete_visit(
  p_visit_id uuid,
  p_notes text,
  p_products jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit public.visits%rowtype;
  v_intervention_id uuid;
  v_client_id uuid;
  v_is_admin boolean;
  v_requested_count integer;
  v_locked_count integer;
  v_insufficient_stock boolean;
begin
  if nullif(btrim(p_notes), '') is null then raise exception 'Describe el trabajo realizado antes de cerrar el parte.' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_products, '[]'::jsonb)) <> 'array' then raise exception 'Los productos deben enviarse como una lista.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_to_recordset(coalesce(p_products, '[]'::jsonb)) as requested(product_id uuid, quantity numeric) where product_id is null or quantity is null or quantity <= 0) then raise exception 'Revisa las cantidades de los productos usados.' using errcode = '22023'; end if;

  select * into v_visit from public.visits where id = p_visit_id for update;
  if not found then raise exception 'La visita no existe.' using errcode = 'P0002'; end if;
  select role = 'admin' into v_is_admin from public.profiles where id = (select auth.uid());
  if not coalesce(v_is_admin, false) and v_visit.technician_id is distinct from (select auth.uid()) then raise exception 'No tienes permiso para cerrar esta visita.' using errcode = '42501'; end if;
  if v_visit.status <> 'in_progress' then raise exception 'La visita debe estar iniciada y sin cerrar.' using errcode = 'P0001'; end if;

  select id into v_intervention_id from public.interventions where visit_id = p_visit_id for update;
  if not found then raise exception 'Inicia la visita antes de guardar el parte.' using errcode = 'P0001'; end if;
  select client_id into v_client_id from public.installations where id = v_visit.installation_id;

  with requested as (select product_id, sum(quantity) as quantity from jsonb_to_recordset(coalesce(p_products, '[]'::jsonb)) as input(product_id uuid, quantity numeric) group by product_id), locked as (select product.id, product.stock_quantity, requested.quantity from public.products as product join requested on requested.product_id = product.id for update of product)
  select (select count(*) from requested), count(*), coalesce(bool_or(stock_quantity < quantity), false) into v_requested_count, v_locked_count, v_insufficient_stock from locked;
  if v_requested_count <> v_locked_count then raise exception 'Uno de los productos seleccionados ya no está disponible.' using errcode = 'P0002'; end if;
  if v_insufficient_stock then raise exception 'No hay existencias suficientes para registrar el consumo.' using errcode = '22023'; end if;

  with requested as (select product_id, sum(quantity) as quantity from jsonb_to_recordset(coalesce(p_products, '[]'::jsonb)) as input(product_id uuid, quantity numeric) group by product_id), consumed as (insert into public.intervention_products (intervention_id, product_id, quantity, unit_price, vat_rate) select v_intervention_id, product.id, requested.quantity, product.sale_price, product.vat_rate from requested join public.products as product on product.id = requested.product_id returning id, product_id, quantity, unit_price, vat_rate)
  insert into public.billing_items (client_id, installation_id, intervention_product_id, description, quantity, unit_price, vat_rate, status)
  select v_client_id, v_visit.installation_id, consumed.id, product.name || ' (' || consumed.quantity || ' ' || product.unit || ')', consumed.quantity, consumed.unit_price, consumed.vat_rate, 'pending' from consumed join public.products as product on product.id = consumed.product_id;

  perform set_config('app.inventory_movement_logged', 'true', true);
  with requested as (select product_id, sum(quantity) as quantity from jsonb_to_recordset(coalesce(p_products, '[]'::jsonb)) as input(product_id uuid, quantity numeric) group by product_id)
  update public.products as product set stock_quantity = product.stock_quantity - requested.quantity from requested where product.id = requested.product_id;

  insert into public.inventory_movements (product_id, movement_type, quantity, note, source_type, source_id, created_by)
  select product_id, 'consumption', -quantity, 'Consumo en visita', 'intervention', v_intervention_id, (select auth.uid())
  from jsonb_to_recordset(coalesce(p_products, '[]'::jsonb)) as input(product_id uuid, quantity numeric);

  update public.interventions set notes = btrim(p_notes), completed_at = now() where id = v_intervention_id;
  update public.visits set status = 'completed' where id = p_visit_id;
end;
$$;

revoke all on function public.complete_visit(uuid, text, jsonb) from public;
revoke all on function public.complete_visit(uuid, text, jsonb) from anon;
grant execute on function public.complete_visit(uuid, text, jsonb) to authenticated;
