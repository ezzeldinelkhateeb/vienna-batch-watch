import { daysUntil, type Thresholds } from "@/lib/status";

export interface ItemSummary {
  id: string;
  name: string;
  item_code?: string | null;
  batch_number?: string | null;
  quantity?: number | null;
  unit?: string | null;
  expiry_date: string;
  storage_location?: string | null;
  qc_status?: "quarantine" | "approved" | "rejected" | "conditional" | null;
  supplier?: string | null;
}

/**
 * Generates the Daily Morning Shift Briefing report for Vienna factory.
 */
export function generateMorningBriefing(
  items: ItemSummary[],
  thresholds: Thresholds,
): { text: string; reply_markup: any } {
  const todayArabic = new Date().toLocaleDateString("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let expiredCount = 0;
  let criticalCount = 0;
  let warningCount = 0;
  let quarantineCount = 0;

  // Group materials to find FEFO priorities and calculate stock levels
  const materialTotals = new Map<string, { totalQty: number; unit: string; earliestItem?: ItemSummary }>();

  for (const item of items) {
    const days = daysUntil(item.expiry_date);
    const qc = item.qc_status ?? "quarantine";

    if (qc === "quarantine") {
      quarantineCount++;
    }

    if (days < 0) {
      expiredCount++;
    } else if (days <= thresholds.critical) {
      criticalCount++;
    } else if (days <= thresholds.medium) {
      warningCount++;
    }

    // Material totals
    const key = item.name.trim().toLowerCase();
    const existing = materialTotals.get(key) || {
      totalQty: 0,
      unit: item.unit || "كجم",
      earliestItem: undefined,
    };

    const qty = Number(item.quantity) || 0;
    existing.totalQty += qty;

    if (qc === "approved" && days >= 0 && qty > 0) {
      if (
        !existing.earliestItem ||
        new Date(item.expiry_date).getTime() < new Date(existing.earliestItem.expiry_date).getTime()
      ) {
        existing.earliestItem = item;
      }
    }

    materialTotals.set(key, existing);
  }

  // Find top FEFO candidates (earliest valid batch per material)
  const fefoCandidates: ItemSummary[] = [];
  for (const [, data] of materialTotals.entries()) {
    if (data.earliestItem) {
      fefoCandidates.push(data.earliestItem);
    }
  }

  fefoCandidates.sort(
    (a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime(),
  );

  // Find low stock materials (total quantity across batches <= 30)
  let lowStockCount = 0;
  for (const [, data] of materialTotals.entries()) {
    if (data.totalQty <= 30) {
      lowStockCount++;
    }
  }

  // Format message lines
  const lines: string[] = [
    "🌅 *نشرة وردية الصباح وخطة خامات اليوم — مصنع فيينا* 🏭",
    `📅 *${todayArabic}*`,
    "━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
    "🥇 *أولويات الصرف اليوم (FEFO) لمنع الهدر:*",
  ];

  if (fefoCandidates.length === 0) {
    lines.push("• لا توجد خامات معتمدة جاهزة للصرف حالياً.");
  } else {
    for (const item of fefoCandidates.slice(0, 4)) {
      const days = daysUntil(item.expiry_date);
      const cd = days === 0 ? "ينتهي اليوم!" : `متبقٍ ${days} يوم`;
      lines.push(
        `• *${item.name}* (تشغيلة \`#${item.batch_number || item.item_code || "—"}\`)`,
        `   ⚖️ الرصيد: *${item.quantity ?? "—"} ${item.unit ?? "كجم"}* | ⏳ ${cd}`,
      );
    }
  }

  lines.push(
    "",
    "🚨 *الموقف الوقائي للصلاحيات:*",
    `• ⛔ تشغيلات منتهية: *${expiredCount}* تشغيلة`,
    `• 🚨 تشغيلات حرجة (≤ ${thresholds.critical} يوم): *${criticalCount}* تشغيلة`,
    `• 🟠 تشغيلات تحذيرية: *${warningCount}* تشغيلة`,
    "",
    "🔒 *شحنات الحجر الصحي والجودة (QC):*",
    `• يوجد *${quarantineCount}* تشغيلة قيد الفحص والاعتماد.`,
    "",
    "📉 *مؤشر النواقص وإعادة الطلب:*",
    `• يوجد *${lowStockCount}* أصناف أوشكت على النفاد في المخازن (≤ 30 كجم).`,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━",
    "💡 _نتمنى لكم وردية إنتاج موفقة وآمنة بمصنع فيينا!_",
  );

  const reply_markup = {
    inline_keyboard: [
      [
        { text: "🥇 كشف أولوية الصرف FEFO", callback_data: "/fefo" },
        { text: "🚨 الخامات الحرجة", callback_data: "/urgent" },
      ],
      [
        { text: "🔒 شحنات الحجر المعلقة", callback_data: "/qc" },
        { text: "📉 كشف النواقص وإعادة الطلب", callback_data: "/lowstock" },
      ],
      [
        { text: "📊 تقرير المخزون الشامل", callback_data: "/status" },
        { text: "⚡ تشغيل فحص فوري", callback_data: "/check" },
      ],
    ],
  };

  return { text: lines.join("\n"), reply_markup };
}

/**
 * Generates the Low Stock & Reorder Alert report for Vienna factory.
 */
export function generateLowStockReport(items: ItemSummary[]): { text: string; reply_markup: any } {
  // Aggregate items by clean material name
  const materialsMap = new Map<
    string,
    {
      name: string;
      totalQty: number;
      unit: string;
      batchesCount: number;
      activeBatches: ItemSummary[];
    }
  >();

  for (const item of items) {
    const key = item.name.trim().toLowerCase();
    const existing = materialsMap.get(key) || {
      name: item.name.trim(),
      totalQty: 0,
      unit: item.unit || "كجم",
      batchesCount: 0,
      activeBatches: [],
    };

    const qty = Number(item.quantity) || 0;
    existing.totalQty += qty;
    existing.batchesCount += 1;
    existing.activeBatches.push(item);
    materialsMap.set(key, existing);
  }

  // Sort materials by total quantity ascending
  const sortedMaterials = Array.from(materialsMap.values()).sort(
    (a, b) => a.totalQty - b.totalQty,
  );

  // Filter low stock (<= 50) or show lowest 8 items
  const lowStockMaterials = sortedMaterials.filter((m) => m.totalQty <= 50);
  const displayList = lowStockMaterials.length > 0 ? lowStockMaterials.slice(0, 10) : sortedMaterials.slice(0, 8);

  const lines: string[] = [
    "📉 *تقرير النواقص ومؤشر إعادة الطلب — مخازن فيينا* ⚠️",
    "_(الأصناف المرتبة حسب الأقل رصيداً في المستودع)_",
    "━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
  ];

  const quickButtons: Array<Array<{ text: string; callback_data: string }>> = [];

  if (displayList.length === 0) {
    lines.push("🟢 ممتاز! جميع الأصناف المخزنية أرصدتها آمنة وكافية للتشغيل والإنتاج.");
  } else {
    let rank = 1;
    for (const mat of displayList) {
      const roundedQty = Math.round(mat.totalQty * 100) / 100;
      let badge = "⚠️ [منخفض]";
      if (roundedQty <= 0) {
        badge = "⛔ [نفد تماماً]";
      } else if (roundedQty <= 20) {
        badge = "🚨 [حرج جداً]";
      }

      // Pick earliest active batch if available
      mat.activeBatches.sort(
        (a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime(),
      );
      const nextBatch = mat.activeBatches[0];

      lines.push(
        `${rank}. 📦 *${mat.name}* ${badge}`,
        `   • إجمالي الرصيد: *${roundedQty} ${mat.unit}* (${mat.batchesCount} تشغيلة)`,
        nextBatch
          ? `   • التشغيلة الحالية: \`#${nextBatch.batch_number || nextBatch.item_code || "—"}\` (موقع: ${nextBatch.storage_location || "المخزن العام"})`
          : "   • لا توجد دفعات حالية",
        "",
      );

      if (rank <= 4 && nextBatch) {
        quickButtons.push([
          {
            text: `📦 كشف تشغيلات (${mat.name.slice(0, 14)})`,
            callback_data: `mat:${mat.name}`,
          },
        ]);
      }

      rank++;
    }
  }

  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("💡 يُرجى التنسيق مع إدارة المشتريات لإعادة طلب الأصناف ذات الرصيد الحرج.");

  quickButtons.push([
    { text: "🥇 أولوية الصرف FEFO", callback_data: "/fefo" },
    { text: "📊 تقرير المخزون العام", callback_data: "/status" },
  ]);

  return {
    text: lines.join("\n"),
    reply_markup: { inline_keyboard: quickButtons.slice(0, 7) },
  };
}
