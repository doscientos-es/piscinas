alter table public.clients
  add column trade_name text,
  add column contact_name text,
  add column contact_role text,
  add column contact_email text,
  add column contact_phone text,
  add column client_type text not null default 'residential'
    check (client_type in ('residential', 'community', 'hotel', 'business')),
  add column billing_frequency text not null default 'monthly'
    check (billing_frequency in ('monthly', 'quarterly', 'per_visit')),
  add column payment_terms_days smallint not null default 30
    check (payment_terms_days between 0 and 120),
  add column active boolean not null default true,
  add column updated_by uuid references public.profiles(id) on delete set null;

create index clients_active_legal_name_idx on public.clients(active, legal_name);

create or replace function public.set_client_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

create trigger clients_set_updated_at
before update on public.clients
for each row execute procedure public.set_client_updated_at();
