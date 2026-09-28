-- One friendship row per pair of people, whichever direction it was sent in.
--
-- Kept out of 20260928000000 on purpose, same reasoning as 20260924000001: this
-- fails if duplicates already exist, and a failure here must not roll back the
-- friends-only rule. If it fails, find the duplicates with:
--   select least(requester_id, addressee_id) a, greatest(requester_id, addressee_id) b, count(*)
--   from friendships group by 1, 2 having count(*) > 1;
-- delete all but one row per pair, and run this file again.
--
-- Without it, A can request B while B requests A, leaving two pending rows, and
-- whichever gets accepted first still leaves the other one showing as a request.
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_key
  ON public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
