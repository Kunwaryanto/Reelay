-- The letterboxd function works as the service role, which gets no access to new tables by itself
-- (like invites before it). Without this, connecting failed with "Couldn't connect".
grant select, insert, update, delete on public.letterboxd_accounts, public.letterboxd_logs to service_role;
