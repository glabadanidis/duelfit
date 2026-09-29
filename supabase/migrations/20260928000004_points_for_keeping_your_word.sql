-- Points reward keeping your word, not only predicting well. Before this file the
-- winner got +10 at settlement and doing the forfeit earned nothing, so a player
-- who did every forfeit but predicted badly ranked last.
--
--   proof approved                   winner +10, loser +5, loser forfeits_done +1
--   no proof 7 days after the match  winner +5, loser 0, loser forfeits_ducked +1
--   proof not reviewed in 7 days     counts as approved, as above
--   draw (no winner)                 nothing, no forfeit is owed
--
-- The winner gets less for a ducked forfeit than a delivered one so they have a
-- reason to push their opponent to do it. The loser has 7 days from settlement to
-- send or replace proof; the winner then has 7 days from the latest proof to
-- review it, so a last minute upload still gets a full week. At most 14 days from
-- the match to resolution.
--
-- The database awards all of it. Since 20260928000003 a player cannot call
-- increment_points or write points, so the app could not do it even if it tried.
-- settle-challenges stops awarding at settlement in the same commit and must be
-- redeployed right after this file runs, or a challenge settled in between pays
-- the winner twice.

-- ============================================================
-- 1. Columns
-- ============================================================
-- settled_at starts the loser's 7 days, proof_submitted_at the winner's.
-- forfeit_ducked is the no-proof outcome. winner_points_awarded is the
-- double-award guard: approval and the sweep both pay the winner, and only
-- whichever comes first may.
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS proof_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS forfeit_ducked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS winner_points_awarded boolean NOT NULL DEFAULT false;

-- Every challenge already settled paid its winner +10 under the old rule.
UPDATE public.challenges SET winner_points_awarded = true
WHERE status = 'completed' AND winner_id IS NOT NULL;

-- When they settled was never recorded, so they get 7 days from today rather than
-- a guessed deadline that may already have passed.
UPDATE public.challenges SET settled_at = now()
WHERE status = 'completed' AND settled_at IS NULL;

-- Same for proof already sent and waiting for review.
UPDATE public.challenges SET proof_submitted_at = now()
WHERE status = 'completed' AND proof_submitted_at IS NULL
  AND (proof_url IS NOT NULL OR proof_photo_url IS NOT NULL);

-- ============================================================
-- 2. Proof closes once the forfeit is resolved
-- ============================================================
-- Same function as 20260928000003 plus two conditions on proof: it can only be
-- sent or replaced within 7 days of settlement, and never once the forfeit is
-- ducked. The deadline is what stops the loser resetting the winner's review clock
-- forever by replacing proof. None of the new columns are in `editable`, so a
-- player can never write them.
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
              AND OLD.proof_approved IS NOT TRUE AND NOT OLD.forfeit_ducked
              AND OLD.settled_at > now() - interval '7 days') THEN
    RAISE EXCEPTION 'Only the loser can submit proof, and only within 7 days of the match'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.proof_approved IS DISTINCT FROM OLD.proof_approved
     AND NOT (OLD.status = 'completed' AND uid = OLD.winner_id AND NEW.proof_approved IS TRUE
              AND NOT OLD.forfeit_ducked
              AND (OLD.proof_url IS NOT NULL OR OLD.proof_photo_url IS NOT NULL)) THEN
    RAISE EXCEPTION 'Only the winner can approve proof, and only once there is some'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. Awarding
-- ============================================================
-- A BEFORE trigger so it can set winner_points_awarded on the same row without a
-- second UPDATE. Triggers fire in alphabetical order of trigger name, and this one
-- must run after challenges_guard_client_update, because it writes columns the
-- guard refuses from a player. Hence the name challenges_rewards: 'r' sorts after
-- 'g'. A name like challenges_apply_rewards would run first and every proof upload
-- would fail. SECURITY DEFINER because it writes profiles.points, which players
-- have no grant on.
--
-- Every award hangs off a false -> true transition that can happen once per
-- challenge, so repeating an update or the sweep never pays twice. The two paths
-- cannot both happen: a ducked forfeit can no longer be approved.
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

  IF (NEW.proof_url IS DISTINCT FROM OLD.proof_url OR NEW.proof_photo_url IS DISTINCT FROM OLD.proof_photo_url)
     AND (NEW.proof_url IS NOT NULL OR NEW.proof_photo_url IS NOT NULL) THEN
    NEW.proof_submitted_at := now();
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

DROP TRIGGER IF EXISTS challenges_apply_rewards ON public.challenges;
DROP TRIGGER IF EXISTS challenges_rewards ON public.challenges;
CREATE TRIGGER challenges_rewards
  BEFORE UPDATE ON public.challenges
  FOR EACH ROW EXECUTE FUNCTION public.challenges_apply_rewards();

-- ============================================================
-- 4. The day 7 sweep
-- ============================================================
-- Plain SQL on its own schedule rather than inside settle-challenges, so it needs
-- no deploy and no service role key. Proof unreviewed 7 days after it was last
-- sent is approved; no proof 7 days after the match is ducked. It runs as the cron owner with no JWT, which
-- challenges_guard_client_update lets through, and challenges_apply_rewards
-- does the awarding exactly as it does for a player's approval.
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
    AND settled_at < now() - interval '7 days';
  GET DIAGNOSTICS ducked = ROW_COUNT;

  RETURN approved + ducked;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_overdue_forfeits() FROM public, anon, authenticated;

-- Half past, so it never runs in the same minute as settle-challenges at :00.
SELECT cron.schedule('resolve-overdue-forfeits', '30 * * * *', $$SELECT public.resolve_overdue_forfeits()$$);
