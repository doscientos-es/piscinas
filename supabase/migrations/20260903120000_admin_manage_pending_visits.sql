-- Administrators can schedule and maintain work before a technician starts it.
-- Field work and completed reports remain immutable from the administration UI.

drop policy if exists "admins manage visits" on public.visits;
drop policy if exists "admins read visits" on public.visits;
drop policy if exists "admins create scheduled visits" on public.visits;
drop policy if exists "admins update scheduled visits" on public.visits;
drop policy if exists "admins delete scheduled visits" on public.visits;

create policy "admins read visits" on public.visits
  for select to authenticated using ((select public.is_admin()));

create policy "admins create scheduled visits" on public.visits
  for insert to authenticated
  with check ((select public.is_admin()) and status = 'scheduled'::public.visit_status);

create policy "admins update scheduled visits" on public.visits
  for update to authenticated
  using ((select public.is_admin()) and status = 'scheduled'::public.visit_status)
  with check ((select public.is_admin()) and status = 'scheduled'::public.visit_status);

create policy "admins delete scheduled visits" on public.visits
  for delete to authenticated
  using ((select public.is_admin()) and status = 'scheduled'::public.visit_status);