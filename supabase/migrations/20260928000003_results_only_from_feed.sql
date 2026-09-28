-- Results come from the TheSportsDB feed via settle-challenges, never from a
-- player. Before this file a player could decide a challenge three ways without
-- the app: the challenges UPDATE policy let either participant write any column,
-- including status, winner_id and result; increment_points was callable by any
-- logged in user for any user and any amount; and the profiles UPDATE policy let a
-- user write their own points. The MarkResult screen, which used the first two,
-- is removed from the app in the same commit.
--
-- settle-challenges uses the service role, which bypasses RLS and column grants
-- and is let through by the trigger below, so settlement is unaffected. So is
-- the SQL editor, which runs with no JWT at all.

-- ============================================================
-- 1. What a player may change on a challenge
-- ============================================================
-- RLS cannot compare old and new values, so the rules live in a trigger. The
-- UPDATE policy stays as it is and still decides which rows a player can touch.
-- This decides what they may do to them:
--
--   opponent       pending -> accepted (with their pick) or declined
--   loser          add or change proof, until it has been approved
--   winner         approve proof, once there is some
--
-- Everything else, the result, the winner, the picks after acceptance, the match
-- and the forfeit, is fixed once written. updated_at is exempt in case a
-- timestamp trigger sets it.
CREATE OR REPLACE FUNCTION public.challenges_guard_client_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  editable text[] := ARRAY['status', 'opponent_pick', 'proof_url', 'proof_photo_url', 'proof_approved', 'updated_at'];
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - editable) IS DISTINCT FROM (to_jsonb(OLD) - editable) THEN
    RAISE EXCEPTION 'Only the match result can change this challenge'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined') AND uid = OLD.opponent_id) THEN
    RAISE EXCEPTION 'Only the opponent can accept or decline, and only while pending'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.opponent_pick IS DISTINCT FROM OLD.opponent_pick
     AND NOT (OLD.status = 'pending' AND NEW.status = 'accepted' AND uid = OLD.opponent_id) THEN
    RAISE EXCEPTION 'The pick is fixed once the challenge is accepted'
      USING ERRCODE = '42501';
  END IF;

  IF (NEW.proof_url IS DISTINCT FROM OLD.proof_url OR NEW.proof_photo_url IS DISTINCT FROM OLD.proof_photo_url)
     AND NOT (OLD.status = 'completed' AND OLD.winner_id IS NOT NULL AND uid <> OLD.winner_id
              AND OLD.proof_approved IS NOT TRUE) THEN
    RAISE EXCEPTION 'Only the loser can submit proof, and only until it is approved'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.proof_approved IS DISTINCT FROM OLD.proof_approved
     AND NOT (OLD.status = 'completed' AND uid = OLD.winner_id AND NEW.proof_approved IS TRUE
              AND (OLD.proof_url IS NOT NULL OR OLD.proof_photo_url IS NOT NULL)) THEN
    RAISE EXCEPTION 'Only the winner can approve proof, and only once there is some'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS challenges_guard_client_update ON public.challenges;
CREATE TRIGGER challenges_guard_client_update
  BEFORE UPDATE ON public.challenges
  FOR EACH ROW EXECUTE FUNCTION public.challenges_guard_client_update();

-- ============================================================
-- 2. increment_points is for settlement only
-- ============================================================
-- Its definition is not in this repo, so every overload is found by name rather
-- than guessing the argument types.
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN
    SELECT oid::regprocedure FROM pg_proc
    WHERE proname = 'increment_points' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

-- ============================================================
-- 3. A player cannot write their own points
-- ============================================================
-- The app only ever updates these three columns on your own profile: push_token
-- on every open, username and full_name from Settings. points and the forfeit
-- counters are left to the server.
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (username, full_name, push_token) ON public.profiles TO authenticated;
