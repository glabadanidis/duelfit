-- Remove old cron job and re-add with service role auth header
SELECT cron.unschedule('settle-challenges-hourly');

SELECT cron.schedule(
  'settle-challenges-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://nofawxywnhqrqnwokkge.supabase.co/functions/v1/settle-challenges',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
