-- OMDb as a backup source for the Rotten Tomatoes critics' score of films MDBList has none for (22 Nov).
-- When it was last asked, so each film is asked about once a month at most.
alter table public.scores add column if not exists omdb_synced_at timestamptz;
