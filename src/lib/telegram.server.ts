export interface TelegramResult {
  success: boolean;
  error?: string;
  messageId?: number;
}

export interface TelegramSendOptions {
  parse_mode?: "Markdown" | "HTML" | undefined;
  reply_markup?: any | undefined;
  disable_web_page_preview?: boolean | undefined;
}

export interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
}

/**
 * Sends a message via the official Telegram Bot API.
 * Includes resilient auto-fallback: If Markdown parsing fails due to reserved characters,
 * it retries instantly as plain text so no message is ever silently lost.
 */
export async function sendTelegram(
  botToken: string,
  chatId: string,
  text: string,
  options?: TelegramSendOptions,
): Promise<TelegramResult> {
  const cleanToken = botToken.trim();
  const cleanChat = chatId.trim();

  if (!cleanToken || !cleanChat) {
    return { success: false, error: "رمز البوت (Bot Token) ومعرّف المحادثة (Chat ID) مطلوبان." };
  }

  const url = `https://api.telegram.org/bot${encodeURIComponent(cleanToken)}/sendMessage`;
  const parseMode = options?.parse_mode ?? "Markdown";

  const payload: Record<string, any> = {
    chat_id: cleanChat,
    text,
    disable_web_page_preview: options?.disable_web_page_preview ?? true,
    ...(parseMode ? { parse_mode: parseMode } : {}),
    ...(options?.reply_markup ? { reply_markup: options.reply_markup } : {}),
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as { ok: boolean; description?: string; result?: { message_id: number } };

    if (!res.ok || !data.ok) {
      const desc = data.description ?? `HTTP ${res.status}`;

      // If markdown entity parsing error, retry once as plain text
      if (parseMode && (desc.includes("can't parse entities") || desc.includes("entity") || desc.includes("formatting"))) {
        console.warn("[sendTelegram] Retrying without parse_mode due to entity parse error:", desc);
        const fallbackRes = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: cleanChat,
            text,
            disable_web_page_preview: options?.disable_web_page_preview ?? true,
            ...(options?.reply_markup ? { reply_markup: options.reply_markup } : {}),
          }),
        });
        const fallbackData = (await fallbackRes.json()) as { ok: boolean; description?: string; result?: { message_id: number } };
        if (fallbackRes.ok && fallbackData.ok) {
          return { success: true, messageId: fallbackData.result?.message_id };
        }
      }

      let arabicDesc = desc;
      if (desc.includes("Not Found") || desc.includes("Unauthorized")) {
        arabicDesc = "رمز البوت (Bot Token) غير صالح. تأكد من نسخه بدقة من @BotFather.";
      } else if (desc.includes("chat not found")) {
        arabicDesc =
          "معرّف المحادثة (Chat ID) غير موجود أو لم يتم بدء المحادثة مع البوت بعد (اضغط Start في البوت).";
      } else if (desc.includes("bot was blocked by the user")) {
        arabicDesc = "البوت محظور من قِبل المستخدم. يرجى إلغاء الحظر وإعادة المحاولة.";
      }
      return {
        success: false,
        error: `خطأ في إرسال تليجرام: ${arabicDesc}`,
      };
    }

    return { success: true, messageId: data.result?.message_id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "خطأ في الاتصال بسيرفر تليجرام.",
    };
  }
}

/**
 * Sends a photo via the official Telegram Bot API with caption and inline keyboard.
 * Includes resilient auto-fallback for caption formatting.
 */
export async function sendTelegramPhoto(
  botToken: string,
  chatId: string,
  photoUrl: string,
  caption?: string,
  options?: TelegramSendOptions,
): Promise<TelegramResult> {
  const cleanToken = botToken.trim();
  const cleanChat = chatId.trim();

  if (!cleanToken || !cleanChat || !photoUrl) {
    return { success: false, error: "بيانات إرسال الصورة غير مكتملة." };
  }

  const url = `https://api.telegram.org/bot${encodeURIComponent(cleanToken)}/sendPhoto`;
  const parseMode = options?.parse_mode ?? "Markdown";

  try {
    const payload: Record<string, any> = {
      chat_id: cleanChat,
      photo: photoUrl,
      caption: caption || undefined,
      ...(parseMode ? { parse_mode: parseMode } : {}),
      ...(options?.reply_markup ? { reply_markup: options.reply_markup } : {}),
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as { ok: boolean; description?: string; result?: { message_id: number } };
    if (!res.ok || !data.ok) {
      const desc = data.description ?? `HTTP ${res.status}`;
      // If caption formatting error, retry without parse_mode
      if (caption && parseMode && (desc.includes("can't parse entities") || desc.includes("entity"))) {
        const fallbackRes = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: cleanChat,
            photo: photoUrl,
            caption,
            ...(options?.reply_markup ? { reply_markup: options.reply_markup } : {}),
          }),
        });
        const fallbackData = (await fallbackRes.json()) as { ok: boolean; description?: string; result?: { message_id: number } };
        if (fallbackRes.ok && fallbackData.ok) {
          return { success: true, messageId: fallbackData.result?.message_id };
        }
      }
      return { success: false, error: desc };
    }

    return { success: true, messageId: data.result?.message_id };
  } catch (err: any) {
    return { success: false, error: err?.message || "خطأ في إرسال صورة تليجرام." };
  }
}

/**
 * Edits an existing message text and/or inline keyboard in-place.
 */
