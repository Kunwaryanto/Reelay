-- Where the nightly sync left off in jobs that take more than one night (filling links to the services' apps).
-- Only the sync reads and writes it: row security is on and there are no policies, so the app can't see it.
create table public.sync_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.sync_state enable row level security;
