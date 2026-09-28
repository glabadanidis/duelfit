-- ⚠️ This file never ran successfully. Corrected 2026-09-24, not yet applied anywhere.
--
-- Two bugs, found by reading the live database and comparing policy names:
--
--   1. The friendships block referenced user_id and friend_id. Those columns do
--      not exist, the table uses requester_id and addressee_id. Postgres runs a
--      migration file in one transaction, so that error rolled back every
--      statement above it. That is why the live database contains policies named
--      "Public profiles" and "Users can view own challenges", made by hand in the
--      dashboard, rather than the names below.
--
--   2. profiles_select_all was USING (true) with no role, which in Postgres means
--      every role including anon. Running the original version of this file
--      against the live database would have reopened the exact read hole that
--      20260924000000_close_profiles_read_hole.sql closes, because policies
--      combine with OR. It is now scoped TO authenticated.
--
-- Every CREATE is preceded by a DROP ... IF EXISTS so the file is re-runnable and
-- converges rather than erroring on a second pass. It does not remove the
-- dashboard-made policies on the live database; those are handled in
-- 20260924000001_policy_cleanup_and_backfill.sql.

-- Enable RLS on all tables
ALTER TABLE profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges  ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PROFILES
-- ============================================================
-- Logged in users can read any profile: the leaderboard, the opponent search and
-- the friends list all need other people's rows. Anonymous callers get nothing.
-- The one thing anon still needs, checking whether a username is free during
-- registration, goes through the username_available() function instead.
DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- Users can only update their own profile
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Users can only insert their own profile (handled by auth trigger)
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Users can only delete their own profile
DROP POLICY IF EXISTS "profiles_delete_own" ON profiles;
CREATE POLICY "profiles_delete_own"
  ON profiles FOR DELETE
  USING (auth.uid() = id);

-- ============================================================
-- CHALLENGES
-- ============================================================
-- Participants can read their own challenges
DROP POLICY IF EXISTS "challenges_select_participant" ON challenges;
CREATE POLICY "challenges_select_participant"
  ON challenges FOR SELECT
  USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);

-- Challenger can create a challenge (they must be the challenger)
DROP POLICY IF EXISTS "challenges_insert_challenger" ON challenges;
CREATE POLICY "challenges_insert_challenger"
  ON challenges FOR INSERT
  WITH CHECK (auth.uid() = challenger_id);

-- Only participants can update; key operations are scoped further in app code.
-- Note this lets a loser set proof_approved on their own lost challenge. That is
-- harmless while approval awards nothing, but it becomes a way to mint points the
-- moment points move to approval, so it needs narrowing in the same change.
DROP POLICY IF EXISTS "challenges_update_participant" ON challenges;
CREATE POLICY "challenges_update_participant"
  ON challenges FOR UPDATE
  USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);

-- Only challenger can delete (cancel) a pending challenge
DROP POLICY IF EXISTS "challenges_delete_challenger" ON challenges;
CREATE POLICY "challenges_delete_challenger"
  ON challenges FOR DELETE
  USING (auth.uid() = challenger_id);

-- ============================================================
-- FRIENDSHIPS
-- ============================================================
-- Columns are requester_id and addressee_id. The original file said user_id and
-- friend_id, which is what broke the whole migration.
DROP POLICY IF EXISTS "friendships_select_participant" ON friendships;
CREATE POLICY "friendships_select_participant"
  ON friendships FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

DROP POLICY IF EXISTS "friendships_insert_own" ON friendships;
CREATE POLICY "friendships_insert_own"
  ON friendships FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "friendships_update_participant" ON friendships;
CREATE POLICY "friendships_update_participant"
  ON friendships FOR UPDATE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

DROP POLICY IF EXISTS "friendships_delete_own" ON friendships;
CREATE POLICY "friendships_delete_own"
  ON friendships FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
