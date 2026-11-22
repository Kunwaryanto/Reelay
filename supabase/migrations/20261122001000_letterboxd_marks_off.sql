-- The check on watched films' posters is now off until the member turns it on (Settings › Letterboxd).
-- The one account connected so far is switched off too, at its owner's request.
alter table public.letterboxd_accounts alter column mark_watched set default false;
update public.letterboxd_accounts set mark_watched = false;
