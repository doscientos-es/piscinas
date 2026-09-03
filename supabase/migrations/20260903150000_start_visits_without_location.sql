-- Starting a visit must not depend on the device location. The server keeps
-- the official timestamp and creates the intervention atomically.

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
begin
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
    insert into public.interventions (visit_id, started_at, customer_notice_status)
    values (p_visit_id, v_recorded_at, 'not_sent')
    returning * into v_intervention;

    insert into public.visit_time_events (
      visit_id, technician_id, event_type, recorded_at, policy_snapshot
    ) values (
      p_visit_id, (select auth.uid()), 'start', v_recorded_at, '{}'::jsonb
    );
  elsif v_intervention.started_at is null then
    update public.interventions
    set started_at = v_recorded_at
    where id = v_intervention.id
    returning * into v_intervention;

    insert into public.visit_time_events (
      visit_id, technician_id, event_type, recorded_at, policy_snapshot
    ) values (
      p_visit_id, (select auth.uid()), 'start', v_recorded_at, '{}'::jsonb
    );
  end if;

  return v_intervention.started_at;
end;
$$;
