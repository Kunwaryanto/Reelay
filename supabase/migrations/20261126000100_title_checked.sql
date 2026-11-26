-- When the sync last fetched a title's details, kept apart from the title itself.
-- The nightly refresh used to stamp titles.synced_at on every title it fetched, and an update copies the whole row
-- (about 735 bytes): some 2,700 rewritten titles a night, though most hadn't changed. Now a title row is written only
-- when something in it changed, and the check itself is noted here, in a narrow row.
create table if not exists public.title_checked (
  title_id   bigint primary key references public.titles(id) on delete cascade,
  checked_at timestamptz not null
);
alter table public.title_checked enable row level security;  -- written and read by the sync only
revoke all on public.title_checked from anon, authenticated;

-- start from what the titles say
insert into public.title_checked (title_id, checked_at)
select id, synced_at from public.titles
on conflict (title_id) do nothing;
