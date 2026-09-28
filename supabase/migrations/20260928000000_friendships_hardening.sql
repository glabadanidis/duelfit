-- Friend requests have to mean the other person actually accepted.
--
-- Before this file the friendships policies were weak in two ways:
--
--   1. The INSERT policy checked requester_id only, so a requester could insert
--      a row with status = 'accepted' and skip the other person entirely.
--   2. The UPDATE policy allowed either participant, so a requester could accept
--      their own request, and could rewrite requester_id or addressee_id to pair
--      any two users.
--
-- Challenges are deliberately NOT limited to friends. Friends are listed first in
-- Step4Opponent, but any player can be challenged by searching their username.
--
-- Policies combine with OR, so a stricter policy next to a loose one does
-- nothing. Rather than guess the names of the policies made by hand in the
-- dashboard, every INSERT policy on challenges and every INSERT and UPDATE policy
-- on friendships is dropped and replaced by one each. challenges is included only
-- to get rid of its duplicate hand-made INSERT policy; the rule stays the same,
-- plus a check that you cannot challenge yourself. This also settles the
-- duplicate friendships INSERT pair left open in 20260924000001.

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND ((tablename = 'challenges'  AND cmd = 'INSERT')
        OR (tablename = 'friendships' AND cmd IN ('INSERT', 'UPDATE')))
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

-- ============================================================
-- FRIENDSHIPS
-- ============================================================
-- A request always starts as pending, from yourself, to someone else.
CREATE POLICY "friendships_insert_own"
  ON public.friendships FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = requester_id
    AND addressee_id <> requester_id
    AND status = 'pending'
  );

-- Only the addressee can accept. Declining and removing go through DELETE, which
-- either side may do, so the only transition UPDATE has to allow is to accepted.
CREATE POLICY "friendships_update_participant"
  ON public.friendships FOR UPDATE
  TO authenticated
  USING (auth.uid() = addressee_id AND status = 'pending')
  WITH CHECK (auth.uid() = addressee_id AND status = 'accepted');

-- The policy above cannot stop the addressee from also rewriting requester_id in
-- the same UPDATE, which would make them friends with a third person who never
-- asked. Column privileges can: status is the only column the app ever updates.
REVOKE UPDATE ON public.friendships FROM authenticated, anon;
GRANT UPDATE (status) ON public.friendships TO authenticated;

-- ============================================================
-- CHALLENGES
-- ============================================================
CREATE POLICY "challenges_insert_challenger"
  ON public.challenges FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = challenger_id
    AND opponent_id <> challenger_id
  );
