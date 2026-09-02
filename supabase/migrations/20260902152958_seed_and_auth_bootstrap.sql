create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  initial_role public.user_role;
begin
  perform pg_advisory_xact_lock(837411);
  select case when count(*) = 0 then 'admin'::public.user_role else 'technician'::public.user_role end
  into initial_role
  from public.profiles;

  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), initial_role);
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.clients (legal_name, tax_id, billing_email, phone, billing_address, payment_method)
values
  ('Residencial Miramar', 'B12345678', 'administracion@miramar.example', '+34 930 000 001', 'Av. del Mar, 18', 'transfer'),
  ('Casa Sol', '12345678Z', 'hola@casasol.example', '+34 930 000 002', 'C/ Jazmín, 6', 'card'),
  ('Hotel Arena', 'B87654321', 'mantenimiento@hotelarena.example', '+34 930 000 003', 'Paseo de la Playa, 4', 'transfer');

insert into public.installations (client_id, name, address, pool_type, instructions)
select id, 'Piscina comunitaria', billing_address, 'Comunitaria', 'Acceso por conserjería. Revisar filtro tras el temporal.' from public.clients where legal_name = 'Residencial Miramar'
union all
select id, 'Piscina principal', billing_address, 'Privada', 'Avisar por el timbre lateral. Dejar la cubierta recogida.' from public.clients where legal_name = 'Casa Sol'
union all
select id, 'Piscina exterior', billing_address, 'Hotel', 'Coordinar la visita con mantenimiento del hotel.' from public.clients where legal_name = 'Hotel Arena';

insert into public.maintenance_templates (name, pool_type) values ('Mantenimiento estándar', 'General');
insert into public.template_tasks (template_id, label, sort_order)
select id, task, position
from public.maintenance_templates,
unnest(array['Limpiar superficie y cestos', 'Revisar filtración', 'Limpiar filtro']) with ordinality as t(task, position)
where name = 'Mantenimiento estándar';

insert into public.products (name, reference, category, unit, sale_price, vat_rate, stock_quantity)
values ('Cloro granulado', 'CL-GR-25', 'Tratamiento', 'kg', 4.52, 21, 120);

insert into public.contracts (installation_id, template_id, visits_per_week, weekdays, scheduled_time, monthly_fee, starts_on, payment_method)
select i.id, t.id, 1, array[3]::smallint[], '09:00', 180, current_date - 30, 'transfer'
from public.installations i cross join public.maintenance_templates t
where i.name = 'Piscina comunitaria' and t.name = 'Mantenimiento estándar';

insert into public.visits (installation_id, contract_id, scheduled_for, status)
select i.id, c.id, date_trunc('day', now()) + interval '9 hours', 'scheduled'
from public.installations i join public.contracts c on c.installation_id = i.id
where i.name = 'Piscina comunitaria';

insert into public.invoices (client_id, number, issued_on, due_on, status, subtotal, vat_total, total)
select id, 'F-2026-001', current_date - 2, current_date + 28, 'draft', 180, 37.80, 217.80
from public.clients where legal_name = 'Residencial Miramar';
