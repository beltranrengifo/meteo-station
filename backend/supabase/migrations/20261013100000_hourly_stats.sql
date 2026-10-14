-- Hourly statistics computed straight from public.readings, for any time range.
-- The "7 días" view of the read API calls it so the latest hours are exact: the stored
-- aggregates can be up to 10 minutes behind (cron). The incremental refresh uses it too,
-- so the stored hours and the live ones always come from the same query.

-- Columns in the order of public.readings_hourly (the columns added later go last).
create or replace function public.hourly_stats(p_device_id text, p_from timestamptz, p_to timestamptz)
returns setof public.readings_hourly
language sql
stable
set search_path = ''
as $$
  select
    r.device_id,
    date_trunc('hour', r.ts) as hour,
    avg(r.temp_c), min(r.temp_c), max(r.temp_c),
    avg(r.humidity_pct),
    avg(r.pressure_hpa),
    avg(r.wind_avg_ms),
    max(r.wind_gust_ms),
    -- Circular mean: the arithmetic mean of 350 and 10 would wrongly give 180.
    (round(mod((degrees(atan2(avg(sin(radians(r.wind_dir_deg))), avg(cos(radians(r.wind_dir_deg))))) + 360)::numeric, 360))::integer % 360)::smallint,
    sum(r.rain_mm),
    count(*)::integer,
    -- When the extremes happened: the first reading with that value.
    (array_agg(r.ts order by r.temp_c asc, r.ts) filter (where r.temp_c is not null))[1],
    (array_agg(r.ts order by r.temp_c desc, r.ts) filter (where r.temp_c is not null))[1],
    min(r.humidity_pct), max(r.humidity_pct),
    min(r.pressure_hpa), max(r.pressure_hpa),
    (array_agg(r.ts order by r.wind_gust_ms desc, r.ts) filter (where r.wind_gust_ms is not null))[1]
  from public.readings r
  where r.device_id = p_device_id
    and r.ts >= p_from
    and r.ts < p_to
  group by r.device_id, date_trunc('hour', r.ts)
  order by hour
$$;

-- Same as before, but the hourly part now calls hourly_stats() for each touched hour.
-- The daily part is unchanged.
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
  insert into public.readings_hourly
  select s.*
  from touched t
  cross join lateral public.hourly_stats(t.device_id, t.hour, t.hour + interval '1 hour') s
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

-- Only the Vercel API (secret key, service_role) may call it; functions in public are
-- otherwise exposed as RPC to everyone.
revoke execute on function public.hourly_stats(text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.hourly_stats(text, timestamptz, timestamptz) to service_role;
revoke execute on function public.refresh_aggregates_since(timestamptz) from public, anon, authenticated;
