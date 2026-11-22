-- Five more services offered in Sweden, from the More list on the design canvas (Paramount+ is left out: in Sweden
-- it was replaced by SkyShowtime). The nightly sync finds each one's TMDB provider by name; none of them has
-- leaving dates (Streaming Availability doesn't cover them) or an app link start yet.
insert into public.services (id, name, kind, popular, sort_order, has_leaving_dates) values
  ('cineasterna', 'Cineasterna', 'free',         false, 19, false),
  ('draken-film', 'Draken Film', 'subscription', false, 24, false),
  ('triart-play', 'TriArt Play', 'subscription', false, 25, false),
  ('hayu',        'Hayu',        'subscription', false, 26, false),
  ('britbox',     'BritBox',     'subscription', false, 27, false)
on conflict (id) do nothing;
