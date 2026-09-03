-- Administrative notes are planned before a visit and are distinct from the technician's report.
alter table public.visits
  add column if not exists planning_notes text;