-- Configurable attendance policy, optional installation geofence and immutable event history.

alter table public.installations
  add column location_latitude numeric(9, 6),
  add column location_longitude numeric(9, 6),
  add constraint installations_location_latitude_range
    check (location_latitude is null or location_latitude between -90 and 90),
  add constraint installations_location_longitude_range
    check (location_longitude is null or location_longitude between -180 and 180),
  add constraint installations_location_pair_check
    check ((location_latitude is null) = (location_longitude is null));

create table public.time_tracking_settings (
  id boolean primary key default true check (id),
  timezone text not null default 'Europe/Madrid' check (length(btrim(timezone)) > 0),
  early_start_tolerance_minutes smallint not null default 15 check (early_start_tolerance_minutes between 0 and 240),
  late_start_tolerance_minutes smallint not null default 90 check (late_start_tolerance_minutes between 0 and 480),
  geofence_radius_m integer not null default 250 check (geofence_radius_m between 25 and 5000),
  max_location_accuracy_m integer not null default 200 check (max_location_accuracy_m between 10 and 5000),
  require_exception_reason boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.time_tracking_settings (id) values (true) on conflict (id) do nothing;

create table public.visit_time_events (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  technician_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('start', 'finish')),
  recorded_at timestamptz not null default clock_timestamp(),
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  location_accuracy_m numeric(8, 2),
  distance_to_installation_m numeric(10, 2),
  scheduled_delta_minutes integer,
  exception_reasons text[] not null default '{}',
  exception_reason text,
  policy_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null)),
  check (location_accuracy_m is null or location_accuracy_m between 0 and 10000)
);

create index visit_time_events_visit_recorded_idx
  on public.visit_time_events(visit_id, recorded_at desc);
create index visit_time_events_exception_idx
  on public.visit_time_events(recorded_at desc)
  where cardinality(exception_reasons) > 0;

alter table public.time_tracking_settings enable row level security;
alter table public.visit_time_events enable row level security;
revoke all on table public.time_tracking_settings, public.visit_time_events from anon, authenticated;
grant select on table public.time_tracking_settings, public.visit_time_events to authenticated;
grant update on table public.time_tracking_settings to authenticated;

create policy "authenticated read time tracking settings" on public.time_tracking_settings
  for select to authenticated using (true);
create policy "admins update time tracking settings" on public.time_tracking_settings
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins read visit time events" on public.visit_time_events
  for select to authenticated using ((select public.is_admin()));
create policy "technicians read own visit time events" on public.visit_time_events
  for select to authenticated using (
    exists (
      select 1 from public.visits
      where public.visits.id = public.visit_time_events.visit_id
        and public.visits.technician_id = (select auth.uid())
    )
  );

create or replace function public.set_time_tracking_settings_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = clock_timestamp();
  new.updated_by = auth.uid();
  return new;
end;
$$;

create trigger time_tracking_settings_set_updated_at
before update on public.time_tracking_settings
for each row execute procedure public.set_time_tracking_settings_updated_at();

drop function public.start_visit(uuid, numeric, numeric, numeric, boolean);

