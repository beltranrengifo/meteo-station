-- 1. Aggregates also keep when the extremes happened, plus humidity and pressure ranges.
-- 2. The refresh becomes incremental: each run recomputes only the hours and days that received
--    readings since the previous run, however late they arrive (a batch sent after an outage
--    lands in the hours it was measured, not in the hour it arrived).

alter table public.readings_hourly
  add column temp_min_at       timestamptz,
  add column temp_max_at       timestamptz,
  add column humidity_min      real,
  add column humidity_max      real,
  add column pressure_min      real,
  add column pressure_max      real,
  add column wind_gust_max_at  timestamptz;

alter table public.readings_daily
  add column temp_min_at       timestamptz,
  add column temp_max_at       timestamptz,
  add column humidity_min      real,
  add column humidity_max      real,
  add column pressure_min      real,
  add column pressure_max      real,
  add column wind_gust_max_at  timestamptz;

-- Finds the readings that arrived since the last run without scanning the whole table.
create index readings_inserted_at_idx on public.readings (inserted_at);

-- One row: when the incremental refresh last ran.
create table public.aggregates_state (
  id           boolean primary key default true check (id),
  last_run_at  timestamptz not null
);
alter table public.aggregates_state enable row level security;
revoke all on table public.aggregates_state from anon, authenticated;

-- Recomputes every hour and local day that has at least one reading inserted after
-- p_inserted_since. Whole hours and days are recomputed, so the result is always exact.
-- Full rebuild: select public.refresh_aggregates_since('-infinity');
create or replace function public.refresh_aggregates_since(p_inserted_since timestamptz)
returns void
language sql
set search_path = ''
as $$
  with touched as (
    select distinct device_id, date_trunc('hour', ts) as hour
    from public.readings
    where inserted_at > p_inserted_since
  )
  insert into public.readings_hourly as h (
    device_id, hour,
    temp_avg, temp_min, temp_min_at, temp_max, temp_max_at,
    humidity_avg, humidity_min, humidity_max,
    pressure_avg, pressure_min, pressure_max,
    wind_avg_ms, wind_gust_max, wind_gust_max_at, wind_dir_deg,
    rain_mm, samples
  )
  select
    t.device_id,
    t.hour,
    avg(r.temp_c), min(r.temp_c),
    -- When it happened: the first reading with that value.
    (array_agg(r.ts order by r.temp_c asc, r.ts) filter (where r.temp_c is not null))[1],
    max(r.temp_c),
    (array_agg(r.ts order by r.temp_c desc, r.ts) filter (where r.temp_c is not null))[1],
    avg(r.humidity_pct), min(r.humidity_pct), max(r.humidity_pct),
    avg(r.pressure_hpa), min(r.pressure_hpa), max(r.pressure_hpa),
    avg(r.wind_avg_ms),
    max(r.wind_gust_ms),
    (array_agg(r.ts order by r.wind_gust_ms desc, r.ts) filter (where r.wind_gust_ms is not null))[1],
    -- Circular mean: the arithmetic mean of 350 and 10 would wrongly give 180.
    (round(mod((degrees(atan2(avg(sin(radians(r.wind_dir_deg))), avg(cos(radians(r.wind_dir_deg))))) + 360)::numeric, 360))::integer % 360)::smallint,
    sum(r.rain_mm),
    count(*)
  from touched t
  join public.readings r
    on r.device_id = t.device_id
   and r.ts >= t.hour
   and r.ts < t.hour + interval '1 hour'
  group by t.device_id, t.hour
  on conflict (device_id, hour) do update set
    temp_avg = excluded.temp_avg,
    temp_min = excluded.temp_min,
    temp_min_at = excluded.temp_min_at,
    temp_max = excluded.temp_max,
    temp_max_at = excluded.temp_max_at,
    humidity_avg = excluded.humidity_avg,
    humidity_min = excluded.humidity_min,
    humidity_max = excluded.humidity_max,
    pressure_avg = excluded.pressure_avg,
    pressure_min = excluded.pressure_min,
    pressure_max = excluded.pressure_max,
    wind_avg_ms = excluded.wind_avg_ms,
    wind_gust_max = excluded.wind_gust_max,
    wind_gust_max_at = excluded.wind_gust_max_at,
    wind_dir_deg = excluded.wind_dir_deg,
    rain_mm = excluded.rain_mm,
    samples = excluded.samples;

  with touched as (
    select distinct device_id, (ts at time zone 'Europe/Madrid')::date as day
    from public.readings
    where inserted_at > p_inserted_since
  )
  insert into public.readings_daily as d (
    device_id, day,
    temp_avg, temp_min, temp_min_at, temp_max, temp_max_at,
    humidity_avg, humidity_min, humidity_max,
    pressure_avg, pressure_min, pressure_max,
    wind_avg_ms, wind_gust_max, wind_gust_max_at, wind_dir_deg,
    rain_mm, samples
  )
  select
    t.device_id,
    t.day,
    avg(r.temp_c), min(r.temp_c),
    (array_agg(r.ts order by r.temp_c asc, r.ts) filter (where r.temp_c is not null))[1],
    max(r.temp_c),
    (array_agg(r.ts order by r.temp_c desc, r.ts) filter (where r.temp_c is not null))[1],
    avg(r.humidity_pct), min(r.humidity_pct), max(r.humidity_pct),
    avg(r.pressure_hpa), min(r.pressure_hpa), max(r.pressure_hpa),
    avg(r.wind_avg_ms),
    max(r.wind_gust_ms),
    (array_agg(r.ts order by r.wind_gust_ms desc, r.ts) filter (where r.wind_gust_ms is not null))[1],
    (round(mod((degrees(atan2(avg(sin(radians(r.wind_dir_deg))), avg(cos(radians(r.wind_dir_deg))))) + 360)::numeric, 360))::integer % 360)::smallint,
    sum(r.rain_mm),
    count(*)
  from touched t
  join public.readings r
    on r.device_id = t.device_id
   -- Local midnight to local midnight, written as a ts range so the (device_id, ts) index is used.
   and r.ts >= (t.day::timestamp at time zone 'Europe/Madrid')
   and r.ts < ((t.day + 1)::timestamp at time zone 'Europe/Madrid')
  group by t.device_id, t.day
  on conflict (device_id, day) do update set
    temp_avg = excluded.temp_avg,
    temp_min = excluded.temp_min,
    temp_min_at = excluded.temp_min_at,
    temp_max = excluded.temp_max,
    temp_max_at = excluded.temp_max_at,
    humidity_avg = excluded.humidity_avg,
    humidity_min = excluded.humidity_min,
    humidity_max = excluded.humidity_max,
    pressure_avg = excluded.pressure_avg,
    pressure_min = excluded.pressure_min,
    pressure_max = excluded.pressure_max,
    wind_avg_ms = excluded.wind_avg_ms,
    wind_gust_max = excluded.wind_gust_max,
    wind_gust_max_at = excluded.wind_gust_max_at,
    wind_dir_deg = excluded.wind_dir_deg,
    rain_mm = excluded.rain_mm,
    samples = excluded.samples;
