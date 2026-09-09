import { countdownText } from "./format";
import { statusFor, daysUntil, type Thresholds } from "./status";
import type { ItemRow } from "@/components/ItemFormDialog";

/**
 * Renders a crisp, executive PNG summary card for an item on an HTML canvas.
 * Works entirely in browser without any external backend dependencies.
 */
export async function generateItemReportCardBlob(
  item?: ItemRow | null,
  thresholds?: Thresholds,
  customTitle?: string,
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 560;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const days = item ? daysUntil(item.expiry_date) : 365;
  const status = item ? statusFor(days, thresholds) : "normal";

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 900, 560);
  bgGrad.addColorStop(0, "#24140e");
  bgGrad.addColorStop(0.5, "#170c08");
  bgGrad.addColorStop(1, "#0e0705");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 900, 560);

  // Decorative border
  ctx.strokeStyle = "#b45309";
  ctx.lineWidth = 4;
  ctx.strokeRect(16, 16, 868, 528);

  // Header Banner
  ctx.fillStyle = "rgba(217, 119, 6, 0.15)";
  ctx.fillRect(20, 20, 860, 90);

  // Brand Name
  ctx.fillStyle = "#fbbf24";
  ctx.font = "bold 32px 'Segoe UI', Tahoma, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("VIENNA CHOCOLATE & BISCUIT", 850, 60);

  ctx.fillStyle = "#d4d4d8";
  ctx.font = "16px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText("إدارة توكيد ومراقبة الجودة (QA / QC) — بطاقة فحص الخامات", 850, 92);

  // Status badge colors
  const statusColors: Record<string, { bg: string; text: string; label: string }> = {
    normal: { bg: "#14532d", text: "#86efac", label: "حالة ممتازة (صالح للتشغيل)" },
    early: { bg: "#78350f", text: "#fde047", label: "تنبيه مبكر (أولوية صرف)" },
    medium: { bg: "#7c2d12", text: "#fdba74", label: "تحذير متوسط (استهلاك عاجل)" },
    critical: { bg: "#7f1d1d", text: "#fca5a5", label: "إنذار حرج (قرب الانتهاء!)" },
    expired: { bg: "#450a0a", text: "#f87171", label: "منتهي الصلاحية (عزل وحظر صرف)" },
  };

  const st = statusColors[status] || statusColors.normal;

  // Status Badge box
  ctx.fillStyle = st.bg;
  ctx.roundRect ? ctx.roundRect(40, 36, 260, 54, 8) : ctx.fillRect(40, 36, 260, 54);
  ctx.fill();
  ctx.strokeStyle = st.text;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = st.text;
  ctx.font = "bold 18px 'Segoe UI', Tahoma, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(st.label, 170, 70);

  // Material / System Name (Prominent)
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px 'Segoe UI', Tahoma, sans-serif";
  const mainTitle = item ? item.name : (customTitle || "نظام مراقبة الصلاحية وجودة التشغيلات");
  ctx.fillText(mainTitle, 850, 165);

  // Divider
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, 190);
  ctx.lineTo(860, 190);
  ctx.stroke();

  // Information Grid
  ctx.font = "20px 'Segoe UI', Tahoma, sans-serif";
  const drawRow = (label: string, value: string, y: number, isUrgent = false) => {
    ctx.fillStyle = "#a1a1aa";
    ctx.textAlign = "right";
    ctx.fillText(label, 850, y);

    ctx.fillStyle = isUrgent ? "#f87171" : "#f4f4f5";
    ctx.font = isUrgent ? "bold 22px 'Segoe UI', Tahoma, sans-serif" : "20px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText(value, 600, y);
  };

  const drawRowLeft = (label: string, value: string, y: number) => {
    ctx.fillStyle = "#a1a1aa";
    ctx.textAlign = "right";
    ctx.fillText(label, 400, y);

    ctx.fillStyle = "#f4f4f5";
    ctx.font = "20px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText(value, 200, y);
  };

  if (item) {
    drawRow("كود الصنف:", item.item_code || "غير مسجل", 235);
    drawRowLeft("رقم التشغيلة (Batch):", item.batch_number || "—", 235);

    drawRow("الكمية في المخزن:", `${item.quantity ?? "—"} ${item.unit ?? ""}`.trim(), 285);
    drawRowLeft("المورد:", item.supplier || "—", 285);

    drawRow("تاريخ الانتهاء:", item.expiry_date, 335);
    const countdownStr = days < 0 ? `منتهي منذ ${Math.abs(days)} يوم` : days === 0 ? "ينتهي اليوم!" : `متبقٍ: ${days} يوم`;
    drawRowLeft("الوضع الزمني:", countdownStr, 335);

    drawRow("موقع التخزين:", item.storage_location || "غير محدد", 385);
    const qcLabel = item.qc_status === "approved" ? "✅ معتمد (Approved)" : item.qc_status === "rejected" ? "❌ مرفوض (Rejected)" : "🔒 تحت الحجر (Quarantine)";
    drawRowLeft("حالة الجودة (QC):", qcLabel, 385);
  } else {
    drawRow("نظام التنبيهات:", "مراقبة الصلاحية التلقائية", 235);
    drawRowLeft("قنوات الإرسال:", "واتساب وتليجرام", 235);

    drawRow("حالة الربط:", "متصل وجاهز للعمل ✅", 285);
    drawRowLeft("المصنع:", "Vienna Confectionery", 285);

    drawRow("تاريخ اليوم:", new Date().toISOString().slice(0, 10), 335);
    drawRowLeft("الحالة العامة:", "فحص نشط 24/7", 335);

    drawRow("بروتوكول الصرف:", "FEFO (الأقرب انتهاءً أولاً)", 385);
    drawRowLeft("توكيد الجودة:", "معتمد من إدارة QA/QC", 385);
  }

  // Footer box
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillRect(20, 440, 860, 96);

  ctx.fillStyle = "#fbbf24";
  ctx.font = "bold 16px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText("⚠️ تنبيه فني وفق معايير سلامة الغذاء (FEFO Protocol):", 850, 475);

  ctx.fillStyle = "#d4d4d8";
  ctx.font = "15px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText("يجب الالتزام بصرف التشغيلات الأقرب انتهاءً أولاً. لا يُصرف أي صنف بدون بطاقة فحص الجودة المعتمدة.", 850, 505);

  ctx.fillStyle = "#71717a";
  ctx.font = "13px 'Segoe UI', Tahoma, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(new Date().toLocaleString("ar-EG"), 40, 505);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}
