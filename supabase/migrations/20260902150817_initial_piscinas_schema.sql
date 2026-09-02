create type public.user_role as enum ('admin', 'technician', 'accounting');
create type public.visit_status as enum ('scheduled', 'in_progress', 'completed', 'cancelled');
create type public.invoice_status as enum ('draft', 'issued', 'sent', 'paid', 'overdue', 'returned', 'void');
create type public.billing_item_status as enum ('pending', 'invoiced', 'void');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.user_role not null default 'technician',
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  tax_id text,
  billing_email text,
  phone text,
  billing_address text,
  payment_method text check (payment_method in ('direct_debit', 'transfer', 'card')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.installations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  address text not null,
  pool_type text,
  instructions text,
  notes text,
  photo_path text,
  created_at timestamptz not null default now()
);

create table public.maintenance_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pool_type text,
  required_readings text[] not null default array['chlorine', 'ph', 'alkalinity'],
  created_at timestamptz not null default now()
);

create table public.template_tasks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.maintenance_templates(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.installations(id) on delete cascade,
  template_id uuid references public.maintenance_templates(id) on delete set null,
  visits_per_week smallint not null check (visits_per_week in (1, 2)),
  weekdays smallint[] not null,
  scheduled_time time,
  monthly_fee numeric(12, 2) not null check (monthly_fee >= 0),
  starts_on date not null,
  ends_on date,
  active boolean not null default true,
  payment_method text check (payment_method in ('direct_debit', 'transfer')),
  terms text,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  reference text unique,
  category text,
  unit text not null,
  sale_price numeric(12, 2) not null check (sale_price >= 0),
  vat_rate numeric(5, 2) not null default 21 check (vat_rate >= 0),
  cost_price numeric(12, 2),
  stock_quantity numeric(12, 3) not null default 0,
  created_at timestamptz not null default now()
);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.installations(id) on delete restrict,
  contract_id uuid references public.contracts(id) on delete set null,
  technician_id uuid references public.profiles(id) on delete set null,
  scheduled_for timestamptz not null,
  status public.visit_status not null default 'scheduled',
  created_at timestamptz not null default now()
);

create table public.interventions (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null unique references public.visits(id) on delete cascade,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  repair_required boolean not null default false,
  customer_notice_status text not null default 'not_sent' check (customer_notice_status in ('not_sent', 'sent', 'failed')),
  created_at timestamptz not null default now()
);

create table public.intervention_tasks (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null references public.interventions(id) on delete cascade,
  label text not null,
  completed boolean not null default false
);

create table public.water_readings (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null references public.interventions(id) on delete cascade,
  metric text not null,
  value numeric(12, 3) not null,
  unit text
);

create table public.intervention_products (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null references public.interventions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  vat_rate numeric(5, 2) not null check (vat_rate >= 0)
);

create table public.work_extras (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid references public.interventions(id) on delete cascade,
  installation_id uuid not null references public.installations(id) on delete restrict,
  description text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  vat_rate numeric(5, 2) not null default 21 check (vat_rate >= 0),
  created_at timestamptz not null default now()
);

create table public.billing_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  installation_id uuid not null references public.installations(id) on delete restrict,
  intervention_product_id uuid unique references public.intervention_products(id) on delete restrict,
  work_extra_id uuid unique references public.work_extras(id) on delete restrict,
  description text not null,
  quantity numeric(12, 3) not null default 1,
  unit_price numeric(12, 2) not null,
  vat_rate numeric(5, 2) not null,
  status public.billing_item_status not null default 'pending',
  created_at timestamptz not null default now(),
  check (num_nonnulls(intervention_product_id, work_extra_id) = 1)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  number text unique,
  issued_on date,
  due_on date,
  status public.invoice_status not null default 'draft',
  subtotal numeric(12, 2) not null default 0,
  vat_total numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  pdf_path text,
  sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  billing_item_id uuid unique references public.billing_items(id) on delete restrict,
  description text not null,
  quantity numeric(12, 3) not null default 1,
  unit_price numeric(12, 2) not null,
  vat_rate numeric(5, 2) not null,
  line_total numeric(12, 2) not null
);

create index visits_technician_scheduled_idx on public.visits(technician_id, scheduled_for);
create index billing_items_client_status_idx on public.billing_items(client_id, status);
create index installations_client_idx on public.installations(client_id);

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.installations enable row level security;
alter table public.maintenance_templates enable row level security;
alter table public.template_tasks enable row level security;
alter table public.contracts enable row level security;
alter table public.products enable row level security;
alter table public.visits enable row level security;
alter table public.interventions enable row level security;
alter table public.intervention_tasks enable row level security;
alter table public.water_readings enable row level security;
alter table public.intervention_products enable row level security;
alter table public.work_extras enable row level security;
alter table public.billing_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;

create policy "profiles select own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "admins manage profiles" on public.profiles for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admins manage clients" on public.clients for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage installations" on public.installations for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage templates" on public.maintenance_templates for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage template tasks" on public.template_tasks for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage contracts" on public.contracts for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage products" on public.products for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage visits" on public.visits for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "technicians read assigned visits" on public.visits for select to authenticated using (technician_id = (select auth.uid()));
create policy "technicians update assigned visits" on public.visits for update to authenticated using (technician_id = (select auth.uid())) with check (technician_id = (select auth.uid()));

create policy "admins manage interventions" on public.interventions for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "technicians manage assigned interventions" on public.interventions for all to authenticated using (exists (select 1 from public.visits where visits.id = interventions.visit_id and visits.technician_id = (select auth.uid()))) with check (exists (select 1 from public.visits where visits.id = interventions.visit_id and visits.technician_id = (select auth.uid())));

create policy "intervention records follow visit access" on public.intervention_tasks for all to authenticated using (exists (select 1 from public.interventions join public.visits on visits.id = interventions.visit_id where interventions.id = intervention_tasks.intervention_id and ((select public.is_admin()) or visits.technician_id = (select auth.uid())))) with check (exists (select 1 from public.interventions join public.visits on visits.id = interventions.visit_id where interventions.id = intervention_tasks.intervention_id and ((select public.is_admin()) or visits.technician_id = (select auth.uid()))));
create policy "readings follow visit access" on public.water_readings for all to authenticated using (exists (select 1 from public.interventions join public.visits on visits.id = interventions.visit_id where interventions.id = water_readings.intervention_id and ((select public.is_admin()) or visits.technician_id = (select auth.uid())))) with check (exists (select 1 from public.interventions join public.visits on visits.id = interventions.visit_id where interventions.id = water_readings.intervention_id and ((select public.is_admin()) or visits.technician_id = (select auth.uid()))));
create policy "products in intervention follow visit access" on public.intervention_products for all to authenticated using (exists (select 1 from public.interventions join public.visits on visits.id = interventions.visit_id where interventions.id = intervention_products.intervention_id and ((select public.is_admin()) or visits.technician_id = (select auth.uid())))) with check (exists (select 1 from public.interventions join public.visits on visits.id = interventions.visit_id where interventions.id = intervention_products.intervention_id and ((select public.is_admin()) or visits.technician_id = (select auth.uid()))));
create policy "admins manage extras" on public.work_extras for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage billing items" on public.billing_items for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage invoices" on public.invoices for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage invoice lines" on public.invoice_lines for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
