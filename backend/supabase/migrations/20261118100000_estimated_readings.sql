-- Estimated values in public.readings, for the station's gaps and bad readings (meteo-0hq,
-- docs/superpowers/specs/2026-11-18-backfill-estimates.md). Filled by
-- backend/scripts/backfill-estimates.ts from Open-Meteo, calibrated against this station.
--
-- Each estimate is still one reading per minute, so hourly and daily aggregates weight it by
-- time like any measured minute and need no change. What is estimated is marked per field, and
-- every reading that gets an estimate keeps its original values in public.readings_originals.

-- The fields of the reading that are estimated, e.g. {wind_avg_ms,wind_gust_ms}.
-- Null: every value of the reading was measured by the station.
alter table public.readings
  add column estimated text[]
    constraint readings_estimated_fields check (
      estimated is null
      or (
        cardinality(estimated) > 0
        and estimated <@ array['temp_c', 'humidity_pct', 'pressure_hpa', 'wind_avg_ms',
                               'wind_gust_ms', 'wind_dir_deg', 'rain_mm']::text[]
      )
    );

-- One row for every reading the backfill inserted or changed, so it can always be undone.
create table public.readings_originals (
  device_id    text        not null,
  ts           timestamptz not null,
  -- The whole reading as the station stored it (to_jsonb of the row). Null when there was no
  -- reading for that minute and the backfill inserted one.
  original     jsonb,
  reason       text        not null,
  replaced_at  timestamptz not null default now(),
  primary key (device_id, ts)
);

-- Same as readings: no policies, nothing for the API roles. The backfill script connects with
-- SUPABASE_DB_URL (the secret key has no UPDATE on readings).
alter table public.readings_originals enable row level security;
revoke all on table public.readings_originals from anon, authenticated;
grant select on table public.readings_originals to service_role;
