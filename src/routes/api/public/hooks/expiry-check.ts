import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { daysUntil, statusFor, type Thresholds } from "@/lib/status";
import { buildAlertMessage, sendWhatsApp } from "@/lib/whatsapp.server";

async function runDailyCheck() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("whatsapp_phone, callmebot_apikey, threshold_early, threshold_medium, threshold_critical")
    .maybeSingle();

  const thresholds: Thresholds = {
    early: settings?.threshold_early ?? 90,
    medium: settings?.threshold_medium ?? 60,
    critical: settings?.threshold_critical ?? 30,
  };

  const { data: items, error } = await supabaseAdmin
    .from("items")
    .select("id, item_code, batch_number, name, supplier, quantity, unit, expiry_date, storage_location, qc_status, last_notified_status")
    .order("expiry_date", { ascending: true });

  if (error) throw new Error(error.message);

  let sent = 0;
  let reset = 0;

  for (const item of items ?? []) {
    const days = daysUntil(item.expiry_date);
    const status = statusFor(days, thresholds);

    if (status === "normal") {
      if (item.last_notified_status !== null) {
        await supabaseAdmin
          .from("items")
          .update({ last_notified_status: null })
          .eq("id", item.id);
        reset += 1;
      }
      continue;
    }

    if (item.last_notified_status === status) continue;

    const message = buildAlertMessage(item, status, days);

    if (!settings?.whatsapp_phone || !settings?.callmebot_apikey) {
      await supabaseAdmin.from("notification_log").insert({
        item_id: item.id,
        item_name: item.name,
        status,
        message,
        phone: null,
        success: false,
        error: "WhatsApp credentials are not configured in Settings",
      });
      continue;
    }

    const result = await sendWhatsApp(
      settings.whatsapp_phone,
      settings.callmebot_apikey,
      message,
    );

    await supabaseAdmin.from("notification_log").insert({
      item_id: item.id,
      item_name: item.name,
      status,
      message,
      phone: settings.whatsapp_phone,
      success: result.success,
      error: result.error ?? null,
    });

    if (result.success) {
      await supabaseAdmin
        .from("items")
        .update({ last_notified_status: status })
        .eq("id", item.id);
      sent += 1;
    }
  }

  return { checked: items?.length ?? 0, sent, reset };
}

export const Route = createFileRoute("/api/public/hooks/expiry-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        try {
          const summary = await runDailyCheck();
          return new Response(JSON.stringify({ success: true, ...summary }), {
            headers: { "content-type": "application/json" },
          });
        } catch (error) {
          console.error("[expiry-check]", error);
          return new Response(
            JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "unknown",
            }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
