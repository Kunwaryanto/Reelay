-- Invite only. Open sign-ups are off (config.toml); an account is created only by the
-- redeem-invite Edge Function, from a valid invite link. Admins create links in Settings.

alter table public.profiles add column is_admin boolean not null default false;

create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique,
  created_by  uuid references auth.users (id) on delete set null,  -- null: made by the Make admin workflow
  make_admin  boolean not null default false,                      -- the person who joins becomes an admin
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  used_by     uuid references auth.users (id) on delete set null,
  used_email  text,
  used_at     timestamptz,
  joined_at   timestamptz            -- the account's first sign-in: only now is the invite spent
);
create index invites_created_by on public.invites (created_by, created_at desc);

alter table public.invites enable row level security;
grant select on public.invites to authenticated;
create policy "admins see the invites they made" on public.invites
  for select to authenticated using (created_by = (select auth.uid()));

-- Mark the invite as joined when its account signs in for the first time.
create function public.mark_invite_joined() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.invites set joined_at = new.last_sign_in_at
  where used_by = new.id and joined_at is null;
  return new;
end $$;
create trigger on_first_sign_in
  after update of last_sign_in_at on auth.users
  for each row when (old.last_sign_in_at is null and new.last_sign_in_at is not null)
  execute function public.mark_invite_joined();

-- A short, URL-safe token: 16 random bytes, base64url without padding (22 characters).
create function public.new_invite_token() returns text
language sql volatile set search_path = '' as $$
  select rtrim(translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/', '-_'), '=')
$$;

-- Admins only. Returns the new invite; the app builds the link from its token.
create function public.create_invite() returns public.invites
language plpgsql volatile security definer set search_path = '' as $$
declare inv public.invites;
begin
  if not coalesce((select p.is_admin from public.profiles p where p.user_id = (select auth.uid())), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.invites (token, created_by) values (public.new_invite_token(), (select auth.uid()))
  returning * into inv;
  return inv;
end $$;

-- Cancel a waiting invite you made. Used or expired ones stay for the list until the cleanup.
create function public.cancel_invite(invite_id uuid) returns void
language sql volatile security definer set search_path = '' as $$
  delete from public.invites
  where id = invite_id and created_by = (select auth.uid()) and used_at is null and expires_at > now()
$$;

-- Undo for Cancel: puts the same invite back with its original token and dates.
create function public.restore_invite(inv public.invites) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if inv.created_by is distinct from (select auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.invites (id, token, created_by, created_at, expires_at)
  values (inv.id, inv.token, inv.created_by, inv.created_at, inv.expires_at)
  on conflict (id) do nothing;
end $$;

revoke execute on function public.new_invite_token() from public, anon, authenticated;
revoke execute on function public.create_invite(), public.cancel_invite(uuid), public.restore_invite(public.invites) from public, anon;
grant execute on function public.create_invite(), public.cancel_invite(uuid), public.restore_invite(public.invites) to authenticated;

-- For the redeem-invite function (service role only): does this email have an account?
create function public.user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1
$$;
revoke execute on function public.user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;
grant select, update on public.invites to service_role;
grant update (is_admin) on public.profiles to service_role;

-- Users may update their own profile, but never make themselves admin.
revoke update on public.profiles from authenticated;
grant update (region, language, notify_leaving, notify_arrivals, notify_new_seasons, onboarded_at)
  on public.profiles to authenticated;
