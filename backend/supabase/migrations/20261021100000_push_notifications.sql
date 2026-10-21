-- Daily forecast push (docs/superpowers/specs/2026-10-21-daily-forecast-push-design.md).
-- Only the Vercel API (service_role, which bypasses RLS) touches these tables: RLS on and no
-- policies, so the browser keys get nothing.

create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);

-- One row per subscribe or unsubscribe request, for the limit per IP. The IP is stored only as
-- an HMAC. Rows older than a day are deleted every night.
create table public.push_requests (
  ip_hash text not null,
  at timestamptz not null default now()
);
create index push_requests_ip_hash_at on public.push_requests (ip_hash, at);

-- One row per day the notification went out (Madrid date). The day is claimed before sending,
-- so a repeated cron run never sends twice.
create table public.push_daily_runs (
  day date primary key,
  created_at timestamptz not null default now(),
  title text,
  body text,
  sent integer,
  failed integer,
  removed integer
);

alter table public.push_subscriptions enable row level security;
alter table public.push_requests enable row level security;
alter table public.push_daily_runs enable row level security;

-- The first delete the secret key gets, and only on subscriptions: unsubscribe, and endpoints
-- the push service reports gone (404, 410). Upserts update the endpoint and keys.
grant select, insert, delete on table public.push_subscriptions to service_role;
grant update (endpoint, p256dh, auth, last_sent_at) on table public.push_subscriptions to service_role;
grant select, insert on table public.push_requests to service_role;
grant select, insert on table public.push_daily_runs to service_role;
grant update (title, body, sent, failed, removed) on table public.push_daily_runs to service_role;

create extension if not exists pg_net with schema extensions;

-- 09:05 in Madrid is 07:05 UTC in summer and 08:05 UTC in winter: run at both, and the API acts
-- only when it is 9 in Madrid. The secret is read from Supabase Vault (name 'cron_secret'),
-- added by hand in the SQL editor, never in a migration.
select cron.schedule(
  'daily-forecast-push',
  '5 7,8 * * *',
  $$
  select net.http_post(
    url := 'https://gorraplanistas.vercel.app/api/cron/daily-forecast',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

select cron.schedule(
  'push-requests-cleanup',
  '30 3 * * *',
  $$delete from public.push_requests where at < now() - interval '1 day'$$
);
