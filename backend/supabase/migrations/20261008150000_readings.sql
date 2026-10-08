-- Raw one-minute readings from the station. Never deleted: they are the source of truth.
create table public.readings (
  id            bigint generated always as identity primary key,
  device_id     text        not null,
  ts            timestamptz not null,   -- UTC, minute boundary at the end of the measured minute
  temp_c        real,
  humidity_pct  real        check (humidity_pct between 0 and 100),
  pressure_hpa  real,
  wind_avg_ms   real        check (wind_avg_ms >= 0),
  wind_gust_ms  real        check (wind_gust_ms >= 0),
  wind_dir_deg  smallint    check (wind_dir_deg between 0 and 359),
  rain_mm       real        not null default 0 check (rain_mm >= 0),  -- rain of this minute only
  rssi          smallint,
  uptime_s      integer,
  fw            text,
  inserted_at   timestamptz not null default now(),
  -- Makes re-sent batches idempotent: the same reading can arrive twice and is stored once.
  unique (device_id, ts)
);

create index readings_ts_idx on public.readings (ts desc);

-- No policies on purpose: the publishable (anon) key cannot read or write anything.
-- The ingest Edge Function and the Vercel API use the secret key, which bypasses RLS.
alter table public.readings enable row level security;
revoke all on table public.readings from anon, authenticated;
