-- The live database had no DELETE policy on challenges at all, so "Cancel
-- Challenge" in the Challenges screen silently deleted nothing: with RLS on and no
-- policy, a DELETE matches zero rows and returns no error, and the challenge just
-- stayed there. challenges_delete_challenger in 20260604000000 was meant to cover
-- this but that file never ran.
--
-- Scoped to pending as well as to the challenger, matching what the app sends.
-- Once the opponent has accepted, the challenge is a commitment on both sides and
-- the challenger alone cannot make it disappear.
DROP POLICY IF EXISTS "challenges_delete_challenger" ON public.challenges;
CREATE POLICY "challenges_delete_challenger"
  ON public.challenges FOR DELETE
  TO authenticated
  USING (auth.uid() = challenger_id AND status = 'pending');
