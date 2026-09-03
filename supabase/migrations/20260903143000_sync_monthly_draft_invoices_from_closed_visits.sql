-- Keep one live monthly draft per client. A draft is updated whenever a
-- technician closes a maintenance visit; issued, sent and paid invoices are
-- deliberately immutable.

alter table public.invoice_lines
  add column contract_id uuid references public.contracts(id) on delete restrict,
  add column visit_id uuid references public.visits(id) on delete restrict;

create unique index invoice_lines_contract_source_key
  on public.invoice_lines(invoice_id, contract_id)
  where contract_id is not null;

create unique index invoice_lines_visit_source_key
  on public.invoice_lines(invoice_id, visit_id)
  where visit_id is not null;

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

  -- Once accounting has issued an invoice, subsequent visit closures cannot
  -- silently change it. Month-end issuing/sending is intentionally separate.
  if (select status from public.invoices where id = v_invoice_id) <> 'draft' then
    return v_invoice_id;
  end if;

  -- Replace only the legacy, untracked monthly fee lines created before this
  -- migration. Material and manually entered draft lines remain untouched.
  delete from public.invoice_lines
  where invoice_id = v_invoice_id
    and contract_id is null
    and visit_id is null
    and billing_item_id is null
    and description like 'Mantenimiento mensual · %';

  -- The regular monthly service is billed once per active contract.
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

  -- Each completed maintenance visit is displayed at zero cost. Its completion
  -- timestamp is the exact moment reported by the technician.
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

  -- Consumption is copied from the completed work order with the product price
  -- snapshot captured when the technician closed it.
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

create or replace function public.generate_monthly_invoices(p_billing_period date)
returns table(invoice_id uuid, client_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period date := date_trunc('month', p_billing_period)::date;
  v_client record;
  v_existing_invoice_id uuid;
begin
  if not (select public.is_admin()) then
    raise exception 'Solo administración puede preparar las facturas mensuales.' using errcode = '42501';
  end if;
  if p_billing_period is null or p_billing_period <> v_period then
    raise exception 'El período de facturación debe ser el primer día del mes.' using errcode = '22023';
  end if;

  for v_client in
    select id from public.clients where active and billing_frequency = 'monthly' order by legal_name
  loop
    select id into v_existing_invoice_id
    from public.invoices
    where invoices.client_id = v_client.id and invoices.billing_period = v_period;

    invoice_id := public.sync_monthly_client_invoice(v_client.id, v_period);
    client_id := v_client.id;
    created := v_existing_invoice_id is null;
    return next;
  end loop;
end;
$$;

create or replace function public.sync_monthly_invoice_after_visit_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
  v_completed_at timestamptz;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  select installation.client_id, intervention.completed_at
  into v_client_id, v_completed_at
  from public.installations as installation
  join public.interventions as intervention on intervention.visit_id = new.id
  where installation.id = new.installation_id;

  if v_client_id is not null and v_completed_at is not null then
    perform public.sync_monthly_client_invoice(
      v_client_id,
      date_trunc('month', v_completed_at at time zone 'Europe/Madrid')::date
    );
  end if;

  return new;
end;
$$;

drop trigger if exists visits_sync_monthly_invoice_after_completion on public.visits;
create trigger visits_sync_monthly_invoice_after_completion
after update of status on public.visits
for each row execute procedure public.sync_monthly_invoice_after_visit_completion();

revoke all on function public.sync_monthly_client_invoice(uuid, date) from public;
revoke all on function public.sync_monthly_invoice_after_visit_completion() from public;
revoke all on function public.generate_monthly_invoices(date) from public;
grant execute on function public.generate_monthly_invoices(date) to authenticated;
