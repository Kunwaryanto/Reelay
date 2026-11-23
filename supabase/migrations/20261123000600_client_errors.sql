-- What went wrong in the app on members' phones, so bugs can be found and fixed. The app sends a report when a
-- screen fails to draw or code fails; members can add reports but read none. Kept 30 days (the nightly sync
-- deletes older ones). Read with the Database size workflow.
create table public.client_errors (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  user_id  uuid default auth.uid() references auth.users (id) on delete cascade,
  build    text check (length(build) <= 40),
  path     text check (length(path) <= 200),
  kind     text not null check (kind in ('render', 'error', 'promise')),
  message  text not null check (length(message) <= 500),
  stack    text check (length(stack) <= 4000),
  device   text check (length(device) <= 300)
);
create index client_errors_at on public.client_errors (at desc);
create index client_errors_user on public.client_errors (user_id);
alter table public.client_errors enable row level security;
create policy "members report their own errors" on public.client_errors for insert to authenticated
  with check (user_id = (select auth.uid()));
grant insert (build, path, kind, message, stack, device) on public.client_errors to authenticated;
