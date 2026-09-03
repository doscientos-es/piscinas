alter table public.products
  add column barcode_ean text,
  add column minimum_purchase_quantity integer,
  add column units_per_pallet integer,
  add column supplier text;

alter table public.products
  add constraint products_minimum_purchase_quantity_check
  check (minimum_purchase_quantity is null or minimum_purchase_quantity > 0),
  add constraint products_units_per_pallet_check
  check (units_per_pallet is null or units_per_pallet > 0);

create table public.product_purchase_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  quantity_tier text not null check (quantity_tier in ('unit', 'half_pallet', 'pallet', 'two_pallets', 'full_truck')),
  minimum_quantity numeric(12, 3),
  unit_cost numeric(12, 2) not null check (unit_cost >= 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  valid_from date not null default current_date,
  created_at timestamptz not null default now(),
  unique (product_id, quantity_tier, valid_from)
);

create index product_purchase_prices_product_validity_idx
  on public.product_purchase_prices(product_id, valid_from desc);

alter table public.product_purchase_prices enable row level security;
revoke all on table public.product_purchase_prices from anon, authenticated;
grant select on table public.product_purchase_prices to authenticated;
grant insert, update, delete on table public.product_purchase_prices to authenticated;

create policy "authenticated users read purchase prices" on public.product_purchase_prices
  for select to authenticated
  using (true);

create policy "admins manage purchase prices" on public.product_purchase_prices
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
