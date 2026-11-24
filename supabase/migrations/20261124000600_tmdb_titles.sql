-- Every title on TMDB can be found and opened: search asks TMDB for what the catalogue doesn't have
-- (supabase/functions/tmdb), and opening one saves it here first, with its cast and crew, kept as 'searched'
-- (the nightly clean-up removes it after 90 days unless it streams, is saved, notable or has awards).
alter table public.titles drop constraint if exists titles_keep_reason_check;
alter table public.titles add constraint titles_keep_reason_check check (keep_reason in ('streaming', 'saved', 'award', 'notable', 'searched'));

-- Save one title from TMDB: { title: {...titles columns}, people: [{tmdb_id, name, profile_path, known_for}],
-- credits: [{tmdb_id, role, character, sort_order}] }. A title we already have is left as it is. Returns its id.
create or replace function public.save_tmdb_title(p jsonb)
returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare t jsonb := p->'title'; tid bigint;
begin
  select id into tid from public.titles where tmdb_id = (t->>'tmdb_id')::int and kind = t->>'kind';
  if tid is not null then return tid; end if;
  insert into public.titles (tmdb_id, kind, imdb_id, wikidata_id, title, original_title, year, end_year, runtime_min, seasons,
    last_season_on, overview, genres, original_language, countries, age_rating, poster_path, backdrop_path, logo_path,
    popularity, released_on, keep_reason, synced_at)
  values ((t->>'tmdb_id')::int, t->>'kind',
    -- an IMDb or Wikidata id another title already has is left empty (the first title keeps it)
    case when exists (select 1 from public.titles o where o.imdb_id = t->>'imdb_id') then null else t->>'imdb_id' end,
    case when exists (select 1 from public.titles o where o.wikidata_id = t->>'wikidata_id') then null else t->>'wikidata_id' end,
    t->>'title', t->>'original_title', (t->>'year')::int, (t->>'end_year')::int, (t->>'runtime_min')::int, (t->>'seasons')::int,
    (t->>'last_season_on')::date, t->>'overview',
    coalesce(array(select jsonb_array_elements_text(t->'genres')), '{}'), t->>'original_language',
    coalesce(array(select jsonb_array_elements_text(t->'countries')), '{}'), t->>'age_rating',
    t->>'poster_path', t->>'backdrop_path', t->>'logo_path', coalesce((t->>'popularity')::real, 0), (t->>'released_on')::date,
    'searched', now())
  on conflict (tmdb_id, kind) do nothing
  returning id into tid;
  if tid is null then -- saved by someone else at the same moment
    select id into tid from public.titles where tmdb_id = (t->>'tmdb_id')::int and kind = t->>'kind';
    return tid;
  end if;

  insert into public.people (tmdb_id, name, profile_path, known_for)
  select (x->>'tmdb_id')::int, x->>'name', x->>'profile_path', x->>'known_for' from jsonb_array_elements(coalesce(p->'people', '[]')) x
  on conflict (tmdb_id) do update set name = excluded.name, profile_path = excluded.profile_path,
    known_for = coalesce(excluded.known_for, public.people.known_for)
  where (public.people.name, public.people.profile_path) is distinct from (excluded.name, excluded.profile_path);

  insert into public.credits (title_id, person_id, role, character, sort_order)
  select tid, pe.id, x->>'role', x->>'character', coalesce((x->>'sort_order')::int, 0)
  from jsonb_array_elements(coalesce(p->'credits', '[]')) x join public.people pe on pe.tmdb_id = (x->>'tmdb_id')::int
  on conflict (title_id, person_id, role) do nothing;
  return tid;
end;
$$;
revoke execute on function public.save_tmdb_title(jsonb) from public, anon, authenticated;
grant execute on function public.save_tmdb_title(jsonb) to service_role;
