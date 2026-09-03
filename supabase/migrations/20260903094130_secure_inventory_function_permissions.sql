-- Explicitly revoke legacy role grants as well as PUBLIC grants. Some projects
-- have inherited EXECUTE for anon on existing RPC functions.
revoke all on function public.record_inventory_movement(uuid, numeric, text, text, numeric) from anon;
revoke all on function public.complete_visit(uuid, text, jsonb) from anon;

grant execute on function public.record_inventory_movement(uuid, numeric, text, text, numeric) to authenticated;
grant execute on function public.complete_visit(uuid, text, jsonb) to authenticated;
