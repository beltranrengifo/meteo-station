-- Remote log: a station with no USB cable can only tell what happens to it through its uploads.

-- Health with every reading. Null for readings from firmware older than 0.4.0.
alter table public.readings
  add column free_heap        integer check (free_heap >= 0),        -- bytes free when the reading was taken
  add column wifi_disconnects integer check (wifi_disconnects >= 0); -- WiFi drops since boot

-- What happened on a station, sent with its next delivered upload: boots (with the reset
-- reason), OTA steps, WiFi lost and back, upload failures, the setup portal. Kept in RAM on
-- the board until delivered, so events before a reboot that never reached the server are lost;
-- the boot event's reset reason says why it rebooted.
create table public.device_events (
  id          bigint generated always as identity primary key,
  device_id   text        not null references public.devices (device_id),
  ts          timestamptz not null,  -- UTC, to the second
  kind        text        not null check (kind ~ '^[a-z][a-z_]{0,31}$'),
  message     text        not null check (char_length(message) <= 200),
  inserted_at timestamptz not null default now(),
  -- Makes re-sent events idempotent, like readings.
  unique (device_id, ts, kind, message)
);

create index device_events_device_ts_idx on public.device_events (device_id, ts desc);

-- Same as readings: no policies, only the secret key (ingest function, pnpm station) uses it.
alter table public.device_events enable row level security;
revoke all on table public.device_events from anon, authenticated;
grant select, insert on table public.device_events to service_role;
