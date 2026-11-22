-- A profile for the signed-in person if theirs is missing. Every account gets one when it is created
-- (handle_new_user), but an account made before that rule existed had none (19 Nov), which hid Invite friends.
-- The app calls this when it finds no profile at sign-in, so a gap repairs itself. It only ever adds the
-- caller's own row with the defaults, and never changes an existing one.
create or replace function public.ensure_profile()
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.profiles (user_id) select auth.uid() where auth.uid() is not null on conflict do nothing;
$$;
revoke all on function public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated;