create function public.start_visit(
  p_visit_id uuid,
  p_start_latitude numeric,
  p_start_longitude numeric,
  p_start_accuracy_m numeric,
  p_start_outside_schedule_confirmed boolean default false,
  p_exception_reason text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit public.visits%rowtype;
  v_intervention public.interventions%rowtype;
  v_policy public.time_tracking_settings%rowtype;
  v_installation_latitude numeric;
  v_installation_longitude numeric;
  v_recorded_at timestamptz := clock_timestamp();
  v_started_at timestamptz;
  v_distance_m numeric;
  v_delta_minutes integer;
  v_exception_reasons text[] := '{}';
  v_schedule_exception boolean := false;
begin
  if p_start_latitude is null or p_start_latitude not between -90 and 90
    or p_start_longitude is null or p_start_longitude not between -180 and 180
    or p_start_accuracy_m is null or p_start_accuracy_m not between 0 and 10000 then
    raise exception 'La ubicación recibida no es válida. Activa la ubicación precisa e inténtalo de nuevo.'
      using errcode = '22023';
  end if;

  select * into v_visit from public.visits where id = p_visit_id for update;
  if not found then raise exception 'La visita no existe.' using errcode = 'P0002'; end if;
  if (select role = 'admin' from public.profiles where id = (select auth.uid()))
    or v_visit.technician_id is distinct from (select auth.uid()) then
    raise exception 'Solo el técnico asignado puede iniciar esta visita.' using errcode = '42501';
  end if;
  if v_visit.status = 'scheduled' then
    update public.visits set status = 'in_progress' where id = p_visit_id;
  elsif v_visit.status <> 'in_progress' then
    raise exception 'Esta visita no se puede iniciar porque ya está cerrada o cancelada.' using errcode = 'P0001';
  end if;

  select * into v_policy from public.time_tracking_settings where id = true;
  select location_latitude, location_longitude into v_installation_latitude, v_installation_longitude
  from public.installations where id = v_visit.installation_id;
  v_delta_minutes := round(extract(epoch from v_recorded_at - v_visit.scheduled_for) / 60.0);
  if timezone(v_policy.timezone, v_recorded_at)::date
    <> timezone(v_policy.timezone, v_visit.scheduled_for)::date then
    v_exception_reasons := array_append(v_exception_reasons, 'different_day');
    v_schedule_exception := true;
  elsif v_delta_minutes < -v_policy.early_start_tolerance_minutes then
    v_exception_reasons := array_append(v_exception_reasons, 'too_early');
    v_schedule_exception := true;
  elsif v_delta_minutes > v_policy.late_start_tolerance_minutes then
    v_exception_reasons := array_append(v_exception_reasons, 'too_late');
    v_schedule_exception := true;
  end if;
  if p_start_accuracy_m > v_policy.max_location_accuracy_m then
    v_exception_reasons := array_append(v_exception_reasons, 'low_accuracy');
  end if;
  if v_installation_latitude is not null then
    v_distance_m := 2 * 6371000 * asin(sqrt(
      power(sin(radians(p_start_latitude - v_installation_latitude) / 2), 2)
      + cos(radians(v_installation_latitude)) * cos(radians(p_start_latitude))
      * power(sin(radians(p_start_longitude - v_installation_longitude) / 2), 2)
    ));
    if v_distance_m > v_policy.geofence_radius_m then
      v_exception_reasons := array_append(v_exception_reasons, 'outside_geofence');
    end if;
  end if;
  if cardinality(v_exception_reasons) > 0 and v_policy.require_exception_reason
    and nullif(btrim(p_exception_reason), '') is null then
    raise exception 'START_EXCEPTION: Debes indicar el motivo de esta excepción antes de iniciar.' using errcode = 'P0001';
  end if;

  select * into v_intervention from public.interventions where visit_id = p_visit_id for update;
  if not found then
    insert into public.interventions (
      visit_id, started_at, start_latitude, start_longitude, start_location_accuracy_m,
      start_location_recorded_at, start_outside_schedule_confirmed, customer_notice_status
    ) values (
      p_visit_id, v_recorded_at, p_start_latitude, p_start_longitude, p_start_accuracy_m,
      v_recorded_at, v_schedule_exception, 'not_sent'
    ) returning * into v_intervention;
  elsif v_intervention.started_at is null then
    update public.interventions set
      started_at = v_recorded_at, start_latitude = p_start_latitude, start_longitude = p_start_longitude,
      start_location_accuracy_m = p_start_accuracy_m, start_location_recorded_at = v_recorded_at,
      start_outside_schedule_confirmed = v_schedule_exception
    where id = v_intervention.id returning * into v_intervention;
  else
    update public.interventions set
      start_latitude = coalesce(start_latitude, p_start_latitude),
      start_longitude = coalesce(start_longitude, p_start_longitude),
      start_location_accuracy_m = coalesce(start_location_accuracy_m, p_start_accuracy_m),
      start_location_recorded_at = coalesce(start_location_recorded_at, v_recorded_at)
    where id = v_intervention.id returning * into v_intervention;
  end if;

  if v_intervention.started_at = v_recorded_at then
    insert into public.visit_time_events (
      visit_id, technician_id, event_type, recorded_at, latitude, longitude, location_accuracy_m,
      distance_to_installation_m, scheduled_delta_minutes, exception_reasons, exception_reason, policy_snapshot
    ) values (
      p_visit_id, (select auth.uid()), 'start', v_recorded_at, p_start_latitude, p_start_longitude,
      p_start_accuracy_m, v_distance_m, v_delta_minutes, v_exception_reasons,
      nullif(btrim(p_exception_reason), ''), jsonb_build_object(
        'timezone', v_policy.timezone, 'early_start_tolerance_minutes', v_policy.early_start_tolerance_minutes,
        'late_start_tolerance_minutes', v_policy.late_start_tolerance_minutes,
        'geofence_radius_m', v_policy.geofence_radius_m,
        'max_location_accuracy_m', v_policy.max_location_accuracy_m
      )
    );
  end if;
  return v_intervention.started_at;
end;
$$;

revoke all on function public.start_visit(uuid, numeric, numeric, numeric, boolean, text) from public;
grant execute on function public.start_visit(uuid, numeric, numeric, numeric, boolean, text) to authenticated;

create or replace function public.log_visit_finished_time_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from 'completed'::public.visit_status
    and new.status = 'completed'::public.visit_status then
    insert into public.visit_time_events (visit_id, technician_id, event_type, recorded_at, policy_snapshot)
    values (new.id, (select auth.uid()), 'finish', clock_timestamp(), '{}'::jsonb);
  end if;
  return new;
end;
$$;

create trigger visits_log_finished_time_event
after update of status on public.visits
for each row execute procedure public.log_visit_finished_time_event();
