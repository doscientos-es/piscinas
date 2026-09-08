-- Technicians need the customer and installation names in their assigned
-- agenda, without gaining access to the rest of the customer portfolio.

create policy "technicians read assigned installations" on public.installations
  for select to authenticated
  using (
    exists (
      select 1
      from public.visits
      where public.visits.installation_id = public.installations.id
        and public.visits.technician_id = (select auth.uid())
    )
  );

create policy "technicians read assigned clients" on public.clients
  for select to authenticated
  using (
    exists (
      select 1
      from public.installations
      join public.visits on public.visits.installation_id = public.installations.id
      where public.installations.client_id = public.clients.id
        and public.visits.technician_id = (select auth.uid())
    )
  );