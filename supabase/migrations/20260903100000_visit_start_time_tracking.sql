-- A visit start is an attendance record. The server owns its official timestamp,
-- while the browser supplies a GPS point and its stated precision.

alter table public.interventions
  add column start_latitude numeric(9, 6),
  add column start_longitude numeric(9, 6),
  add column start_location_accuracy_m numeric(8, 2),
  add column start_location_recorded_at timestamptz,
  add column start_outside_schedule_confirmed boolean not null default false,
  add constraint interventions_start_latitude_range
    check (start_latitude is null or start_latitude between -90 and 90),
  add constraint interventions_start_longitude_range
    check (start_longitude is null or start_longitude between -180 and 180),
  add constraint interventions_start_accuracy_range
    check (start_location_accuracy_m is null or start_location_accuracy_m between 0 and 10000);

create index interventions_started_at_idx on public.interventions(started_at desc)
  where started_at is not null;

-- The old signature accepted an unverified start with no position, so remove it.
drop function public.start_visit(uuid);

create function public.start_visit(
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

  select * into v_visit
  from public.visits
  where id = p_visit_id
  for update;

  if not found then
    raise exception 'La visita no existe.' using errcode = 'P0002';
  end if;

  select role = 'admin' into v_is_admin
  from public.profiles
  where id = (select auth.uid());

  if not coalesce(v_is_admin, false)
    and v_visit.technician_id is distinct from (select auth.uid()) then
    raise exception 'No tienes permiso para iniciar esta visita.' using errcode = '42501';
  end if;

  if v_visit.status = 'scheduled' then
    update public.visits set status = 'in_progress' where id = p_visit_id;
  elsif v_visit.status <> 'in_progress' then
    raise exception 'Esta visita no se puede iniciar porque ya está cerrada o cancelada.' using errcode = 'P0001';
  end if;

  insert into public.interventions (
    visit_id, started_at, start_latitude, start_longitude, start_location_accuracy_m,
    start_location_recorded_at, start_outside_schedule_confirmed, customer_notice_status
  )
  values (
    p_visit_id, now(), p_start_latitude, p_start_longitude, p_start_accuracy_m,
    now(), p_start_outside_schedule_confirmed, 'not_sent'
  )
  on conflict (visit_id) do update
    set start_latitude = coalesce(public.interventions.start_latitude, excluded.start_latitude),
        start_longitude = coalesce(public.interventions.start_longitude, excluded.start_longitude),
        start_location_accuracy_m = coalesce(
          public.interventions.start_location_accuracy_m,
          excluded.start_location_accuracy_m
        ),
        start_location_recorded_at = coalesce(
          public.interventions.start_location_recorded_at,
          excluded.start_location_recorded_at
        ),
        start_outside_schedule_confirmed = public.interventions.start_outside_schedule_confirmed
          or excluded.start_outside_schedule_confirmed,
        started_at = coalesce(public.interventions.started_at, excluded.started_at)
  returning started_at into v_started_at;

  return v_started_at;
end;
$$;

revoke all on function public.start_visit(uuid, numeric, numeric, numeric, boolean) from public;
grant execute on function public.start_visit(uuid, numeric, numeric, numeric, boolean) to authenticated;

-- Technicians retain read access to their work, but attendance fields are now
-- only written by the security-definer RPC above.
drop policy "technicians manage assigned interventions" on public.interventions;

create policy "technicians read assigned interventions" on public.interventions
  for select to authenticated
  using (
    exists (
      select 1 from public.visits
      where public.visits.id = public.interventions.visit_id
        and public.visits.technician_id = (select auth.uid())
    )
  );