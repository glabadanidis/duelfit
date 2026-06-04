-- Enable pg_cron extension (requires Supabase Pro or manual enablement in dashboard)
-- Run this manually in the SQL editor if the migration fails:
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;

create extension if not exists pg_cron;
create extension if not exists pg_net;

SELECT cron.schedule(
  'settle-challenges-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://nofawxywnhqrqnwokkge.supabase.co/functions/v1/settle-challenges',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
