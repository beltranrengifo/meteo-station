-- Firmware for over-the-air updates. The .bin files live in a private Storage bucket: no
-- policies, so only the secret key (ingest function, publish script) can read or write them,
-- and a station downloads its update through a short-lived signed URL.
-- Size limit: one OTA app partition of the default ESP32 partition table (0x140000 bytes).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('firmware', 'firmware', false, 1310720, array['application/octet-stream']);

-- One row per published firmware build.
create table public.firmware_releases (
  version     text        primary key check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  path        text        not null unique,  -- object path in the firmware bucket
  sha256      text        not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes  integer     not null check (size_bytes between 1 and 1310720),
  notes       text,
  created_at  timestamptz not null default now()
);

alter table public.firmware_releases enable row level security;
revoke all on table public.firmware_releases from anon, authenticated;
-- The publish script adds releases; the ingest function reads them.
grant select, insert on table public.firmware_releases to service_role;

-- The version each station should run. Null: leave it on whatever it has. Set it by hand,
-- one station at a time (the bench board first), once its release is published.
alter table public.devices
  add column target_fw text references public.firmware_releases (version);
