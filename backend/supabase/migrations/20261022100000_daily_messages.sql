-- The day's notification as it was sent, for the "El aviso de hoy" card in the app. Written on
-- every send (the 9:05 cron and ?mode=send-now), apart from push_daily_runs so a test send
-- never claims the day. One row per Madrid date; a later send that day replaces it.
create table public.daily_messages (
  day date primary key,
  title text not null,
  body text not null,
  sent_at timestamptz not null default now()
);

alter table public.daily_messages enable row level security;
revoke all on table public.daily_messages from anon, authenticated;

-- The Vercel API (secret key) writes it from the cron and reads it for /api/daily-summary.
-- The upsert by day updates every column it sends, day included.
grant select, insert on table public.daily_messages to service_role;
grant update (day, title, body, sent_at) on table public.daily_messages to service_role;
