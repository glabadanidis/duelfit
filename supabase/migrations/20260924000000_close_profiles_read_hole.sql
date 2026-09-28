-- Closes the anon read hole on profiles, and adds the two reliability counters.
--
-- Background: profiles carried a policy "Public profiles" FOR SELECT TO public
-- USING (true). In Postgres the `public` role means every role, including `anon`,
-- so anyone holding the anon key lifted out of the APK could read every row,
-- including push_token. Expo's push API accepts any token without auth and this
-- app sends push from the client, so that key was enough to notify every user
-- while impersonating DuelFit.
--
-- Nothing else on profiles needs anon access once the username check below moves
-- to an RPC. Verified against the live database on 2026-09-24: profiles has
-- exactly three policies (INSERT, SELECT, UPDATE) and no DELETE policy, so the
-- delete-account edge function keeps working on the service role.

-- ============================================================
-- 1. Authenticated read instead of public read
-- ============================================================
-- The app genuinely needs to read *other* users' profiles: the leaderboard, the
-- opponent search in Step4Opponent and the friends list all do. So this stays
-- USING (true), the change is the role it applies to.
DROP POLICY IF EXISTS "Public profiles" ON public.profiles;

DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 2. Username availability without exposing the table
-- ============================================================
-- Register.js checks whether a username is taken before the account exists, so
-- that query runs as anon. Without this function the check silently reports every
-- name as available and registration then fails on profiles_username_key with an
-- error the user cannot act on.
--
-- SECURITY DEFINER lets it read profiles past RLS, and it returns only a boolean,
-- never a row. search_path is pinned because a SECURITY DEFINER function without
-- it can be hijacked by a caller-controlled search_path.
CREATE OR REPLACE FUNCTION public.username_available(check_username text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(username) = lower(trim(check_username))
  );
$$;

REVOKE ALL ON FUNCTION public.username_available(text) FROM public;
GRANT EXECUTE ON FUNCTION public.username_available(text) TO anon, authenticated;

-- ============================================================
-- 3. Reliability counters
-- ============================================================
-- Reliability is forfeits_done / (forfeits_done + forfeits_ducked). Both are
-- denormalised onto profiles on purpose: the leaderboard renders 50 rows and
-- aggregating challenges per row would be 50 queries from a phone.
--
-- forfeits_done is incremented in Challenges/Detail.js when the winner approves
-- the proof, in the same statement that awards the points. forfeits_ducked is
-- incremented by the day 7 sweep inside settle-challenges, which already runs
-- hourly. A forfeit still inside its 7 day window counts in neither, so it does
-- not drag the score down before the person has actually failed.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS forfeits_done   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forfeits_ducked integer NOT NULL DEFAULT 0;
