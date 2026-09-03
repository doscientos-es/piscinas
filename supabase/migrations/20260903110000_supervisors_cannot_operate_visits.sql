-- Administrators supervise the schedule but cannot record field work.

create or replace function public.start_visit(
  p_visit_id uuid,
  p_start_latitude numeric,
  p_start_longitude numeric,
  p_start_accuracy_m numeric,
  p_start_outside_schedule_confirmed boolean default false
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit public.visits%rowtype;
  v_started_at timestamptz;
  v_is_admin boolean;
begin
  if p_start_latitude is null or p_start_latitude not between -90 and 90
    or p_start_longitude is null or p_start_longitude not between -180 and 180
    or p_start_accuracy_m is null or p_start_accuracy_m not between 0 and 10000 then
    raise exception 'La ubicación recibida no es válida. Activa la ubicación precisa e inténtalo de nuevo.'
      using errcode = '22023';
  end if;

  select * into v_visit from public.visits where id = p_visit_id for update;
  if not found then raise exception 'La visita no existe.' using errcode = 'P0002'; end if;

  select role = 'admin' into v_is_admin from public.profiles where id = (select auth.uid());
  if coalesce(v_is_admin, false) or v_visit.technician_id is distinct from (select auth.uid()) then
    raise exception 'Solo el técnico asignado puede iniciar esta visita.' using errcode = '42501';
  end if;

  if v_visit.status = 'scheduled' then
    update public.visits set status = 'in_progress' where id = p_visit_id;
  elsif v_visit.status <> 'in_progress' then
    raise exception 'Esta visita no se puede iniciar porque ya está cerrada o cancelada.' using errcode = 'P0001';
  end if;

  insert into public.interventions (
    visit_id, started_at, start_latitude, start_longitude, start_location_accuracy_m,
    start_location_recorded_at, start_outside_schedule_confirmed, customer_notice_status
  ) values (
    p_visit_id, now(), p_start_latitude, p_start_longitude, p_start_accuracy_m,
    now(), p_start_outside_schedule_confirmed, 'not_sent'
  ) on conflict (visit_id) do update set
    start_latitude = coalesce(public.interventions.start_latitude, excluded.start_latitude),
    start_longitude = coalesce(public.interventions.start_longitude, excluded.start_longitude),
    start_location_accuracy_m = coalesce(public.interventions.start_location_accuracy_m, excluded.start_location_accuracy_m),
    start_location_recorded_at = coalesce(public.interventions.start_location_recorded_at, excluded.start_location_recorded_at),
    start_outside_schedule_confirmed = public.interventions.start_outside_schedule_confirmed or excluded.start_outside_schedule_confirmed,
    started_at = coalesce(public.interventions.started_at, excluded.started_at)
  returning started_at into v_started_at;

  return v_started_at;
end;
$$;

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
  if nullif(btrim(p_notes), '') is null then
    raise exception 'Describe el trabajo realizado antes de cerrar el parte.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_products, '[]'::jsonb)) <> 'array' then
    raise exception 'Los productos deben enviarse como una lista.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(coalesce(p_products, '[]'::jsonb)) as requested(product_id uuid, quantity numeric)
    where product_id is null or quantity is null or quantity <= 0
  ) then
    raise exception 'Revisa las cantidades de los productos usados.' using errcode = '22023';
  end if;

  select * into v_visit from public.visits where id = p_visit_id for update;
  if not found then raise exception 'La visita no existe.' using errcode = 'P0002'; end if;

  select role = 'admin' into v_is_admin from public.profiles where id = (select auth.uid());
  if coalesce(v_is_admin, false) or v_visit.technician_id is distinct from (select auth.uid()) then
    raise exception 'Solo el técnico asignado puede cerrar esta visita.' using errcode = '42501';
  end if;
  if v_visit.status <> 'in_progress' then
    raise exception 'La visita debe estar iniciada y sin cerrar.' using errcode = 'P0001';
  end if;

  select id into v_intervention_id from public.interventions where visit_id = p_visit_id for update;
  if not found then raise exception 'Inicia la visita antes de guardar el parte.' using errcode = 'P0001'; end if;
  select client_id into v_client_id from public.installations where id = v_visit.installation_id;

  with requested as (
    select product_id, sum(quantity) as quantity
    from jsonb_to_recordset(coalesce(p_products, '[]'::jsonb)) as input(product_id uuid, quantity numeric)
    group by product_id
  ), locked as (
    select product.id, product.stock_quantity, requested.quantity
    from public.products as product join requested on requested.product_id = product.id
    for update of product
  ) select (select count(*) from requested), count(*), coalesce(bool_or(stock_quantity < quantity), false)
  into v_requested_count, v_locked_count, v_insufficient_stock from locked;

  if v_requested_count <> v_locked_count then
    raise exception 'Uno de los productos seleccionados ya no está disponible.' using errcode = 'P0002';
  end if;
  if v_insufficient_stock then
    raise exception 'No hay existencias suficientes para registrar el consumo.' using errcode = '22023';
  end if;

  with requested as (
    select product_id, sum(quantity) as quantity
    from jsonb_to_recordset(coalesce(p_products, '[]'::jsonb)) as input(product_id uuid, quantity numeric)
    group by product_id
  ), consumed as (
    insert into public.intervention_products (intervention_id, product_id, quantity, unit_price, vat_rate)
    select v_intervention_id, product.id, requested.quantity, product.sale_price, product.vat_rate
    from requested join public.products as product on product.id = requested.product_id
    returning id, product_id, quantity, unit_price, vat_rate
  ) insert into public.billing_items (
    client_id, installation_id, intervention_product_id, description, quantity, unit_price, vat_rate, status
  ) select v_client_id, v_visit.installation_id, consumed.id,
    product.name || ' (' || consumed.quantity || ' ' || product.unit || ')', consumed.quantity,
    consumed.unit_price, consumed.vat_rate, 'pending'
  from consumed join public.products as product on product.id = consumed.product_id;

  with requested as (
    select product_id, sum(quantity) as quantity
    from jsonb_to_recordset(coalesce(p_products, '[]'::jsonb)) as input(product_id uuid, quantity numeric)
    group by product_id
  ) update public.products as product set stock_quantity = product.stock_quantity - requested.quantity
  from requested where product.id = requested.product_id;

  update public.interventions set notes = btrim(p_notes), completed_at = now() where id = v_intervention_id;
  update public.visits set status = 'completed' where id = p_visit_id;
end;
$$;