export async function editTelegramMessage(
  botToken: string,
  chatId: string,
  messageId: number,
  text: string,
  options?: TelegramSendOptions,
): Promise<TelegramResult> {
  const cleanToken = botToken.trim();
  const url = `https://api.telegram.org/bot${encodeURIComponent(cleanToken)}/editMessageText`;
  const parseMode = options?.parse_mode ?? "Markdown";

  try {
    const payload: Record<string, any> = {
      chat_id: chatId,
      message_id: messageId,
      text,
      disable_web_page_preview: options?.disable_web_page_preview ?? true,
      ...(parseMode ? { parse_mode: parseMode } : {}),
      ...(options?.reply_markup ? { reply_markup: options.reply_markup } : {}),
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as { ok: boolean; description?: string };
    if (!res.ok || !data.ok) {
      // If Markdown failed, retry plain text
      if (parseMode && (data.description?.includes("can't parse entities") || data.description?.includes("entity"))) {
        delete payload.parse_mode;
        const fallbackRes = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const fallbackData = (await fallbackRes.json()) as { ok: boolean; description?: string };
        return { success: fallbackData.ok, error: fallbackData.description };
      }
      return { success: false, error: data.description };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Answer an interactive Telegram callback query immediately to dismiss the button loading spinner.
 */
export async function answerTelegramCallback(
  botToken: string,
  callbackQueryId: string,
  text?: string,
  showAlert: boolean = false,
): Promise<TelegramResult> {
  const cleanToken = botToken.trim();
  const url = `https://api.telegram.org/bot${encodeURIComponent(cleanToken)}/answerCallbackQuery`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text || undefined,
        show_alert: showAlert,
      }),
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    return { success: data.ok, error: data.description };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Registers the Telegram Webhook URL so the bot can receive messages and reply interactively.
 * CRITICAL: allowed_updates MUST include callback_query for interactive buttons!
 */
export async function setTelegramWebhook(
  botToken: string,
  webhookUrl: string,
): Promise<{ ok: boolean; description?: string }> {
  const cleanToken = botToken.trim();
  const url = `https://api.telegram.org/bot${encodeURIComponent(cleanToken)}/setWebhook`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message", "callback_query", "channel_post", "edited_message"],
        drop_pending_updates: false,
      }),
    });
    return (await res.json()) as { ok: boolean; description?: string };
  } catch (err) {
    return { ok: false, description: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Registers the official Telegram command menu (the [/] button in chat).
 */
export async function setTelegramBotCommands(
  botToken: string,
): Promise<{ ok: boolean; description?: string }> {
  const cleanToken = botToken.trim();
  const url = `https://api.telegram.org/bot${encodeURIComponent(cleanToken)}/setMyCommands`;

  const commands = [
    { command: "morning", description: "🌅 نشرة وردية الصباح وخطة خامات اليوم" },
    { command: "lowstock", description: "📉 كشف النواقص والأصناف قاربت على النفاد" },
    { command: "status", description: "📊 تقرير المخزون وموقف الصلاحيات والجودة" },
    { command: "urgent", description: "🚨 الخامات الحرجة والوشيكة الانتهاء فوراً" },
    { command: "fefo", description: "🥇 أولوية الصرف لخطوط التصنيع (FEFO #1)" },
    { command: "qc", description: "🔒 شحنات الحجر وبانتظار فحص الجودة" },
    { command: "expired", description: "⛔ كشف الخامات المنتهية الصلاحية" },
    { command: "check", description: "⚡ تشغيل فحص فوري وإرسال التنبيهات" },
    { command: "help", description: "ℹ️ دليل استخدام وقدرات البوت الذكي" },
  ];

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands }),
    });
    return (await res.json()) as { ok: boolean; description?: string };
  } catch (err) {
    return { ok: false, description: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Retrieves information about the bot account using getMe.
 */
export async function getTelegramBotInfo(
  botToken: string,
): Promise<{ ok: boolean; result?: TelegramBotInfo; description?: string }> {
  const cleanToken = botToken.trim();
  const url = `https://api.telegram.org/bot${encodeURIComponent(cleanToken)}/getMe`;
  try {
    const res = await fetch(url);
    return await res.json();
  } catch (err) {
    return { ok: false, description: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Retrieves the current webhook configuration status from Telegram.
 */
export async function getTelegramWebhookInfo(
  botToken: string,
): Promise<{
  ok: boolean;
  result?: {
    url: string;
    has_custom_certificate?: boolean;
    pending_update_count?: number;
    last_error_date?: number;
    last_error_message?: string;
    max_connections?: number;
    allowed_updates?: string[];
  };
}> {
  const cleanToken = botToken.trim();
  const url = `https://api.telegram.org/bot${encodeURIComponent(cleanToken)}/getWebhookInfo`;
  try {
    const res = await fetch(url);
    return await res.json();
  } catch {
    return { ok: false };
  }
}

/**
 * Removes the Telegram Webhook so the bot can revert to manual polling if needed.
 */
export async function deleteTelegramWebhook(
  botToken: string,
): Promise<{ ok: boolean; description?: string }> {
  const cleanToken = botToken.trim();
  const url = `https://api.telegram.org/bot${encodeURIComponent(cleanToken)}/deleteWebhook?drop_pending_updates=true`;
  try {
    const res = await fetch(url);
    return await res.json();
  } catch (err) {
    return { ok: false, description: err instanceof Error ? err.message : "Network error" };
  }
}
