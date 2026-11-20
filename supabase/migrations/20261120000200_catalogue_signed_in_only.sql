-- Sharing is dropped (no public title pages), so the catalogue is for signed-in users only.
-- The sync connects as the database owner and is not affected by these grants or RLS.
-- Take every lock up front, in one statement, so a running sync makes this wait instead of deadlock.

set local lock_timeout = '60s';
lock table public.services, public.titles, public.people, public.credits,
  public.availability, public.availability_events, public.scores, public.awards
  in access exclusive mode;

revoke select on public.services, public.titles, public.people, public.credits,
  public.availability, public.availability_events, public.scores, public.awards,
  public.award_lines from anon;
revoke execute on function public.search_titles(text, int) from anon, public;

do $$
declare t text;
begin
  foreach t in array array['services','titles','people','credits','availability',
                           'availability_events','scores','awards'] loop
    execute format('drop policy if exists "catalogue is public" on public.%I', t);
    execute format('create policy "signed-in users read the catalogue" on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;
