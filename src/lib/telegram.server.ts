export interface TelegramResult {
  success: boolean;
  error?: string;
}

export interface TelegramSendOptions {
  parse_mode?: "Markdown" | "HTML" | undefined;
  reply_markup?: any | undefined;
  disable_web_page_preview?: boolean | undefined;
}

/**
 * Sends a message via the official Telegram Bot API.
 * Free, official, zero-downtime, and supports direct group/channel alerts with rich keyboards.
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

  try {
    const payload: Record<string, any> = {
      chat_id: cleanChat,
      text,
      disable_web_page_preview: options?.disable_web_page_preview ?? true,
    };

    if (options?.parse_mode) {
      payload.parse_mode = options.parse_mode;
    } else {
      // Default to Markdown for bold/italic formatting
      payload.parse_mode = "Markdown";
    }

    if (options?.reply_markup) {
      payload.reply_markup = options.reply_markup;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as { ok: boolean; description?: string };

    if (!res.ok || !data.ok) {
      const desc = data.description ?? `HTTP ${res.status}`;
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

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "خطأ في الاتصال بسيرفر تليجرام.",
    };
  }
}

/**
 * Answer an interactive Telegram callback query (when inline button clicked)
 */
export async function answerTelegramCallback(
  botToken: string,
  callbackQueryId: string,
  text?: string,
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
 */
export async function setTelegramWebhook(
  botToken: string,
  webhookUrl: string,
): Promise<{ ok: boolean; description?: string }> {
  const cleanToken = botToken.trim();
  const url = `https://api.telegram.org/bot${encodeURIComponent(cleanToken)}/setWebhook?url=${encodeURIComponent(webhookUrl)}&allowed_updates=["message"]`;
  try {
    const res = await fetch(url);
    return (await res.json()) as { ok: boolean; description?: string };
  } catch (err) {
    return { ok: false, description: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Retrieves the current webhook configuration status from Telegram.
 */
export async function getTelegramWebhookInfo(
  botToken: string,
): Promise<{ ok: boolean; result?: { url: string; pending_update_count?: number; last_error_message?: string } }> {
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
  const url = `https://api.telegram.org/bot${encodeURIComponent(cleanToken)}/deleteWebhook`;
  try {
    const res = await fetch(url);
    return await res.json();
  } catch (err) {
    return { ok: false, description: err instanceof Error ? err.message : "Network error" };
  }
}
