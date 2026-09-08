import { createServerFn } from "@tanstack/react-start";
import { daysUntil, statusFor, type Thresholds } from "./status";
import { buildAlertMessage, buildDirectWhatsAppUrl, sendWhatsApp } from "./whatsapp.server";
import { sendTelegram } from "./telegram.server";

export interface TestWhatsAppPayload {
  phone?: string;
  apiKey?: string;
}

export interface TestTelegramPayload {
  botToken?: string;
  chatId?: string;
}

/** Sends a test WhatsApp message using provided inputs or saved CallMeBot credentials. */
export const sendTestWhatsApp = createServerFn({ method: "POST" })
  .validator((data?: TestWhatsAppPayload) => data)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let targetPhone = data?.phone?.trim();
    let targetKey = data?.apiKey?.trim();

    if (!targetPhone || !targetKey) {
      const { data: settings } = await supabaseAdmin
        .from("app_settings")
        .select("whatsapp_phone, callmebot_apikey")
        .maybeSingle();

      targetPhone = targetPhone || settings?.whatsapp_phone || undefined;
      targetKey = targetKey || settings?.callmebot_apikey || undefined;
    }

    const testMessage =
      "🍫 *Vienna Expiry Tracker* 🍫\n" +
      "هذه رسالة تجريبية لتأكيد عمل تنبيهات صلاحية المواد الخام بنجاح ✅\n" +
      "وقت الإرسال: " +
      new Date().toLocaleString("ar-EG");

    const directUrl = buildDirectWhatsAppUrl(targetPhone, testMessage);

    if (!targetPhone || !targetKey) {
      return {
        success: false as const,
        error: "يرجى إدخال رقم الواتساب ومفتاح CallMeBot أولاً.",
        directUrl,
      };
    }

    const result = await sendWhatsApp(targetPhone, targetKey, testMessage);

    await supabaseAdmin.from("notification_log").insert({
      item_name: "رسالة تجريبية (واتساب)",
      status: "test",
      channel: "whatsapp",
      message: "رسالة تجريبية لاختبار إعدادات الواتساب",
      phone: targetPhone,
      success: result.success,
      error: result.error ?? null,
    });

    return {
      success: result.success as boolean,
      isDown: result.isDown ?? false,
      error: result.error,
      directUrl,
    };
  });

/** Sends a test Telegram message using provided inputs or saved Telegram credentials. */
export const sendTestTelegram = createServerFn({ method: "POST" })
  .validator((data?: TestTelegramPayload) => data)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let targetToken = data?.botToken?.trim();
    let targetChat = data?.chatId?.trim();

    if (!targetToken || !targetChat) {
      const { data: settings } = await supabaseAdmin
        .from("app_settings")
        .select("telegram_bot_token, telegram_chat_id")
        .maybeSingle();

      targetToken = targetToken || settings?.telegram_bot_token || undefined;
      targetChat = targetChat || settings?.telegram_chat_id || undefined;
    }

    if (!targetToken || !targetChat) {
      return {
        success: false as const,
        error: "يرجى إدخال رمز بوت تليجرام (Bot Token) ومعرّف المحادثة (Chat ID) أولاً.",
      };
    }

    const testMessage =
      "🍫 *Vienna Expiry Tracker (Telegram)* 🍫\n" +
      "تأكيد استلام: تنبيهات صلاحية المواد الخام عبر تليجرام تعمل بنجاح وبأعلى سرعة ✅\n" +
      "وقت الإرسال: " +
      new Date().toLocaleString("ar-EG");

    const result = await sendTelegram(targetToken, targetChat, testMessage);

    await supabaseAdmin.from("notification_log").insert({
      item_name: "رسالة تجريبية (تليجرام)",
      status: "test",
      channel: "telegram",
      message: "رسالة تجريبية لاختبار إعدادات بوت تليجرام",
      phone: targetChat,
      success: result.success,
      error: result.error ?? null,
    });

    return {
      success: result.success as boolean,
      error: result.error,
    };
  });

