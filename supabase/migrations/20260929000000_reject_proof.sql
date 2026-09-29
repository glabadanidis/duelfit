-- The winner can reject proof. Before this file the only choices were approve or
-- wait, and waiting approved it anyway, so a blurry photo of nothing earned the
-- loser +5 and a delivered forfeit.
--
--   winner rejects         proof is cleared, the loser may send new proof
--   loser's new deadline   the later of 7 days after the match and 2 days after the
--                          rejection, so a rejection on day 12 is not an instant duck
--   nothing new in time    ducked as usual: winner +5, loser a missed forfeit
--   at most 2 rejections   after that the winner can only approve or let it
--                          auto-approve, so a challenge always ends
--
-- The winner has no reason to reject good proof: a ducked forfeit pays them 5
-- instead of 10. The loser cannot clear their own proof, otherwise clearing it
-- would buy them a fresh 2 days forever.
--
-- Also fixes 20260928000004 if it already ran: its trigger was named
-- challenges_apply_rewards, which sorts before challenges_guard_client_update, so
-- it ran first and the guard then rejected every proof upload and approval
-- because the rewards trigger had already written columns a player may not.
-- Triggers fire in alphabetical order of name; the rewards trigger is now
-- challenges_rewards.

-- ============================================================
-- 1. Columns
-- ============================================================
-- Neither is in the guard's `editable`, only the rewards trigger writes them.
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS proof_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS proof_rejections integer NOT NULL DEFAULT 0;

