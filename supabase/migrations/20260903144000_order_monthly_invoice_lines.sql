-- Invoice lines are rendered in business order, rather than relying on the
-- physical insertion order returned by PostgreSQL.

alter table public.invoice_lines
  add column sort_order integer not null default 0;

create index invoice_lines_invoice_sort_order_idx
  on public.invoice_lines(invoice_id, sort_order, id);

create or replace function public.order_monthly_invoice_lines(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  with monthly_visits as (
    select
      line.id as line_id,
      line.visit_id,
      row_number() over (order by intervention.completed_at, visit.id)::integer as visit_position
    from public.invoice_lines as line
    join public.visits as visit on visit.id = line.visit_id
    join public.interventions as intervention on intervention.visit_id = visit.id
    where line.invoice_id = p_invoice_id
      and line.visit_id is not null
  ), ordered_lines as (
    select
      line.id,
      (row_number() over (order by installation.name, contract.id) * 100)::integer as sort_order
    from public.invoice_lines as line
    join public.contracts as contract on contract.id = line.contract_id
    join public.installations as installation on installation.id = contract.installation_id
    where line.invoice_id = p_invoice_id
      and line.contract_id is not null

    union all

    select line_id, 10000 + visit_position * 100
    from monthly_visits

    union all

    select
      line.id,
      10000 + monthly_visits.visit_position * 100 +
        row_number() over (partition by monthly_visits.visit_id order by product.name, line.id)::integer
    from public.invoice_lines as line
    join public.billing_items as billing_item on billing_item.id = line.billing_item_id
    join public.intervention_products as intervention_product
      on intervention_product.id = billing_item.intervention_product_id
    join public.interventions as intervention on intervention.id = intervention_product.intervention_id
    join public.products as product on product.id = intervention_product.product_id
    join monthly_visits on monthly_visits.visit_id = intervention.visit_id
    where line.invoice_id = p_invoice_id
      and line.billing_item_id is not null

    union all

    select
      line.id,
      900000 + row_number() over (order by line.id)::integer
    from public.invoice_lines as line
    where line.invoice_id = p_invoice_id
      and line.contract_id is null
      and line.visit_id is null
      and line.billing_item_id is null
  )
  update public.invoice_lines as line
  set sort_order = ordered_lines.sort_order
  from ordered_lines
  where line.id = ordered_lines.id;
end;
$$;

-- Make the current draft deterministic immediately, including drafts created
-- before this column existed. Future completed visits are ordered by the sync
-- function below.
do $$
declare
  v_invoice_id uuid;
begin
  for v_invoice_id in select id from public.invoices loop
    perform public.order_monthly_invoice_lines(v_invoice_id);
  end loop;
end;
$$;

create or replace function public.sync_monthly_client_invoice(
  p_client_id uuid,
  p_billing_period date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period date := date_trunc('month', p_billing_period)::date;
  v_period_end date;
  v_client public.clients%rowtype;
  v_invoice_id uuid;
  v_subtotal numeric(12, 2);
  v_vat_total numeric(12, 2);
begin
  if p_billing_period is null or p_billing_period <> v_period then
    raise exception 'El período de facturación debe ser el primer día del mes.' using errcode = '22023';
  end if;

  select * into v_client
  from public.clients
  where id = p_client_id
    and active
    and billing_frequency = 'monthly'
  for update;

  if not found then
    return null;
  end if;

  v_period_end := (v_period + interval '1 month')::date;
  perform pg_advisory_xact_lock(hashtext('piscinas-monthly-invoice:' || p_client_id::text || ':' || v_period::text));

  insert into public.invoices (client_id, billing_period, due_on, status)
  values (p_client_id, v_period, (v_period_end - 1) + v_client.payment_terms_days, 'draft')
  on conflict (client_id, billing_period) do update
    set due_on = excluded.due_on
  returning id into v_invoice_id;

  if (select status from public.invoices where id = v_invoice_id) <> 'draft' then
    return v_invoice_id;
  end if;

  delete from public.invoice_lines
  where invoice_id = v_invoice_id
    and contract_id is null
    and visit_id is null
    and billing_item_id is null
    and description like 'Mantenimiento mensual · %';

  insert into public.invoice_lines (
    invoice_id, contract_id, description, quantity, unit_price, vat_rate, line_total
  )
  select
    v_invoice_id,
    contract.id,
    'Manteniment piscina · ' || installation.name || ' · ' || contract.visits_per_week || ' visita/es per setmana',
    1,
    contract.monthly_fee,
    21,
    round(contract.monthly_fee, 2)
  from public.contracts as contract
  join public.installations as installation on installation.id = contract.installation_id
  where installation.client_id = p_client_id
    and contract.active
    and contract.monthly_fee > 0
    and contract.starts_on < v_period_end
    and (contract.ends_on is null or contract.ends_on >= v_period)
  on conflict (invoice_id, contract_id) where contract_id is not null do update
    set description = excluded.description,
        quantity = excluded.quantity,
        unit_price = excluded.unit_price,
        vat_rate = excluded.vat_rate,
        line_total = excluded.line_total;

  insert into public.invoice_lines (
    invoice_id, visit_id, description, quantity, unit_price, vat_rate, line_total
  )
  select
    v_invoice_id,
    completed_visit.id,
    'Manteniment setmana ' || completed_visit.week_number || ' · ' ||
      to_char(completed_visit.completed_at at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI'),
    1,
    0,
    0,
    0
  from (
    select
      visit.id,
      intervention.completed_at,
      row_number() over (
        partition by visit.installation_id
        order by intervention.completed_at, visit.id
      ) as week_number
    from public.visits as visit
    join public.installations as installation on installation.id = visit.installation_id
    join public.interventions as intervention on intervention.visit_id = visit.id
    where installation.client_id = p_client_id
      and visit.status = 'completed'
      and intervention.completed_at >= v_period
      and intervention.completed_at < v_period_end
  ) as completed_visit
  on conflict (invoice_id, visit_id) where visit_id is not null do update
    set description = excluded.description;

  insert into public.invoice_lines (
    invoice_id, billing_item_id, description, quantity, unit_price, vat_rate, line_total
  )
  select
    v_invoice_id,
    billing_item.id,
    billing_item.description,
    billing_item.quantity,
    billing_item.unit_price,
    billing_item.vat_rate,
    round(billing_item.quantity * billing_item.unit_price, 2)
  from public.billing_items as billing_item
  join public.intervention_products as intervention_product
    on intervention_product.id = billing_item.intervention_product_id
  join public.interventions as intervention on intervention.id = intervention_product.intervention_id
  where billing_item.client_id = p_client_id
    and billing_item.status = 'pending'
    and intervention.completed_at >= v_period
    and intervention.completed_at < v_period_end
  on conflict (billing_item_id) do nothing;

  update public.billing_items
  set status = 'invoiced'
  where id in (
    select billing_item_id
    from public.invoice_lines
    where invoice_id = v_invoice_id
      and billing_item_id is not null
  );

  perform public.order_monthly_invoice_lines(v_invoice_id);

  select
    coalesce(sum(line_total), 0),
    coalesce(sum(line_total * vat_rate / 100), 0)
  into v_subtotal, v_vat_total
  from public.invoice_lines
  where invoice_id = v_invoice_id;

  update public.invoices
  set subtotal = round(v_subtotal, 2),
      vat_total = round(v_vat_total, 2),
      total = round(v_subtotal + v_vat_total, 2)
  where id = v_invoice_id;

  return v_invoice_id;
end;
$$;

revoke all on function public.order_monthly_invoice_lines(uuid) from public;
revoke all on function public.sync_monthly_client_invoice(uuid, date) from public;