/** Central engine that checks expiry dates for all raw materials and dispatches notifications. */
export async function runExpiryCheckEngine() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select(
      "whatsapp_phone, callmebot_apikey, telegram_bot_token, telegram_chat_id, notify_channel, threshold_early, threshold_medium, threshold_critical",
    )
    .maybeSingle();

  const thresholds: Thresholds = {
    early: settings?.threshold_early ?? 90,
    medium: settings?.threshold_medium ?? 60,
    critical: settings?.threshold_critical ?? 30,
  };

  const { data: items, error } = await supabaseAdmin
    .from("items")
    .select(
      "id, item_code, batch_number, name, supplier, quantity, unit, expiry_date, storage_location, qc_status, last_notified_status",
    )
    .order("expiry_date", { ascending: true });

  if (error) throw new Error(error.message);

  let sentWhatsApp = 0;
  let sentTelegram = 0;
  let reset = 0;
  let skipped = 0;
  const channel = settings?.notify_channel ?? "both";

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

    if (item.last_notified_status === status) {
      skipped += 1;
      continue;
    }

    const message = buildAlertMessage(item, status, days);

    // Send WhatsApp if configured and enabled
    if (channel === "both" || channel === "whatsapp") {
      if (!settings?.whatsapp_phone || !settings?.callmebot_apikey) {
        await supabaseAdmin.from("notification_log").insert({
          item_id: item.id,
          item_name: item.name,
          status,
          channel: "whatsapp",
          message,
          phone: null,
          success: false,
          error: "بيانات واتساب غير مكتملة في الإعدادات",
        });
      } else {
        const waResult = await sendWhatsApp(
          settings.whatsapp_phone,
          settings.callmebot_apikey,
          message,
        );
        await supabaseAdmin.from("notification_log").insert({
          item_id: item.id,
          item_name: item.name,
          status,
          channel: "whatsapp",
          message,
          phone: settings.whatsapp_phone,
          success: waResult.success,
          error: waResult.error ?? null,
        });
        if (waResult.success) sentWhatsApp += 1;
      }
    }

    // Send Telegram if configured and enabled
    if (channel === "both" || channel === "telegram") {
      if (!settings?.telegram_bot_token || !settings?.telegram_chat_id) {
        await supabaseAdmin.from("notification_log").insert({
          item_id: item.id,
          item_name: item.name,
          status,
          channel: "telegram",
          message,
          phone: null,
          success: false,
          error: "بيانات تليجرام غير مكتملة في الإعدادات",
        });
      } else {
        const tgResult = await sendTelegram(
          settings.telegram_bot_token,
          settings.telegram_chat_id,
          message,
        );
        await supabaseAdmin.from("notification_log").insert({
          item_id: item.id,
          item_name: item.name,
          status,
          channel: "telegram",
          message,
          phone: settings.telegram_chat_id,
          success: tgResult.success,
          error: tgResult.error ?? null,
        });
        if (tgResult.success) sentTelegram += 1;
      }
    }

    // Update item notified status
    await supabaseAdmin
      .from("items")
      .update({ last_notified_status: status })
      .eq("id", item.id);
  }

  return {
    checked: items?.length ?? 0,
    sentWhatsApp,
    sentTelegram,
    totalSent: sentWhatsApp + sentTelegram,
    reset,
    skipped,
  };
}

/** Server function to trigger the expiry check manually from the UI. */
export const triggerExpiryCheckNow = createServerFn({ method: "POST" }).handler(
  async () => {
    try {
      const summary = await runExpiryCheckEngine();
      return { success: true as const, ...summary };
    } catch (err) {
      return {
        success: false as const,
        error: err instanceof Error ? err.message : "خطأ غير معروف أثناء فحص الصلاحية",
      };
    }
  },
);
