-- Housekeeping that deliberately does NOT live in 20260924000000.
--
-- Postgres runs each migration file in one transaction, so a single failing
-- statement rolls the whole file back. Everything here is either cosmetic or
-- best effort, and none of it is allowed to take the profiles read fix down with
-- it. If this file fails, the security fix stays applied. Read the failure, fix
-- the offending statement, run it again.

-- ============================================================
-- 1. Duplicate friendships policies
-- ============================================================
-- The live database ended up with two policies per command on friendships: one
-- set made by hand in the dashboard with sentence-style names, and one set using
-- the repo's naming convention. Verified 2026-09-24 that the SELECT pair and the
-- UPDATE pair have identical predicates, only the operand order differs, so
-- dropping one of each changes nothing. The repo-style names are kept.
DROP POLICY IF EXISTS "Users can see their own friendships"    ON public.friendships;
DROP POLICY IF EXISTS "Users can update their received requests" ON public.friendships;

-- The INSERT pair ("Users can send friend requests" and friendships_insert_own)
-- is intentionally left alone. Both have a NULL qual, so the behaviour lives in
-- with_check, which has not been read yet. Dropping one on the assumption that
-- they match could quietly break sending a friend request. Check with:
--   select policyname, with_check from pg_policies
--   where tablename = 'friendships' and cmd = 'INSERT';
-- and drop the redundant one in a follow up once the two are confirmed equal.

-- ============================================================
-- 2. Case insensitive username uniqueness
-- ============================================================
-- profiles_username_key is UNIQUE (username), which is case sensitive, so simeon
-- and Simeon can both exist. username_available() compares with lower(), so the
-- check and the constraint disagree: the app would refuse a name the database
-- would happily accept. Case insensitive is the behaviour anyone expects from an
-- @handle, so the index moves to match the function rather than the reverse.
--
-- This fails if two existing rows already collide on lower(username). With three
-- profiles that is unlikely, but if it does fail, find them with:
--   select lower(username), count(*) from profiles
--   group by 1 having count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key
  ON public.profiles (lower(username));

-- ============================================================
-- 3. Backfill forfeits_done
-- ============================================================
-- Gives the reliability badge real history instead of starting everyone at New.
-- The loser of a completed challenge is whichever participant is not the winner.
UPDATE public.profiles p
SET forfeits_done = sub.done
FROM (
  SELECT loser_id, count(*) AS done
  FROM (
    SELECT CASE WHEN c.winner_id = c.challenger_id
                THEN c.opponent_id
                ELSE c.challenger_id
           END AS loser_id
    FROM public.challenges c
    WHERE c.status = 'completed'
      AND c.winner_id IS NOT NULL
      AND c.proof_approved IS TRUE
  ) x
  GROUP BY loser_id
) sub
WHERE p.id = sub.loser_id;

-- forfeits_ducked is deliberately left at 0 for everyone. There is no historical
-- record of when a challenge settled versus when proof was due, so any backfill
-- would be guesswork, and guessing here means branding a real person Risky for a
-- deadline that did not exist at the time.
