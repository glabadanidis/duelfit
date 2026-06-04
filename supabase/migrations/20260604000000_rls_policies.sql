-- Enable RLS on all tables
ALTER TABLE profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PROFILES
-- ============================================================
-- Anyone can read profiles (needed for username search, leaderboard)
CREATE POLICY "profiles_select_all"
  ON profiles FOR SELECT
  USING (true);

-- Users can only update their own profile
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Users can only insert their own profile (handled by auth trigger)
CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Users can only delete their own profile
CREATE POLICY "profiles_delete_own"
  ON profiles FOR DELETE
  USING (auth.uid() = id);

-- ============================================================
-- CHALLENGES
-- ============================================================
-- Participants can read their own challenges
CREATE POLICY "challenges_select_participant"
  ON challenges FOR SELECT
  USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);

-- Challenger can create a challenge (they must be the challenger)
CREATE POLICY "challenges_insert_challenger"
  ON challenges FOR INSERT
  WITH CHECK (auth.uid() = challenger_id);

-- Only participants can update; key operations are scoped further in app code
CREATE POLICY "challenges_update_participant"
  ON challenges FOR UPDATE
  USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);

-- Only challenger can delete (cancel) a pending challenge
CREATE POLICY "challenges_delete_challenger"
  ON challenges FOR DELETE
  USING (auth.uid() = challenger_id);

-- ============================================================
-- FRIENDSHIPS
-- ============================================================
CREATE POLICY "friendships_select_participant"
  ON friendships FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "friendships_insert_own"
  ON friendships FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "friendships_update_participant"
  ON friendships FOR UPDATE
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "friendships_delete_own"
  ON friendships FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = friend_id);
