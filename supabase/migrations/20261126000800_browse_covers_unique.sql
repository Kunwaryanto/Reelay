-- Browse's card pictures, each card its own (26 Nov): five candidates a category weren't enough once ~40 cards took
-- turns, so the lists (Leaving soon, Highest rated) fell back to a picture another card already showed. Now 24
-- candidates each, and the rules covers ignored count: Leaving soon pictures something leaving, New on streaming
-- something that arrived. The app hands them out so no picture shows twice (loadCovers).
create or replace function public.browse_covers(p_cats jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
set jit = off
as $$
declare
  k text := md5('v2' || p_cats::text);
  now_stamp timestamptz := (select finished_at from public.data_stamp where id = 1);
  today date := (now() at time zone 'Europe/Stockholm')::date;
  got jsonb;
  c jsonb;
  top bigint[];
  out jsonb := '{}';
  pick jsonb;
begin
  select x.data into got from public.browse_cover_cache x where x.key = k and x.stamp is not distinct from now_stamp;
  if got is not null then return got; end if;
  -- the most popular streaming titles with a backdrop: nearly every category finds its pictures among them
  top := array(select t.id from public.titles t where t.backdrop_path is not null
    and exists (select 1 from public.availability a where a.title_id = t.id) order by t.popularity desc nulls last limit 4000);
  for c in select * from jsonb_array_elements(p_cats) loop
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'path', x.path)), '[]'::jsonb) into pick from (
      select t.id, t.backdrop_path as path from public.titles t
      where t.id = any (top) and (c->>'kind' is null or t.kind = c->>'kind') and public.browse_fits(t, c->'rule')
        and (not coalesce((c->'rule'->>'leaving')::boolean, false)
             or exists (select 1 from public.availability a where a.title_id = t.id and a.leaves_on between today and today + 30))
        and (c->'rule'->>'arrived' is null
             or exists (select 1 from public.availability_events e where e.title_id = t.id and e.event = 'added'
                        and e.happened_on >= today - (c->'rule'->>'arrived')::int))
      order by t.popularity desc nulls last limit 24) x;
    if jsonb_array_length(pick) < 3 then
      -- a small category (a country, a mood): look further
      select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'path', x.path)), '[]'::jsonb) into pick from (
        select t.id, coalesce(t.backdrop_path, t.poster_path) as path from public.titles t
        where (c->>'kind' is null or t.kind = c->>'kind') and public.browse_fits(t, c->'rule')
          and coalesce(t.backdrop_path, t.poster_path) is not null
          and exists (select 1 from public.availability a where a.title_id = t.id
                      and (not coalesce((c->'rule'->>'leaving')::boolean, false) or a.leaves_on between today and today + 30))
        order by t.popularity desc nulls last limit 24) x;
    end if;
    out := out || jsonb_build_object(c->>'id', pick);
  end loop;
  insert into public.browse_cover_cache (key, stamp, data) values (k, now_stamp, out)
  on conflict (key) do update set stamp = excluded.stamp, data = excluded.data, built_at = now();
  delete from public.browse_cover_cache where built_at < now() - interval '7 days';
  return out;
end
$$;
revoke execute on function public.browse_covers(jsonb) from public, anon;
grant execute on function public.browse_covers(jsonb) to authenticated;

delete from public.browse_cover_cache;
