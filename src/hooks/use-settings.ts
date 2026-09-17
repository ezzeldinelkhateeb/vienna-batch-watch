import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/status";

export interface CustomActionButton {
  id: string;
  label_ar: string;
  label_en: string;
  url: string;
  icon?: string;
  color?: "default" | "brand" | "emerald" | "amber" | "rose" | "purple" | "blue";
  target?: "_blank" | "_self";
  is_active: boolean;
  order?: number;
}

export interface FeatureFlags {
  enable_kpis?: boolean;
  enable_dispense?: boolean;
  enable_waste_prevention?: boolean;
  enable_monthly_audit?: boolean;
  enable_barcode_scanner?: boolean;
  allow_export_non_admin?: boolean;
}

export const DEFAULT_PRODUCTION_LINES: string[] = [
  "خط بسكويت ويفر (Wafer Line)",
  "خط صب الشوكولاتة والبارات (Moulding Line)",
  "خط الكريمات والحشوات (Creams & Fillings)",
  "خط التعبئة والتغليف (Packaging Line)",
  "معمل الجودة والتطوير (QC Lab / R&D)",
];

export const DEFAULT_STORAGE_LOCATIONS: string[] = [
  "ثلاجة الشوكولاتة 18°C (Chocolate Cool Store)",
  "مخزن الدقيق والنواشف 72% (Flour Warehouse)",
  "صومعة السكر والنشا (Sugar Silo)",
  "مستودع المنكهات والدهون النباتية (Fats & Flavors)",
  "غرفة مواد التعبئة والتغليف (Packaging Store)",
  "منطقة الحجر المؤقت (Quarantine Bay)",
];

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  enable_kpis: true,
  enable_dispense: true,
  enable_waste_prevention: true,
  enable_monthly_audit: true,
  enable_barcode_scanner: true,
  allow_export_non_admin: true,
};

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
  custom_buttons: CustomActionButton[];
  production_lines: string[];
  storage_locations: string[];
  feature_flags: FeatureFlags;
  factory_name: string;
  system_tagline: string;
  app_logo_url: string | null;
  app_icon: string;
}

export const settingsQueryKey = ["app_settings"];

export function useSettings() {
  return useQuery<AppSettings>({
    queryKey: settingsQueryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .maybeSingle();

      const fallback: AppSettings = {
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
        custom_buttons: [],
        production_lines: DEFAULT_PRODUCTION_LINES,
        storage_locations: DEFAULT_STORAGE_LOCATIONS,
        feature_flags: DEFAULT_FEATURE_FLAGS,
        factory_name: "Vienna",
        system_tagline: "Factory Batch Watch & Expiry Guard",
        app_logo_url: null,
        app_icon: "🏭",
      };

      if (error || !data) {
        return fallback;
      }

      const raw = data as Record<string, any>;

      return {
        whatsapp_phone: raw.whatsapp_phone ?? null,
        callmebot_apikey: raw.callmebot_apikey ?? null,
        telegram_bot_token: raw.telegram_bot_token ?? null,
        telegram_chat_id: raw.telegram_chat_id ?? null,
        notify_channel: (raw.notify_channel as "both" | "whatsapp" | "telegram") ?? "both",
        thresholds: {
          early: raw.threshold_early ?? DEFAULT_THRESHOLDS.early,
          medium: raw.threshold_medium ?? DEFAULT_THRESHOLDS.medium,
          critical: raw.threshold_critical ?? DEFAULT_THRESHOLDS.critical,
        },
        is_app_locked: Boolean(raw.is_app_locked),
        lock_message: raw.lock_message ?? null,
        locked_at: raw.locked_at ?? null,
        locked_by: raw.locked_by ?? null,
        custom_buttons: Array.isArray(raw.custom_buttons) ? (raw.custom_buttons as CustomActionButton[]) : [],
        production_lines: Array.isArray(raw.production_lines) && raw.production_lines.length > 0
          ? (raw.production_lines as string[])
          : DEFAULT_PRODUCTION_LINES,
        storage_locations: Array.isArray(raw.storage_locations) && raw.storage_locations.length > 0
          ? (raw.storage_locations as string[])
          : DEFAULT_STORAGE_LOCATIONS,
        feature_flags: {
          ...DEFAULT_FEATURE_FLAGS,
          ...(typeof raw.feature_flags === "object" && raw.feature_flags !== null ? raw.feature_flags : {}),
        },
        factory_name: (raw.factory_name && typeof raw.factory_name === "string") ? raw.factory_name : "Vienna",
        system_tagline: (raw.system_tagline && typeof raw.system_tagline === "string") ? raw.system_tagline : "Factory Batch Watch & Expiry Guard",
        app_logo_url: raw.app_logo_url ?? null,
        app_icon: (raw.app_icon && typeof raw.app_icon === "string") ? raw.app_icon : "🏭",
      };
    },
  });
}
