import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Sends a test WhatsApp message using the saved CallMeBot credentials. */
export const sendTestWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: settings, error } = await context.supabase
      .from("app_settings")
      .select("whatsapp_phone, callmebot_apikey")
      .maybeSingle();

    if (error) return { success: false as const, error: error.message };
    if (!settings?.whatsapp_phone || !settings?.callmebot_apikey) {
      return { success: false as const, error: "missing_credentials" };
    }

    const { sendWhatsApp } = await import("./whatsapp.server");
    const result = await sendWhatsApp(
      settings.whatsapp_phone,
      settings.callmebot_apikey,
      "Vienna Expiry Tracker: test message. WhatsApp alerts are working correctly ✅",
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("notification_log").insert({
      item_name: "Test message",
      status: "test",
      message: "Test message from Settings",
      phone: settings.whatsapp_phone,
      success: result.success,
      error: result.error ?? null,
    });

    return result.success
      ? { success: true as const }
      : { success: false as const, error: result.error ?? "unknown" };
  });
