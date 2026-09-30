-- Team badge URLs on the challenge, so the Challenges list can show the logos the
-- way Home does without one TheSportsDB lookup per card. Step4Opponent fills them
-- from the fixture when the challenge is created. Older challenges have null here
-- and the list looks those up once through the request queue.
--
-- Not in the guard's editable list, so a player cannot change them after insert.
-- Apply this BEFORE running a build that inserts them, or every new challenge
-- fails with "column does not exist".
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS match_home_badge text,
  ADD COLUMN IF NOT EXISTS match_away_badge text;
