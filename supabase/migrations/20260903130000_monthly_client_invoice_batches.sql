-- One reviewable invoice draft per monthly client and billing period.

alter table public.invoices add column billing_period date;

update public.invoices
set billing_period = date_trunc('month', coalesce(issued_on, created_at)::timestamp)::date
where billing_period is null;

alter table public.invoices alter column billing_period set not null;
create unique index invoices_client_billing_period_key
  on public.invoices(client_id, billing_period);
create index billing_items_pending_period_idx
  on public.billing_items(client_id, created_at)
  where status = 'pending';

create function public.generate_monthly_invoices(p_billing_period date)
returns table(invoice_id uuid, client_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period date := date_trunc('month', p_billing_period)::date;
  v_period_end date;
  v_client record;
  v_invoice_id uuid;
  v_line_count integer;
  v_subtotal numeric(12, 2);
  v_vat_total numeric(12, 2);
begin
  if not (select public.is_admin()) then
    raise exception 'Solo administración puede preparar el cierre mensual.' using errcode = '42501';
  end if;
  if p_billing_period is null or p_billing_period <> v_period then
    raise exception 'El período de facturación debe ser el primer día del mes.' using errcode = '22023';
  end if;
  v_period_end := (v_period + interval '1 month')::date;
  perform pg_advisory_xact_lock(hashtext('piscinas-monthly-invoice-batch'));

  for v_client in
    select id, payment_terms_days
    from public.clients
    where active and billing_frequency = 'monthly'
    order by legal_name
  loop
    select id into v_invoice_id
    from public.invoices
    where invoices.client_id = v_client.id and invoices.billing_period = v_period
    for update;
    if found then
      invoice_id := v_invoice_id;
      client_id := v_client.id;
      created := false;
      return next;
      continue;
    end if;

    insert into public.invoices (client_id, billing_period, due_on, status)
    values (v_client.id, v_period, (v_period_end - 1) + v_client.payment_terms_days, 'draft')
    returning id into v_invoice_id;

    insert into public.invoice_lines (
      invoice_id, description, quantity, unit_price, vat_rate, line_total
    )
    select
      v_invoice_id,
      'Mantenimiento mensual · ' || installation.name || ' · ' || to_char(v_period, 'TMMonth YYYY'),
      1,
      contract.monthly_fee,
      21,
      round(contract.monthly_fee, 2)
    from public.contracts as contract
    join public.installations as installation on installation.id = contract.installation_id
    where installation.client_id = v_client.id
      and contract.active
      and contract.monthly_fee > 0
      and contract.starts_on < v_period_end
      and (contract.ends_on is null or contract.ends_on >= v_period);

    with selected_items as (
      select id, description, quantity, unit_price, vat_rate
      from public.billing_items
      where client_id = v_client.id
        and status = 'pending'
        and created_at >= v_period
        and created_at < v_period_end
      for update
    ), inserted_lines as (
      insert into public.invoice_lines (
        invoice_id, billing_item_id, description, quantity, unit_price, vat_rate, line_total
      )
      select
        v_invoice_id, id, description, quantity, unit_price, vat_rate,
        round(quantity * unit_price, 2)
      from selected_items
      returning billing_item_id
    )
    update public.billing_items
    set status = 'invoiced'
    where id in (select billing_item_id from inserted_lines);

    select count(*), coalesce(sum(line_total), 0), coalesce(sum(line_total * vat_rate / 100), 0)
    into v_line_count, v_subtotal, v_vat_total
    from public.invoice_lines
    where invoice_lines.invoice_id = v_invoice_id;

    if v_line_count = 0 then
      delete from public.invoices where id = v_invoice_id;
      continue;
    end if;

    update public.invoices
    set subtotal = round(v_subtotal, 2),
        vat_total = round(v_vat_total, 2),
        total = round(v_subtotal + v_vat_total, 2)
    where id = v_invoice_id;

    invoice_id := v_invoice_id;
    client_id := v_client.id;
    created := true;
    return next;
  end loop;
end;
$$;

revoke all on function public.generate_monthly_invoices(date) from public;
grant execute on function public.generate_monthly_invoices(date) to authenticated;