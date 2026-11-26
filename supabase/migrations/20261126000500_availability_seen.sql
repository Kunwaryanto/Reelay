-- Which offers the nightly sync saw this run, so the ones it didn't see can go (they left the service).
-- Before, every offer was rewritten every night (seen_at = now()) only to mark it seen: some 43,000 rows a night.
-- Now an offer is written only when it is new or its type changed, and what was seen is listed here: an unlogged
-- table, emptied at the start of each run (emptying leaves nothing behind to clean up).
create unlogged table if not exists public.availability_seen (
  title_id   bigint not null,
  service_id text not null,
  primary key (title_id, service_id)
);
alter table public.availability_seen enable row level security;  -- the sync's own
revoke all on public.availability_seen from anon, authenticated;
