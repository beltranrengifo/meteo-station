-- New Supabase projects do not grant table privileges to the API roles by default, not even
-- to service_role (the role behind the secret key). Grant only what the server side needs:
-- the ingest function inserts readings, the Vercel API reads everything.
grant select, insert on table public.readings to service_role;
grant select on table public.readings_hourly to service_role;
grant select on table public.readings_daily to service_role;
