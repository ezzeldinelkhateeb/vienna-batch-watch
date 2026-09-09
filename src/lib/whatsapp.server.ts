export interface WhatsAppResult {
  success: boolean;
  error?: string;
  isDown?: boolean;
}

export { buildAlertMessage, buildDirectWhatsAppUrl } from "./whatsapp.shared";

/**
 * Sends a WhatsApp message through the CallMeBot API.
 * Accurately diagnoses CallMeBot outages, invalid API keys, and unactivated numbers.
 */
export async function sendWhatsApp(
  phone: string,
  apiKey: string,
  text: string,
): Promise<WhatsAppResult> {
  const cleanPhone = phone.trim().replace(/[^\d+]/g, "");
  if (!cleanPhone || !apiKey.trim()) {
    return { success: false, error: "رقم الهاتف ومفتاح CallMeBot مطلوبان." };
  }

  const url =
    `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(cleanPhone)}` +
    `&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apiKey.trim())}`;

  try {
    const res = await fetch(url, { method: "GET" });
    const body = await res.text();
    const cleanBody = body
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const lowered = body.toLowerCase();

    if (!res.ok) {
      return {
        success: false,
        error: `استجاب سيرفر CallMeBot برمز خطأ (${res.status}): ${cleanBody.slice(0, 150)}`,
      };
    }

    if (
      lowered.includes("service is down") ||
      lowered.includes("technical problem") ||
      lowered.includes("410")
    ) {
      return {
        success: false,
        isDown: true,
        error:
          "سيرفر CallMeBot متوقف مؤقتاً للصيانة من المصدر (Service is down 410). يمكنك استخدام الإرسال المباشر أو تفعيل بوت تليجرام البديل.",
      };
    }

    if (
      lowered.includes("apikey is not valid") ||
      lowered.includes("invalid apikey") ||
      lowered.includes("wrong apikey")
    ) {
      return {
        success: false,
        error: "مفتاح CallMeBot API غير صحيح. تأكد من نسخه بدقة من محادثة البوت على واتساب.",
      };
    }

    if (
      lowered.includes("not registered") ||
      lowered.includes("not activated") ||
      lowered.includes("user not found")
    ) {
      return {
        success: false,
        error:
          "الرقم غير مفعّل بعد مع CallMeBot. أرسل رسالة التنشيط أولاً إلى رقم البوت للحصول على المفتاح.",
      };
    }

    if (lowered.includes("error")) {
      return {
        success: false,
        error: cleanBody.slice(0, 200) || "فشل الإرسال عبر CallMeBot.",
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "خطأ في الاتصال بالشبكة.",
    };
  }
}
