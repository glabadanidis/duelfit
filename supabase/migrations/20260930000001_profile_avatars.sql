-- Profile photos. The player picks a photo on Profile; it goes to the public
-- avatars bucket under their own user id and the URL is stored on the profile.
--
--   avatars/<user id>/<timestamp>.jpg
--
-- A new file name per upload, never an overwrite, so no device keeps showing a
-- cached old photo. The app deletes the previous file after the new one is saved.

-- ============================================================
-- 1. The column, and the right to write it
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- Adds to the column grant in 20260928000003. points and the forfeit counters
-- stay unwritable.
GRANT UPDATE (avatar_url) ON public.profiles TO authenticated;

-- ============================================================
-- 2. The bucket
-- ============================================================
-- Public, so the URL works in an Image without a signed link. 2 MB and images
-- only; the app crops to a square and compresses well under that.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. Who may write
-- ============================================================
-- Only inside your own folder. Reading goes through the public URL and needs no
-- policy; SELECT is here because removing a file looks it up first.
DROP POLICY IF EXISTS avatars_select_own ON storage.objects;
DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;

CREATE POLICY avatars_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY avatars_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY avatars_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
