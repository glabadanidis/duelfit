-- Realtime for the tab badges. The Friends tab counts incoming requests and
-- listens for changes to friendships, which only arrive if the table is in the
-- supabase_realtime publication. Home has always subscribed to challenges but no
-- migration ever published it, so it is here too, so that the repo describes the
-- database. Each is a no-op if the table is already published.
--
-- Realtime respects RLS, so a player only hears about rows they can select.
-- DELETE events carry only the primary key and cannot be filtered, the app uses
-- them purely as a signal to recount.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['challenges', 'friendships'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END;
$$;
