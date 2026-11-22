-- Letterboxd: a member types their username, Reelay reads their public diary feed (films watched, with date,
-- rating and rewatch) when they connect and every night after. Used for a watched mark on posters and for
-- showing what the other people on Reelay thought of a film.
--
-- Written only by the server (the letterboxd function and the nightly sync). Everyone signed in can read who
-- is connected and their logs: the same things are public on Letterboxd. Removing the account row (Disconnect)
-- removes its logs.

create table public.letterboxd_accounts (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  username      text not null check (username ~ '^[a-z0-9_]{2,15}$'),
  display_name  text,                               -- the name on their Letterboxd profile
  mark_watched  boolean not null default true,      -- the check on posters
  connected_at  timestamptz not null default now(),
  synced_at     timestamptz,                        -- null: not read yet
  sync_error    text                                -- why the last read failed, if it did
);

-- One row per diary entry. Films are kept by TMDB id, so a film that isn't in the catalogue yet is matched
-- the day it arrives.
create table public.letterboxd_logs (
  user_id     uuid not null references public.letterboxd_accounts (user_id) on delete cascade,
  entry_id    text not null,                        -- the feed's guid
  tmdb_id     int not null,
  watched_on  date,
  rating      numeric(2,1) check (rating between 0.5 and 5),
  rewatch     boolean not null default false,
  primary key (user_id, entry_id)
);
create index letterboxd_logs_film on public.letterboxd_logs (tmdb_id);

alter table public.letterboxd_accounts enable row level security;
alter table public.letterboxd_logs     enable row level security;

grant select on public.letterboxd_accounts, public.letterboxd_logs to authenticated;
grant update (mark_watched), delete on public.letterboxd_accounts to authenticated;

create policy "members see who is connected" on public.letterboxd_accounts for select to authenticated using (true);
create policy "own account: settings" on public.letterboxd_accounts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own account: disconnect" on public.letterboxd_accounts for delete to authenticated
  using (user_id = (select auth.uid()));
create policy "members see logs" on public.letterboxd_logs for select to authenticated using (true);

-- My connection, with how many films it has.
create or replace function public.letterboxd_me()
returns table (username text, display_name text, mark_watched boolean, synced_at timestamptz, sync_error text, films int)
language sql stable
set search_path = ''
as $$
  select a.username, a.display_name, a.mark_watched, a.synced_at, a.sync_error,
         (select count(distinct l.tmdb_id)::int from public.letterboxd_logs l where l.user_id = a.user_id)
  from public.letterboxd_accounts a where a.user_id = (select auth.uid());
$$;

-- The catalogue titles I have watched (for the check on posters and Hide watched).
create or replace function public.letterboxd_watched()
returns setof bigint
language sql stable
set search_path = ''
as $$
  select distinct t.id from public.letterboxd_logs l
  join public.titles t on t.tmdb_id = l.tmdb_id and t.kind = 'film'
  where l.user_id = (select auth.uid());
$$;

-- Everyone's logs of one title, mine first, then the most recent.
create or replace function public.letterboxd_for_title(p_title bigint)
returns table (me boolean, name text, username text, entry_id text, watched_on date, rating numeric, rewatch boolean)
language sql stable
set search_path = ''
as $$
  select a.user_id = (select auth.uid()), coalesce(nullif(a.display_name, ''), a.username), a.username,
         l.entry_id, l.watched_on, l.rating, l.rewatch
  from public.titles t
  join public.letterboxd_logs l on l.tmdb_id = t.tmdb_id
  join public.letterboxd_accounts a on a.user_id = l.user_id
  where t.id = p_title and t.kind = 'film'
  order by (a.user_id = (select auth.uid())) desc, l.watched_on desc nulls last, l.entry_id desc;
$$;

grant execute on function public.letterboxd_me(), public.letterboxd_watched(), public.letterboxd_for_title(bigint) to authenticated;
revoke execute on function public.letterboxd_me(), public.letterboxd_watched(), public.letterboxd_for_title(bigint) from anon, public;