$$;

-- What the cron job runs: everything inserted since the previous run.
create or replace function public.refresh_aggregates_incremental()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_started timestamptz := now();
  v_last    timestamptz;
begin
  -- Locks the state row, so two runs can never overlap.
  select last_run_at into v_last from public.aggregates_state for update;
  -- 5 minutes of overlap: an insert that was still in flight during the previous run has an
  -- inserted_at slightly before that run started, and must not be skipped.
  perform public.refresh_aggregates_since(v_last - interval '5 minutes');
  update public.aggregates_state set last_run_at = v_started;
end;
$$;

-- Run by hand after deleting or editing readings: neither changes inserted_at, so the
-- incremental refresh would not notice. Empties both tables (no orphan hours or days left)
-- and rebuilds them from public.readings.
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
revoke execute on function public.refresh_aggregates_since(timestamptz) from public, anon, authenticated;
revoke execute on function public.refresh_aggregates_incremental() from public, anon, authenticated;
revoke execute on function public.refresh_aggregates_rebuild() from public, anon, authenticated;

-- Same job name: pg_cron replaces the old 48-hour command.
select cron.schedule(
  'refresh-aggregates',
  '*/10 * * * *',
  $$select public.refresh_aggregates_incremental()$$
);

drop function public.refresh_aggregates(timestamptz);

-- Fill the new columns for the data already stored, then start the incremental runs from now.
select public.refresh_aggregates_since('-infinity');
insert into public.aggregates_state (last_run_at) values (now());
