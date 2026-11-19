-- Reelay: catalogue (filled by the nightly sync) and per-user data.
-- Catalogue tables are readable by everyone, because shared title pages are public in Safari.
-- Only the sync (service role) writes them. User tables are private to their owner.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- unaccent() is not immutable, so it can't be used in an index directly.
create or replace function public.f_unaccent(text)
returns text
language sql immutable parallel safe strict
set search_path = ''
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;

-- ---------------------------------------------------------------------------
-- Services
-- ---------------------------------------------------------------------------
create table public.services (
  id                 text primary key,             -- 'netflix', 'svt-play'
  name               text not null,                -- 'Netflix', 'SVT Play'
  kind               text not null default 'subscription' check (kind in ('subscription', 'free')),
  popular            boolean not null default false,  -- the 10 on the onboarding step
  sort_order         int not null default 100,
  tmdb_provider_id   int unique,                   -- where it streams (TMDB / JustWatch)
  sa_service_id      text unique,                  -- leaving dates (Streaming Availability)
  has_leaving_dates  boolean not null default false
);

insert into public.services (id, name, kind, popular, sort_order, sa_service_id, has_leaving_dates) values
  ('netflix',     'Netflix',     'subscription', true,  1, 'netflix',     true),
  ('hbo-max',     'HBO Max',     'subscription', true,  2, 'hbo',         true),
  ('svt-play',    'SVT Play',    'free',         true,  3, null,          false),
  ('viaplay',     'Viaplay',     'subscription', true,  4, null,          false),
  ('disney-plus', 'Disney+',     'subscription', true,  5, 'disney',      true),
  ('prime-video', 'Prime Video', 'subscription', true,  6, 'prime',       true),
  ('apple-tv',    'Apple TV',    'subscription', true,  7, 'apple',       true),
  ('skyshowtime', 'SkyShowtime', 'subscription', true,  8, 'skyshowtime', true),
  ('tv4-play',    'TV4 Play',    'subscription', true,  9, null,          false),
  ('mubi',        'MUBI',        'subscription', false, 20, 'mubi',       true),
  ('crunchyroll', 'Crunchyroll', 'subscription', false, 21, 'crunchyroll', true),
  ('curiosity',   'Curiosity Stream', 'subscription', false, 22, 'curiosity', true),
  ('pluto-tv',    'Pluto TV',    'free',         false, 23, 'plutotv',    true);
-- tmdb_provider_id is filled by the first sync from TMDB's provider list for SE.

-- ---------------------------------------------------------------------------
-- Titles
-- ---------------------------------------------------------------------------
create table public.titles (
  id               bigint generated always as identity primary key,
  tmdb_id          int not null,
  kind             text not null check (kind in ('film', 'series')),
  imdb_id          text unique,
  wikidata_id      text unique,
  title            text not null,                 -- English title
  original_title   text,
  year             int,                           -- release year, or first year for series
  end_year         int,                           -- series: last year aired
  runtime_min      int,                           -- film length, or typical episode length
  seasons          int,
  last_season_on   date,                          -- for "New season"
  overview         text,
  genres           text[] not null default '{}',
  original_language text,
  countries        text[] not null default '{}',
  age_rating       text,                          -- Swedish rating if TMDB has it
  poster_path      text,                          -- TMDB image path, loaded from TMDB's image servers
  backdrop_path    text,
  logo_path        text,                          -- title treatment, if any
  popularity       real not null default 0,
  -- why it is stored: on a service, saved by someone, in an award row
  keep_reason      text not null default 'streaming' check (keep_reason in ('streaming', 'saved', 'award')),
  synced_at        timestamptz not null default now(),
  search_text      text generated always as (
    public.f_unaccent(lower(coalesce(title, '') || ' ' || coalesce(original_title, '')))
  ) stored,
  unique (tmdb_id, kind)
);

create index titles_search_trgm on public.titles using gin (search_text extensions.gin_trgm_ops);
create index titles_popularity on public.titles (popularity desc);

-- ---------------------------------------------------------------------------
-- People and credits
-- ---------------------------------------------------------------------------
create table public.people (
  id            bigint generated always as identity primary key,
  tmdb_id       int not null unique,
  name          text not null,
  profile_path  text,
  known_for     text,                              -- 'Acting', 'Directing'
  search_text   text generated always as (public.f_unaccent(lower(name))) stored
);

