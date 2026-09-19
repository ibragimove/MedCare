-- Migration 007: pg_cron + pg_net SLA tick every minute
-- Run this in the Supabase SQL Editor AFTER migration_006
-- Requires pg_cron and pg_net extensions (enabled in Supabase by default on paid plans)
-- On free plans, the daily Vercel cron in vercel.json is the only fallback

-- Enable extensions (may already be enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule SLA tick every minute to call our API endpoint
-- Replace 'YOUR_VERCEL_URL' with the actual deployment URL and 'YOUR_CRON_SECRET' with the CRON_SECRET env var value
SELECT cron.schedule(
  'sla-tick',
  '* * * * *',
  $$
    SELECT net.http_post(
      url := 'https://continuitycare-ai.vercel.app/api/cron/sla-tick',
      headers := '{"Authorization": "Bearer YOUR_CRON_SECRET", "Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    )
  $$
);

-- To update the secret after setting it:
-- SELECT cron.unschedule('sla-tick');
-- Then re-run the SELECT cron.schedule above with the real secret

-- View scheduled jobs
-- SELECT * FROM cron.job;
