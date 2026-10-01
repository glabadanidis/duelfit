-- The hourly settle-challenges call reads its key from Vault instead of a
-- database setting.
--
-- 20260604000001 built the header from current_setting('app.service_role_key').
-- If that setting was never stored, 'Bearer ' || NULL is NULL, the call goes out
-- with no key, the function answers 401 and no match is ever settled. Nothing
-- in the app shows it: challenges simply stay accepted.
--
-- BEFORE running this file, store the key once, in the SQL editor only. Never
-- save it in this repo, a migration, a comment or a chat:
--
--   select vault.create_secret('<secret key>', 'service_role_key');
--
-- The secret key is the sb_secret_... one under Settings > API Keys > Secret
-- keys, NOT the legacy eyJ... service_role JWT. The function compares the
-- header with its SUPABASE_SERVICE_ROLE_KEY, which on this project holds the
-- sb_secret_ key; the legacy JWT is a valid service role key and still got 401.
--
-- To replace it later:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'service_role_key'),
--     '<new key>');

SELECT cron.unschedule('settle-challenges-hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'settle-challenges-hourly');

SELECT cron.schedule(
  'settle-challenges-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://nofawxywnhqrqnwokkge.supabase.co/functions/v1/settle-challenges',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
