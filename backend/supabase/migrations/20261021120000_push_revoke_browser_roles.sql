-- Defence in depth, like the other tables: the push tables are only for service_role, and the
-- first migration did not revoke the browser roles on them.
revoke all on table public.push_subscriptions from anon, authenticated;
revoke all on table public.push_requests from anon, authenticated;
revoke all on table public.push_daily_runs from anon, authenticated;
