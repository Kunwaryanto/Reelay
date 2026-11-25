-- Classics on the walls are now 20+ years old (were 15+, which made 2008–2010 films like The Dark Knight and
-- Inception "classics"). Films 5–20 years old stay off the walls.
create or replace function public.wall_part(p_kind text, p_year int, p_votes int, p_now int) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case
    when p_kind = 'film' and p_year >= p_now - 5 then 'new'
    when p_kind = 'film' and p_year <= p_now - 20 and coalesce(p_votes, 0) >= 10000 then 'classic'
    when p_kind = 'series' and p_year >= p_now - 5 then 'series'
  end
$$;
select public.refresh_start_wall();
