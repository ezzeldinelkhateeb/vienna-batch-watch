/**
 * Client-safe WhatsApp helper utilities.
 */

/**
 * Builds a direct WhatsApp click-to-chat URL that works instantly in WhatsApp Web or Mobile.
 * Does not require any external bot or gateway and never goes down.
 */
export function buildDirectWhatsAppUrl(phone: string | null | undefined, text: string): string {
  const cleanDigits = (phone ?? "").trim().replace(/[^\d]/g, "");
  const encoded = encodeURIComponent(text);
  if (cleanDigits) {
    return `https://api.whatsapp.com/send?phone=${cleanDigits}&text=${encoded}`;
  }
  return `https://api.whatsapp.com/send?text=${encoded}`;
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
  const countdown =
    days < 0
      ? `⛔ منتهي الصلاحية منذ ${Math.abs(days)} يوم`
      : days === 0
        ? "⚠️ ينتهي اليوم!"
        : `⏳ متبقٍ: ${days} يوم`;

  const qc = item.qc_status ? (qcLabels[item.qc_status] ?? item.qc_status) : "🔒 تحت الحجر";
  const code = item.item_code ? item.item_code : "غير مسجل";
  const location = item.storage_location
    ? `📍 *موقع التخزين:* ${item.storage_location}`
    : "📍 *موقع التخزين:* غير محدد";

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
