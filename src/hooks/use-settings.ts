import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/status";

export interface AppSettings {
  whatsapp_phone: string | null;
  callmebot_apikey: string | null;
  thresholds: Thresholds;
}

export const settingsQueryKey = ["app_settings"];

export function useSettings() {
  return useQuery<AppSettings>({
    queryKey: settingsQueryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select(
          "whatsapp_phone, callmebot_apikey, threshold_early, threshold_medium, threshold_critical",
        )
        .maybeSingle();
      if (error) throw error;
      return {
        whatsapp_phone: data?.whatsapp_phone ?? null,
        callmebot_apikey: data?.callmebot_apikey ?? null,
        thresholds: {
          early: data?.threshold_early ?? DEFAULT_THRESHOLDS.early,
          medium: data?.threshold_medium ?? DEFAULT_THRESHOLDS.medium,
          critical: data?.threshold_critical ?? DEFAULT_THRESHOLDS.critical,
        },
      };
    },
  });
}