create index people_search_trgm on public.people using gin (search_text extensions.gin_trgm_ops);

create table public.credits (
  title_id   bigint not null references public.titles (id) on delete cascade,
  person_id  bigint not null references public.people (id) on delete cascade,
  role       text not null check (role in ('cast', 'director', 'creator', 'writer')),
  character  text,
  sort_order int not null default 0,
  primary key (title_id, person_id, role)
);

create index credits_person on public.credits (person_id);

-- ---------------------------------------------------------------------------
-- Where it streams in Sweden
-- ---------------------------------------------------------------------------
create table public.availability (
  title_id     bigint not null references public.titles (id) on delete cascade,
  service_id   text not null references public.services (id) on delete cascade,
  type         text not null default 'subscription' check (type in ('subscription', 'free', 'addon')),
  since        date not null default current_date,   -- first night the sync saw it
  leaves_on    date,                                 -- only for services with leaving dates
  link         text,                                 -- deep link into the service's app, when known
  seen_at      timestamptz not null default now(),
  primary key (title_id, service_id)
);

create index availability_service on public.availability (service_id);
create index availability_leaving on public.availability (leaves_on) where leaves_on is not null;

-- Added / left, found by comparing each night with the night before. Kept 90 days.
create table public.availability_events (
  id          bigint generated always as identity primary key,
  title_id    bigint not null references public.titles (id) on delete cascade,
  service_id  text not null references public.services (id) on delete cascade,
  event       text not null check (event in ('added', 'left', 'new_season')),
  happened_on date not null default current_date,
  unique (title_id, service_id, event, happened_on)
);

create index availability_events_day on public.availability_events (happened_on desc);

-- ---------------------------------------------------------------------------
-- Scores and awards
-- ---------------------------------------------------------------------------
create table public.scores (
  title_id        bigint primary key references public.titles (id) on delete cascade,
  imdb_rating     numeric(3, 1),           -- 0–10
  imdb_votes      int,
  rt_critics      smallint,                -- Tomatometer %
  letterboxd      numeric(2, 1),           -- 0–5, films only
  imdb_synced_at  timestamptz,
  mdblist_synced_at timestamptz
);

create table public.awards (
  id               bigint generated always as identity primary key,
  title_id         bigint not null references public.titles (id) on delete cascade,
  award            text not null,           -- 'Oscars', 'Emmys', 'Golden Globes'
  year             int not null,
  category         text not null,           -- full name, e.g. 'Outstanding Limited Series'
  short_category   text not null,           -- shown on cards, e.g. 'Best Miniseries'
  rank             smallint not null,       -- 1 best series/film, 2 lead acting, 3 directing, 4 writing, 5 supporting, 6 other
  won              boolean not null,
  person_name      text,
  wikidata_ref     text unique,             -- the Wikidata statement it came from
  unique (title_id, award, year, category, person_name)
);

create index awards_title on public.awards (title_id);

-- The award line on cards: top category in that award, plus how many more.
create view public.award_lines
with (security_invoker = true) as
with ranked as (
  select a.title_id, a.award, a.won, a.short_category,
         row_number() over (partition by a.title_id, a.award order by a.won desc, a.rank, a.year desc) as rn,
         count(*) over (partition by a.title_id, a.award, a.won) as same_kind
  from public.awards a
)
select title_id, award, won, short_category, (same_kind - 1)::int as more
from ranked
where rn = 1;

-- ---------------------------------------------------------------------------
-- TMDB search cache (server only), so repeated searches don't ask TMDB again
-- ---------------------------------------------------------------------------
create table public.tmdb_search_cache (
  query       text primary key,
  results     jsonb not null,
  fetched_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Per user
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id               uuid primary key references auth.users (id) on delete cascade,
  region                text not null default 'SE',
  language              text not null default 'system' check (language in ('system', 'en', 'sv')),
  notify_leaving        boolean not null default true,
  notify_arrivals       boolean not null default true,   -- a watchlist title arrives on your services
  notify_new_seasons    boolean not null default true,
  onboarded_at          timestamptz,
  created_at            timestamptz not null default now()
);

