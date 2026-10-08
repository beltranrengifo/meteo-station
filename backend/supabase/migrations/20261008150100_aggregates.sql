-- Hourly and daily aggregates, so long-range charts never scan millions of raw rows.
-- They are derived data: refresh_aggregates() can rebuild any range from public.readings.

create table public.readings_hourly (
  device_id      text        not null,
  hour           timestamptz not null,  -- UTC hour start
  temp_avg       real,
  temp_min       real,
  temp_max       real,
  humidity_avg   real,
  pressure_avg   real,
  wind_avg_ms    real,
  wind_gust_max  real,
  wind_dir_deg   smallint,              -- circular mean
  rain_mm        real,
  samples        integer     not null,
  primary key (device_id, hour)
);

create table public.readings_daily (
  device_id      text not null,
  day            date not null,         -- local day in Europe/Madrid ("rain since midnight")
  temp_avg       real,
  temp_min       real,
  temp_max       real,
  humidity_avg   real,
  pressure_avg   real,
  wind_avg_ms    real,
  wind_gust_max  real,
  wind_dir_deg   smallint,              -- circular mean
  rain_mm        real,
  samples        integer not null,
  primary key (device_id, day)
);

alter table public.readings_hourly enable row level security;
alter table public.readings_daily enable row level security;
revoke all on table public.readings_hourly from anon, authenticated;
revoke all on table public.readings_daily from anon, authenticated;

-- Recomputes every hour and every local day that starts at or after p_since's hour/day.
-- Whole hours and days are recomputed, so late readings (sent from the station buffer) are picked up.
create or replace function public.refresh_aggregates(p_since timestamptz)
returns void
language sql
set search_path = ''
as $$
  insert into public.readings_hourly as h (
    device_id, hour, temp_avg, temp_min, temp_max, humidity_avg, pressure_avg,
    wind_avg_ms, wind_gust_max, wind_dir_deg, rain_mm, samples
  )
  select
    device_id,
    date_trunc('hour', ts),
    avg(temp_c), min(temp_c), max(temp_c),
    avg(humidity_pct),
    avg(pressure_hpa),
    avg(wind_avg_ms),
    max(wind_gust_ms),
    -- Circular mean: the arithmetic mean of 350 and 10 would wrongly give 180.
    (round(mod((degrees(atan2(avg(sin(radians(wind_dir_deg))), avg(cos(radians(wind_dir_deg))))) + 360)::numeric, 360))::integer % 360)::smallint,
    sum(rain_mm),
    count(*)
  from public.readings
  where ts >= date_trunc('hour', p_since)
  group by device_id, date_trunc('hour', ts)
  on conflict (device_id, hour) do update set
    temp_avg = excluded.temp_avg,
    temp_min = excluded.temp_min,
    temp_max = excluded.temp_max,
    humidity_avg = excluded.humidity_avg,
    pressure_avg = excluded.pressure_avg,
    wind_avg_ms = excluded.wind_avg_ms,
    wind_gust_max = excluded.wind_gust_max,
    wind_dir_deg = excluded.wind_dir_deg,
    rain_mm = excluded.rain_mm,
    samples = excluded.samples;

  insert into public.readings_daily as d (
    device_id, day, temp_avg, temp_min, temp_max, humidity_avg, pressure_avg,
    wind_avg_ms, wind_gust_max, wind_dir_deg, rain_mm, samples
  )
  select
    device_id,
    (ts at time zone 'Europe/Madrid')::date,
    avg(temp_c), min(temp_c), max(temp_c),
    avg(humidity_pct),
    avg(pressure_hpa),
    avg(wind_avg_ms),
    max(wind_gust_ms),
    (round(mod((degrees(atan2(avg(sin(radians(wind_dir_deg))), avg(cos(radians(wind_dir_deg))))) + 360)::numeric, 360))::integer % 360)::smallint,
    sum(rain_mm),
    count(*)
  from public.readings
  -- Start of the local day that contains p_since.
  where ts >= (date_trunc('day', p_since at time zone 'Europe/Madrid') at time zone 'Europe/Madrid')
  group by device_id, (ts at time zone 'Europe/Madrid')::date
  on conflict (device_id, day) do update set
    temp_avg = excluded.temp_avg,
    temp_min = excluded.temp_min,
    temp_max = excluded.temp_max,
    humidity_avg = excluded.humidity_avg,
    pressure_avg = excluded.pressure_avg,
    wind_avg_ms = excluded.wind_avg_ms,
    wind_gust_max = excluded.wind_gust_max,
    wind_dir_deg = excluded.wind_dir_deg,
    rain_mm = excluded.rain_mm,
    samples = excluded.samples;
$$;

-- Not callable through the API (functions in public are exposed as RPC otherwise).
revoke execute on function public.refresh_aggregates(timestamptz) from public, anon, authenticated;

-- Every 10 minutes, recompute the last 48 hours: covers the current hour/day and any
-- readings the station re-sends after a WiFi outage (its buffer holds up to 24 h).
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'refresh-aggregates',
  '*/10 * * * *',
  $$select public.refresh_aggregates(now() - interval '48 hours')$$
);

-- pg_cron keeps every run in cron.job_run_details forever; keep one week.
select cron.schedule(
  'purge-cron-history',
  '30 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
