-- `pnpm firmware target` sets a station's target version with the secret key. Only that
-- column: keys, names and active stay read-only to it.
grant update (target_fw) on table public.devices to service_role;
