-- Small clean-ups from the health check (23 Nov).

-- "Because you liked" and "More with" ask, title by title, whether the member has logged a film: a direct lookup
-- instead of reading through all their logs each time.
create index letterboxd_logs_user_film on public.letterboxd_logs (user_id, tmdb_id);

-- Links other tables follow on delete (an account, a title, a service) without reading the whole table.
create index availability_events_service on public.availability_events (service_id);
create index user_services_service on public.user_services (service_id);
create index push_subscriptions_user on public.push_subscriptions (user_id);
create index notifications_sent_title on public.notifications_sent (title_id);
create index invites_used_by on public.invites (used_by);

-- A fixed search path on every function.
alter function public.refresh_every(text, text) set search_path = '';

-- Trigger functions run only as triggers: nobody needs to be able to call them.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.mark_invite_joined() from public, anon, authenticated;

-- Start the slow-query statistics afresh, so the Database size workflow shows what is slow after the fixes.
do $$ begin perform extensions.pg_stat_statements_reset(); exception when others then raise notice 'statistics not reset: %', sqlerrm; end $$;
