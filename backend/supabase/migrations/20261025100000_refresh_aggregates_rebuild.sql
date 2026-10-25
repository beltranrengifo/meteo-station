-- The version of 20261009100000 that was applied (its SQL is kept in
-- supabase_migrations.schema_migrations) did not have refresh_aggregates_rebuild(), so the
-- database never got it. Same body as in that file. AGENTS.md asks for it after deleting or
-- editing rows in public.readings.
create or replace function public.refresh_aggregates_rebuild()
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- Same lock as the cron job, so they never run at the same time.
  perform 1 from public.aggregates_state for update;
  delete from public.readings_hourly;
  delete from public.readings_daily;
  perform public.refresh_aggregates_since('-infinity');
end;
$$;

-- Not callable through the API (functions in public are exposed as RPC otherwise).
revoke execute on function public.refresh_aggregates_rebuild() from public, anon, authenticated;
