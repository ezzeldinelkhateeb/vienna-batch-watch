import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/status";

export interface AppSettings {
  whatsapp_phone: string | null;
  callmebot_apikey: string | null;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  notify_channel: "both" | "whatsapp" | "telegram";
  thresholds: Thresholds;
  is_app_locked: boolean;
  lock_message: string | null;
  locked_at: string | null;
  locked_by: string | null;
}

export const settingsQueryKey = ["app_settings"];

export function useSettings() {
  return useQuery<AppSettings>({
    queryKey: settingsQueryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select(
          "whatsapp_phone, callmebot_apikey, telegram_bot_token, telegram_chat_id, notify_channel, threshold_early, threshold_medium, threshold_critical, is_app_locked, lock_message, locked_at, locked_by",
        )
        .maybeSingle();
      if (error) {
        // Fallback gracefully if columns are not yet applied in DB
        return {
          whatsapp_phone: null,
          callmebot_apikey: null,
          telegram_bot_token: null,
          telegram_chat_id: null,
          notify_channel: "both",
          thresholds: DEFAULT_THRESHOLDS,
          is_app_locked: false,
          lock_message: null,
          locked_at: null,
          locked_by: null,
        };
      }
      return {
        whatsapp_phone: data?.whatsapp_phone ?? null,
        callmebot_apikey: data?.callmebot_apikey ?? null,
        telegram_bot_token: data?.telegram_bot_token ?? null,
        telegram_chat_id: data?.telegram_chat_id ?? null,
        notify_channel: (data?.notify_channel as "both" | "whatsapp" | "telegram") ?? "both",
        thresholds: {
          early: data?.threshold_early ?? DEFAULT_THRESHOLDS.early,
          medium: data?.threshold_medium ?? DEFAULT_THRESHOLDS.medium,
          critical: data?.threshold_critical ?? DEFAULT_THRESHOLDS.critical,
        },
        is_app_locked: Boolean((data as { is_app_locked?: boolean } | null)?.is_app_locked),
        lock_message: (data as { lock_message?: string } | null)?.lock_message ?? null,
        locked_at: (data as { locked_at?: string } | null)?.locked_at ?? null,
        locked_by: (data as { locked_by?: string } | null)?.locked_by ?? null,
      };
    },
  });
}