create table public.user_services (
  user_id     uuid not null references auth.users (id) on delete cascade,
  service_id  text not null references public.services (id) on delete cascade,
  primary key (user_id, service_id)
);

-- Notify me always saves the title, so it lives on the watchlist row.
create table public.watchlist (
  user_id    uuid not null references auth.users (id) on delete cascade,
  title_id   bigint not null references public.titles (id) on delete cascade,
  notify     boolean not null default false,
  added_at   timestamptz not null default now(),
  updated_at timestamptz not null default now(),   -- latest change wins when syncing offline edits
  primary key (user_id, title_id)
);

create index watchlist_title on public.watchlist (title_id);

-- Web Push subscriptions, one per installed device.
create table public.push_subscriptions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);

-- What has been sent, so nothing is sent twice (server only).
create table public.notifications_sent (
  user_id   uuid not null references auth.users (id) on delete cascade,
  title_id  bigint not null references public.titles (id) on delete cascade,
  kind      text not null check (kind in ('leaving', 'arrived', 'new_season')),
  ref_date  date not null,
  sent_at   timestamptz not null default now(),
  primary key (user_id, title_id, kind, ref_date)
);

-- A profile for every new account.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Search: streaming titles first, then by how well the name matches.
-- ---------------------------------------------------------------------------
create or replace function public.search_titles(q text, max_results int default 30)
returns table (
  id bigint, kind text, title text, year int, poster_path text,
  services text[], streaming boolean, score real
)
language sql stable
set search_path = ''
as $$
  with needle as (select public.f_unaccent(lower(trim(q))) as n)
  select t.id, t.kind, t.title, t.year, t.poster_path,
         coalesce(array_agg(a.service_id order by s.sort_order) filter (where a.service_id is not null), '{}') as services,
         bool_or(a.service_id is not null) as streaming,
         max(extensions.word_similarity(n.n, t.search_text)) as score
  from public.titles t
  cross join needle n
  left join public.availability a on a.title_id = t.id
  left join public.services s on s.id = a.service_id
  where length(n.n) >= 2
    and (t.search_text like '%' || n.n || '%' or extensions.word_similarity(n.n, t.search_text) > 0.4)
  group by t.id, t.kind, t.title, t.year, t.poster_path, t.popularity
  order by bool_or(a.service_id is not null) desc,
           max(extensions.word_similarity(n.n, t.search_text)) desc,
           t.popularity desc
  limit max_results
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
alter table public.services            enable row level security;
alter table public.titles              enable row level security;
alter table public.people              enable row level security;
alter table public.credits             enable row level security;
alter table public.availability        enable row level security;
alter table public.availability_events enable row level security;
alter table public.scores              enable row level security;
alter table public.awards              enable row level security;
alter table public.tmdb_search_cache   enable row level security;
alter table public.profiles            enable row level security;
alter table public.user_services       enable row level security;
alter table public.watchlist           enable row level security;
alter table public.push_subscriptions  enable row level security;
alter table public.notifications_sent  enable row level security;

-- Catalogue: anyone may read (public title pages), nobody but the sync writes.
grant select on public.services, public.titles, public.people, public.credits,
  public.availability, public.availability_events, public.scores, public.awards,
  public.award_lines to anon, authenticated;
grant execute on function public.search_titles(text, int) to anon, authenticated;

create policy "catalogue is public" on public.services            for select using (true);
create policy "catalogue is public" on public.titles              for select using (true);
create policy "catalogue is public" on public.people              for select using (true);
create policy "catalogue is public" on public.credits             for select using (true);
create policy "catalogue is public" on public.availability        for select using (true);
create policy "catalogue is public" on public.availability_events for select using (true);
create policy "catalogue is public" on public.scores              for select using (true);
create policy "catalogue is public" on public.awards              for select using (true);
-- tmdb_search_cache and notifications_sent: no grants, server only.

-- User data: signed-in users see and change only their own rows.
grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.user_services to authenticated;
grant select, insert, update, delete on public.watchlist to authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;

create policy "own profile" on public.profiles
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own services" on public.user_services
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own watchlist" on public.watchlist
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own devices" on public.push_subscriptions
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
