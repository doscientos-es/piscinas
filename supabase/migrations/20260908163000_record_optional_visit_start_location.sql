-- Store the technician GPS position when the device provides it, without
-- preventing a visit from starting if location permission is unavailable.

create or replace function public.start_visit(
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
  v_recorded_at timestamptz := clock_timestamp();
  v_has_location boolean := p_start_latitude is not null;
begin
  if (p_start_latitude is null) <> (p_start_longitude is null)
    or (v_has_location and (
      p_start_latitude not between -90 and 90
      or p_start_longitude not between -180 and 180
      or p_start_accuracy_m is null
      or p_start_accuracy_m not between 0 and 10000
    ))
    or (not v_has_location and p_start_accuracy_m is not null) then
    raise exception 'La ubicación recibida no es válida.' using errcode = '22023';
  end if;

  select * into v_visit from public.visits where id = p_visit_id for update;
  if not found then
    raise exception 'La visita no existe.' using errcode = 'P0002';
  end if;
  if (select role = 'admin' from public.profiles where id = (select auth.uid()))
    or v_visit.technician_id is distinct from (select auth.uid()) then
    raise exception 'Solo el técnico asignado puede iniciar esta visita.' using errcode = '42501';
  end if;

  if v_visit.status = 'scheduled' then
    update public.visits set status = 'in_progress' where id = p_visit_id;
  elsif v_visit.status <> 'in_progress' then
    raise exception 'Esta visita no se puede iniciar porque ya está cerrada o cancelada.' using errcode = 'P0001';
  end if;

  select * into v_intervention from public.interventions where visit_id = p_visit_id for update;
  if not found then
    insert into public.interventions (
      visit_id, started_at, start_latitude, start_longitude, start_location_accuracy_m,
      start_location_recorded_at, customer_notice_status
    ) values (
      p_visit_id, v_recorded_at, p_start_latitude, p_start_longitude, p_start_accuracy_m,
      case when v_has_location then v_recorded_at end, 'not_sent'
    ) returning * into v_intervention;

    insert into public.visit_time_events (
      visit_id, technician_id, event_type, recorded_at, latitude, longitude, location_accuracy_m, policy_snapshot
    ) values (
      p_visit_id, (select auth.uid()), 'start', v_recorded_at,
      p_start_latitude, p_start_longitude, p_start_accuracy_m, '{}'::jsonb
    );
  elsif v_intervention.started_at is null then
    update public.interventions
    set started_at = v_recorded_at,
        start_latitude = p_start_latitude,
        start_longitude = p_start_longitude,
        start_location_accuracy_m = p_start_accuracy_m,
        start_location_recorded_at = case when v_has_location then v_recorded_at end
    where id = v_intervention.id
    returning * into v_intervention;

    insert into public.visit_time_events (
      visit_id, technician_id, event_type, recorded_at, latitude, longitude, location_accuracy_m, policy_snapshot
    ) values (
      p_visit_id, (select auth.uid()), 'start', v_recorded_at,
      p_start_latitude, p_start_longitude, p_start_accuracy_m, '{}'::jsonb
    );
  end if;

  return v_intervention.started_at;
end;
$$;

revoke all on function public.start_visit(uuid, numeric, numeric, numeric, boolean, text) from public;
grant execute on function public.start_visit(uuid, numeric, numeric, numeric, boolean, text) to authenticated;