-- ============================================================
-- 2. The guard
-- ============================================================
-- Same as 20260928000004 with the proof rule split by who is acting. Every
-- permission is wrapped in coalesce(..., false): with a null uid a bare NOT (...)
-- evaluates to null, and IF null does not raise.
CREATE OR REPLACE FUNCTION public.challenges_guard_client_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  editable text[] := ARRAY['status', 'opponent_pick', 'proof_url', 'proof_photo_url', 'proof_approved', 'updated_at'];
  had_proof boolean := OLD.proof_url IS NOT NULL OR OLD.proof_photo_url IS NOT NULL;
  has_proof boolean := NEW.proof_url IS NOT NULL OR NEW.proof_photo_url IS NOT NULL;
  open_forfeit boolean := OLD.status = 'completed' AND OLD.winner_id IS NOT NULL
                          AND OLD.proof_approved IS NOT TRUE AND NOT OLD.forfeit_ducked;
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - editable) IS DISTINCT FROM (to_jsonb(OLD) - editable) THEN
    RAISE EXCEPTION 'Only the match result can change this challenge'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT coalesce(OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined') AND uid = OLD.opponent_id, false) THEN
    RAISE EXCEPTION 'Only the opponent can accept or decline, and only while pending'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.opponent_pick IS DISTINCT FROM OLD.opponent_pick
     AND NOT coalesce(OLD.status = 'pending' AND NEW.status = 'accepted' AND uid = OLD.opponent_id, false) THEN
    RAISE EXCEPTION 'The pick is fixed once the challenge is accepted'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.proof_url IS DISTINCT FROM OLD.proof_url OR NEW.proof_photo_url IS DISTINCT FROM OLD.proof_photo_url THEN
    IF uid = OLD.winner_id THEN
      -- Rejecting: all of it at once, only proof that exists, at most twice.
      IF NOT coalesce(open_forfeit AND had_proof AND NOT has_proof AND OLD.proof_rejections < 2, false) THEN
        RAISE EXCEPTION 'The winner can only reject proof that is waiting for review, at most twice'
          USING ERRCODE = '42501';
      END IF;
    ELSE
      -- Sending or replacing: only the loser, never down to no proof, before the deadline.
      IF NOT coalesce(open_forfeit AND has_proof
                      AND uid IN (OLD.challenger_id, OLD.opponent_id)
                      AND greatest(OLD.settled_at + interval '7 days',
                                   OLD.proof_rejected_at + interval '2 days') > now(), false) THEN
        RAISE EXCEPTION 'Only the loser can submit proof, and only before the deadline'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF NEW.proof_approved IS DISTINCT FROM OLD.proof_approved
     AND NOT coalesce(open_forfeit AND uid = OLD.winner_id AND NEW.proof_approved IS TRUE
                      AND had_proof AND has_proof, false) THEN
    RAISE EXCEPTION 'Only the winner can approve proof, and only once there is some'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. Awarding
-- ============================================================
-- Same as 20260928000004 plus the rejection stamp. Only the winner can clear
-- proof, so proof going to none is always a rejection.
CREATE OR REPLACE FUNCTION public.challenges_apply_rewards()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  loser uuid;
  winner_amount integer;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    NEW.settled_at := coalesce(NEW.settled_at, now());
  END IF;

  IF NEW.proof_url IS DISTINCT FROM OLD.proof_url OR NEW.proof_photo_url IS DISTINCT FROM OLD.proof_photo_url THEN
    IF NEW.proof_url IS NOT NULL OR NEW.proof_photo_url IS NOT NULL THEN
      NEW.proof_submitted_at := now();
    ELSE
      NEW.proof_submitted_at := NULL;
      NEW.proof_rejected_at := now();
      NEW.proof_rejections := OLD.proof_rejections + 1;
    END IF;
  END IF;

  IF NEW.status <> 'completed' OR NEW.winner_id IS NULL THEN
    RETURN NEW;
  END IF;

  loser := CASE WHEN NEW.winner_id = NEW.challenger_id THEN NEW.opponent_id ELSE NEW.challenger_id END;

  IF NEW.proof_approved IS TRUE AND OLD.proof_approved IS NOT TRUE THEN
    UPDATE profiles SET points = coalesce(points, 0) + 5, forfeits_done = forfeits_done + 1
    WHERE id = loser;
    winner_amount := 10;
  ELSIF NEW.forfeit_ducked AND NOT OLD.forfeit_ducked THEN
    UPDATE profiles SET forfeits_ducked = forfeits_ducked + 1
    WHERE id = loser;
    winner_amount := 5;
  ELSE
    RETURN NEW;
  END IF;

  IF NOT NEW.winner_points_awarded THEN
    UPDATE profiles SET points = coalesce(points, 0) + winner_amount WHERE id = NEW.winner_id;
    NEW.winner_points_awarded := true;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.challenges_apply_rewards() FROM public, anon, authenticated;

-- 'r' sorts after 'g', so this fires after challenges_guard_client_update.
DROP TRIGGER IF EXISTS challenges_apply_rewards ON public.challenges;
DROP TRIGGER IF EXISTS challenges_rewards ON public.challenges;
CREATE TRIGGER challenges_rewards
  BEFORE UPDATE ON public.challenges
  FOR EACH ROW EXECUTE FUNCTION public.challenges_apply_rewards();

-- ============================================================
-- 4. The sweep
-- ============================================================
-- Same as 20260928000004 except the duck deadline, which now matches the guard.
-- greatest() ignores nulls, so with no rejection it is the plain 7 days.
CREATE OR REPLACE FUNCTION public.resolve_overdue_forfeits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  approved integer;
  ducked integer;
BEGIN
  UPDATE challenges SET proof_approved = true
  WHERE status = 'completed' AND winner_id IS NOT NULL
    AND proof_approved IS NOT TRUE AND NOT forfeit_ducked
    AND (proof_url IS NOT NULL OR proof_photo_url IS NOT NULL)
    AND proof_submitted_at < now() - interval '7 days';
  GET DIAGNOSTICS approved = ROW_COUNT;

  UPDATE challenges SET forfeit_ducked = true
  WHERE status = 'completed' AND winner_id IS NOT NULL
    AND proof_approved IS NOT TRUE AND NOT forfeit_ducked
    AND proof_url IS NULL AND proof_photo_url IS NULL
    AND greatest(settled_at + interval '7 days', proof_rejected_at + interval '2 days') < now();
  GET DIAGNOSTICS ducked = ROW_COUNT;

  RETURN approved + ducked;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_overdue_forfeits() FROM public, anon, authenticated;
