-- Links into the services' apps, stored in two parts: each service's fixed start (services.link_base) and each
-- title's own part (availability.link_path). A link is link_base || link_path, so if a service moves its address,
-- one row changes. A link that doesn't start with its service's base is kept whole in link_path (it starts with
-- https:// then). Both are filled by the nightly sync.
alter table public.availability rename column link to link_path;
alter table public.services add column link_base text;
update public.services s set link_base = x.base from (values
  ('netflix',     'https://www.netflix.com/title/'),
  ('hbo-max',     'https://play.hbomax.com/'),
  ('disney-plus', 'https://www.disneyplus.com/browse/entity-'),
  ('prime-video', 'https://app.primevideo.com/detail?gti='),
  ('apple-tv',    'https://tv.apple.com/se/'),
  ('skyshowtime', 'https://www.skyshowtime.com/se/stream/'),
  ('mubi',        'https://mubi.com/films/'),
  ('crunchyroll', 'https://www.crunchyroll.com/series/'),
  ('curiosity',   'https://curiositystream.com/'),
  ('pluto-tv',    'https://pluto.tv/gsa/on-demand/'),
  ('svt-play',    'https://www.svtplay.se/'),
  ('viaplay',     'https://viaplay.com/'),
  ('tv4-play',    'https://www.tv4play.se/program/')
) as x(id, base) where s.id = x.id;

-- Where the nightly sync left off in jobs that take more than one night (filling links).
-- Only the sync reads and writes it: row security is on and there are no policies, so the app can't see it.
create table public.sync_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.sync_state enable row level security;
