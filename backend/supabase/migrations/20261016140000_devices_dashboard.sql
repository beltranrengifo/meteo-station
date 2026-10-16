-- Which stations the public dashboard lists, and the public name it shows for each (the
-- town, e.g. "Madrid, Las Rozas"; `name` stays an internal label). A station only appears
-- once it is listed, so a new board can be set up and tested before anyone sees it.
-- Coordinates never live here: they are in the STATION_COORDINATES env var on Vercel.
alter table public.devices
  add column display_name text check (char_length(display_name) between 1 and 60),
  add column listed       boolean not null default false,
  add constraint devices_listed_needs_display_name check (not listed or display_name is not null);
