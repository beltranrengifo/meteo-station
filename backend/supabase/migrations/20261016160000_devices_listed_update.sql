-- `pnpm station show|hide` and `pnpm station fake` list and unlist a station with the secret
-- key. Only that column, like target_fw: keys, names and active stay read-only to it.
grant update (listed) on table public.devices to service_role;
