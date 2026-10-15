-- One row per station. Each station has its own key, and only the key's SHA-256 is stored:
-- the ingest function finds the station by the hash of the x-device-key header, so the
-- device_id of a reading comes from its key. Setting active = false shuts one station out.
create table public.devices (
  device_id   text        primary key check (device_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  name        text        not null,
  key_sha256  text        not null unique check (key_sha256 ~ '^[0-9a-f]{64}$'),
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);

-- Same as readings: no policies, only the secret key (ingest function) reads it.
alter table public.devices enable row level security;
revoke all on table public.devices from anon, authenticated;
grant select on table public.devices to service_role;
