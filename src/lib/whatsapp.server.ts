export interface WhatsAppResult {
  success: boolean;
  error?: string;
}

/**
 * Sends a WhatsApp message through the free CallMeBot API.
 * The number must already be activated with the CallMeBot bot by the user.
 */
export async function sendWhatsApp(
  phone: string,
  apiKey: string,
  text: string,
): Promise<WhatsAppResult> {
  const cleanPhone = phone.trim().replace(/[^\d+]/g, "");
  const url =
    `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(cleanPhone)}` +
    `&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apiKey.trim())}`;

  try {
    const res = await fetch(url, { method: "GET" });
    const body = await res.text();
    if (!res.ok) {
      return { success: false, error: `CallMeBot responded ${res.status}: ${body.slice(0, 200)}` };
    }
    const lowered = body.toLowerCase();
    if (lowered.includes("error") || lowered.includes("apikey is not valid")) {
      return { success: false, error: body.replace(/<[^>]*>/g, " ").trim().slice(0, 300) };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Network error" };
  }
}

export function buildAlertMessage(
  item: {
    item_code?: string | null;
    batch_number?: string | null;
    name: string;
    supplier: string | null;
    quantity: number | null;
    unit: string | null;
    expiry_date: string;
    storage_location?: string | null;
    qc_status?: string | null;
  },
  status: string,
  days: number,
): string {
  const qcLabels: Record<string, string> = {
    quarantine: "🔒 تحت الحجر (Quarantine)",
    approved: "✅ مقبول ومعتمد (Approved)",
    rejected: "❌ مرفوض (Rejected)",
    conditional: "⚠️ قبول مشروط (Conditional)",
  };

  const statusHeaders: Record<string, { badge: string; urgency: string }> = {
    early: {
      badge: "🟡 *تنبيه مبكر للصلاحية (Early Warning)*",
      urgency: "متبقٍ فترة كافية للاستهلاك والتصنيع",
    },
    medium: {
      badge: "🟠 *تحذير متوسط الأهمية (Medium Alert)*",
      urgency: "يُرجى إعطاء أولوية للصرف في خطط التشغيل",
    },
    critical: {
      badge: "🚨 *إنذار حرج وفوري (CRITICAL ALERT)*",
      urgency: "إجراء عاجل: أوشكت الصلاحية على النفاد!",
    },
    expired: {
      badge: "⛔ *مادة منتهية الصلاحية (EXPIRED)*",
      urgency: "يُحظر الصرف تماماً ويجب العزل الفوري في الحجر!",
    },
  };

  const currentStatus = statusHeaders[status] ?? {
    badge: `⚠️ *تنبيه صلاحية (${status})*`,
    urgency: "يرجى المراجعة الفورية من فريق الجودة",
  };

  const qtyStr = item.quantity != null ? `${item.quantity} ${item.unit ?? ""}`.trim() : "غير محدد";
  const countdown = days < 0
    ? `⛔ منتهي الصلاحية منذ ${Math.abs(days)} يوم`
    : (days === 0 ? "⚠️ ينتهي اليوم!" : `⏳ متبقٍ: ${days} يوم`);

  const qc = item.qc_status ? (qcLabels[item.qc_status] ?? item.qc_status) : "🔒 تحت الحجر";
  const code = item.item_code ? item.item_code : "غير مسجل";
  const location = item.storage_location ? `📍 *موقع التخزين:* ${item.storage_location}` : "📍 *موقع التخزين:* غير محدد";

  const lines = [
    `🍫 *VIENNA HIGH QUALITY CHOCOLATE* 🍫`,
    `*إدارة توكيد ومراقبة الجودة (QA/QC Department)*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    currentStatus.badge,
    `*التوجيه:* ${currentStatus.urgency}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📦 *اسم المادة الخام:* ${item.name}`,
    `🏷️ *كود الصنف:* ${code}`,
    item.batch_number ? `🔢 *رقم التشغيلة (Batch #):* ${item.batch_number}` : null,
    `🏢 *المورد:* ${item.supplier ?? "—"}`,
    `⚖️ *الكمية الحالية:* ${qtyStr}`,
    location,
    `🛡️ *حالة الجودة:* ${qc}`,
    `📅 *تاريخ الانتهاء:* ${item.expiry_date}`,
    `⏰ *الوضع الزمني:* ${countdown}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📋 *تعليمات سلامة الغذاء والجودة:*`,
    `• الالتزام الصارم بقاعدة الصرف (FEFO: الأقرب انتهاءً أولاً).`,
    `• لا يتم صرف أي شحنة للإنتاج بدون بطاقة اعتماد الجودة.`,
    `• مراجعة درجات حرارة ورطوبة غرف التخزين باستمرار.`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `_نظام Vienna Batch Watch الذكي_`,
  ];

  return lines.filter(Boolean).join("\n");
}
