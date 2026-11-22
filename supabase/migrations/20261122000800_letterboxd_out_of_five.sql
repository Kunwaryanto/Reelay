-- The Letterboxd averages were stored as MDBList gives them, out of 10 (Iron Man 7.6). Letterboxd shows them
-- out of 5 (3.8), and so does Reelay: beside a member's own rating, and in the "3.5+" filter. The sync halves
-- new values from the same commit on.
update public.scores set letterboxd = round(letterboxd / 2, 1) where letterboxd is not null;
