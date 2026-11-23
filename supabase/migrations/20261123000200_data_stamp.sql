-- When the catalogue last changed: the sync stamps it when it finishes. The app asks for this one value on
-- opening and keeps what it saved until the stamp moves, instead of reloading on a timer.
create table public.data_stamp (
  id          int primary key default 1 check (id = 1),
  finished_at timestamptz not null default now()
);
insert into public.data_stamp default values;
alter table public.data_stamp enable row level security;
grant select on public.data_stamp to authenticated;
create policy "members read the stamp" on public.data_stamp for select to authenticated using (true);
