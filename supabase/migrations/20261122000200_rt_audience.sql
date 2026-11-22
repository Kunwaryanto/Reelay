-- Rotten Tomatoes' audience score (the Popcornmeter), beside the critics' Tomatometer. Filled by the nightly sync
-- from the same MDBList answer as rt_critics, so it costs no extra lookups.
alter table public.scores add column if not exists rt_audience smallint;  -- Popcornmeter %
