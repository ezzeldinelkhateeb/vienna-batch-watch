-- Add Telegram integration and multi-channel support to app_settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS telegram_bot_token text,
  ADD COLUMN IF NOT EXISTS telegram_chat_id text,
  ADD COLUMN IF NOT EXISTS notify_channel text NOT NULL DEFAULT 'both';

-- Add channel column to notification_log
ALTER TABLE public.notification_log
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp';

-- Create index on channel and created_at for faster queries
CREATE INDEX IF NOT EXISTS idx_notification_log_channel ON public.notification_log(channel);
CREATE INDEX IF NOT EXISTS idx_notification_log_created_at ON public.notification_log(created_at DESC);
