-- =========================================================================
-- Vienna Expiry Tracker: Database Migration for Telegram & Notifications
-- Run this SQL in your Supabase Dashboard -> SQL Editor -> Run
-- =========================================================================

-- 1. Add Telegram bot token, Chat ID, and channel preference to app_settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS telegram_bot_token text,
  ADD COLUMN IF NOT EXISTS telegram_chat_id text,
  ADD COLUMN IF NOT EXISTS notify_channel text NOT NULL DEFAULT 'both';

-- 2. Add channel column to notification_log
ALTER TABLE public.notification_log
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp';

-- 3. Ensure permissions and RLS policy allow authenticated users to log notifications
GRANT INSERT ON public.notification_log TO authenticated;
DROP POLICY IF EXISTS "log insert" ON public.notification_log;
CREATE POLICY "log insert" ON public.notification_log FOR INSERT TO authenticated WITH CHECK (true);

-- 4. Create performance indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notification_log_channel ON public.notification_log(channel);
CREATE INDEX IF NOT EXISTS idx_notification_log_created_at ON public.notification_log(created_at DESC);

-- Confirm migration success
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'app_settings';
