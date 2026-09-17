import { useMemo, useState } from "react";
import { Printer, MessageCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useRegisterBackModal } from "@/lib/modal-stack";
import { type ItemRow } from "@/components/ItemFormDialog";
import { type Status, daysUntil, statusFor, type Thresholds } from "@/lib/status";
import { countdownText } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WhatsAppShareDialog } from "@/components/WhatsAppShareDialog";
import { useSettings } from "@/hooks/use-settings";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ItemRow[];
  thresholds?: Thresholds | undefined;
}

export function QcPrintReportDialog({ open, onOpenChange, items, thresholds }: Props) {
  useRegisterBackModal(open, () => onOpenChange(false), "qc-print-report");
  const { t, lang } = useI18n();
  const settings = useSettings();
  const [shareWhatsApp, setShareWhatsApp] = useState(false);
  useRegisterBackModal(shareWhatsApp, () => setShareWhatsApp(false), "qc-print-whatsapp");

  const todayStr = new Date().toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const quarantineCount = items.filter(
    (i) => (i.qc_status ?? "quarantine") === "quarantine",
  ).length;
  const approvedCount = items.filter((i) => i.qc_status === "approved").length;
  const rejectedCount = items.filter((i) => i.qc_status === "rejected").length;
  const criticalCount = items.filter((i) => {
    const st = statusFor(daysUntil(i.expiry_date), thresholds);
    return st === "critical" || st === "expired";
  }).length;

  // Sorted items alphabetically by raw material name, then expiry
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const nameComp = a.name.localeCompare(b.name, "ar", { sensitivity: "base", numeric: true });
      if (nameComp !== 0) return nameComp;
      return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
    });
  }, [items]);

  // Calculate FEFO #1 dispatch priority for approved batches
  const fefoPriorityMap = useMemo(() => {
    const map = new Map<string, boolean>();
    const groups = new Map<string, ItemRow[]>();

    for (const item of items) {
      if (item.qc_status === "approved" && daysUntil(item.expiry_date) >= 0) {
        const key = item.name.trim().toLowerCase();
        const list = groups.get(key) ?? [];
        list.push(item);
        groups.set(key, list);
      }
    }

    for (const [, list] of groups) {
      list.sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());
      if (list[0]) {
        map.set(list[0].id, true);
      }
    }
    return map;
  }, [items]);

  const qcReportMessage = useMemo(() => {
    return [
      "🍫 *تقرير فحص واعتماد الجودة — مصنع فينا* 🍫",
      "*إدارة توكيد ومراقبة الجودة (QA/QC Department)*",
      `📅 *تاريخ التقرير:* ${todayStr}`,
      "━━━━━━━━━━━━━━━━━━━━",
      `📦 *إجمالي التشغيلات المفحوصة:* ${items.length}`,
      `• ✅ معتمد ومقبول: ${approvedCount}`,
      `• 🔒 تحت الحجر (بانتظار الفحص): ${quarantineCount}`,
      `• ❌ مرفوض: ${rejectedCount}`,
      `• 🚨 شحنات حرجة الصلاحية: ${criticalCount}`,
      "━━━━━━━━━━━━━━━━━━━━",
      "⚠️ *توجيه فني:* الالتزام الصارم بقاعدة الصرف بالأقدمية (FEFO).",
      "_نظام Vienna Batch Watch الذكي_",
    ].join("\n");
  }, [items.length, approvedCount, quarantineCount, rejectedCount, criticalCount, todayStr]);

  // Dedicated clean print window (bypasses background cards, mobile clutters, and text overlapping)
  const handlePrint = () => {
    const factoryName =
      settings.data?.factory_name ||
      (lang === "ar" ? "مصنع فينا للبسكوت والشيكولاتة" : "Vienna Biscuit & Chocolate Factory");
    const tagline =
      settings.data?.system_tagline ||
      (lang === "ar"
        ? "إدارة توكيد ومراقبة الجودة — فحص واعتماد خامات التشغيل وقاعدة الصرف بالصلاحية (FEFO)"
        : "QA & QC Department — Raw Material Release & Confectionery FEFO Protocol");
    const reportTitle = t("qcReportTitle");

    const rowsHtml = sortedItems
      .map((it, idx) => {
        const days = daysUntil(it.expiry_date);
        const isFefoFirst = fefoPriorityMap.get(it.id);
        const st = it.qc_status ?? "quarantine";

        let statusText = lang === "ar" ? "تحت الحجر" : "Quarantine";
        let statusBg = "#fef3c7";
        let statusColor = "#b45309";
        let statusBorder = "#fde68a";

        if (st === "approved") {
          statusText = lang === "ar" ? "مقبول" : "Approved";
          statusBg = "#dcfce7";
          statusColor = "#15803d";
          statusBorder = "#bbf7d0";
        } else if (st === "rejected") {
          statusText = lang === "ar" ? "مرفوض" : "Rejected";
          statusBg = "#fee2e2";
          statusColor = "#b91c1c";
          statusBorder = "#fecaca";
        }

        const fefoBadge = isFefoFirst
          ? `<span style="background:#fef3c7;color:#b45309;border:1px solid #fcd34d;padding:2px 5px;border-radius:4px;font-size:7pt;font-weight:bold;white-space:nowrap;">⭐ FEFO #1</span>`
          : `<span style="color:#94a3b8;">—</span>`;

        const countdown = countdownText(days, t);
        const qty = it.quantity != null ? `${it.quantity} ${it.unit || ""}`.trim() : "—";
        const rowBg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";

        return `<tr style="background:${rowBg};">
          <td style="text-align:center;font-family:monospace;font-weight:600;width:24px;">${idx + 1}</td>
          <td style="font-family:monospace;font-weight:600;color:#0f172a;width:68px;">${it.item_code || "—"}</td>
          <td style="font-family:monospace;font-weight:700;color:#334155;width:78px;">${it.batch_number ? `#${it.batch_number}` : "—"}</td>
          <td style="font-weight:700;color:#0f172a;width:130px;">${it.name}</td>
          <td style="color:#475569;width:105px;">${it.supplier || "—"}</td>
          <td style="text-align:center;width:65px;">
            <span style="background:${statusBg};color:${statusColor};border:1px solid ${statusBorder};padding:2px 6px;border-radius:999px;font-size:7.5pt;font-weight:bold;white-space:nowrap;display:inline-block;">
              ${statusText}
            </span>
          </td>
          <td style="text-align:center;width:65px;">${fefoBadge}</td>
          <td style="font-family:monospace;color:#64748b;text-align:center;width:70px;">${it.coa_number || "—"}</td>
          <td style="color:#475569;width:85px;">${it.storage_location || "—"}</td>
          <td style="white-space:nowrap;width:90px;">
            <span style="font-family:monospace;font-weight:700;color:#dc2626;display:block;">${it.expiry_date}</span>
            <span style="font-size:7pt;color:#64748b;display:block;">${countdown}</span>
          </td>
          <td style="font-family:monospace;font-weight:700;color:#0f172a;white-space:nowrap;width:55px;">${qty}</td>
          <td style="color:#475569;font-size:7.5pt;width:125px;">${it.qc_notes || it.notes || "—"}</td>
        </tr>`;
      })
      .join("");

    const html = `<!DOCTYPE html>
<html lang="${lang === "ar" ? "ar" : "en"}" dir="${lang === "ar" ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${reportTitle} — ${todayStr}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body {
    background:#ffffff !important;
    color:#0f172a !important;
    font-family:'Segoe UI',Arial,'Noto Sans Arabic',sans-serif;
    font-size:8pt;
    direction:${lang === "ar" ? "rtl" : "ltr"};
    line-height:1.25;
  }
  @page {
    size: A4 landscape;
    margin: 8mm 10mm;
  }
  .no-print {
    background:#0f172a;
    color:#ffffff;
    padding:10px 16px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
    font-size:9.5pt;
    box-shadow:0 2px 8px rgba(0,0,0,0.15);
  }
  .no-print button {
    cursor:pointer;
    font-weight:bold;
    font-size:9pt;
    padding:6px 14px;
    border-radius:6px;
    border:none;
    display:inline-flex;
    align-items:center;
    gap:6px;
  }
  .btn-print { background:#10b981; color:#ffffff; }
  .btn-print:hover { background:#059669; }
  .btn-close { background:#334155; color:#ffffff; }
  .btn-close:hover { background:#475569; }
  .sheet-container {
    padding: 10px 14px;
  }
  .report-header {
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    padding-bottom:8px;
    border-bottom:2.5px solid #0f172a;
    margin-bottom:10px;
  }
  .factory-title { font-size:15pt; font-weight:900; color:#0f172a; }
  .factory-sub { font-size:8.5pt; font-weight:600; color:#475569; margin-top:2px; }
  .doc-title { font-size:11pt; font-weight:800; color:#0f172a; margin-top:4px; }
  .report-meta { text-align:${lang === "ar" ? "left" : "right"}; font-size:8.5pt; }
  .report-meta strong { color:#0f172a; }

  /* 4 KPI Cards Matching Image 1 */
  .kpi-row {
    display:grid;
    grid-template-columns: repeat(4, 1fr);
    gap:10px;
    margin-bottom:10px;
  }
  .kpi-card {
    border-radius:8px;
    padding:6px 10px;
    text-align:center;
    border:1.5px solid;
  }
  .kpi-quarantine { background:#fef9c3 !important; border-color:#facc15 !important; color:#854d0e !important; }
  .kpi-approved { background:#dcfce7 !important; border-color:#4ade80 !important; color:#166534 !important; }
  .kpi-rejected { background:#ffe4e6 !important; border-color:#fb7185 !important; color:#9f1239 !important; }
  .kpi-critical { background:#fee2e2 !important; border-color:#f87171 !important; color:#991b1b !important; }
  .kpi-label { font-size:8pt; font-weight:700; margin-bottom:2px; }
  .kpi-val { font-size:15pt; font-weight:900; font-family:monospace; }

  /* Main Table */
  table {
    width:100%;
    border-collapse:collapse;
    font-size:7.5pt;
    table-layout:fixed;
  }
  thead { display: table-header-group !important; }
  thead tr { background:#1e293b !important; color:#ffffff !important; }
  th {
    background:#1e293b !important;
    color:#ffffff !important;
    font-weight:700;
    padding:5px 4px;
    border:1px solid #334155;
    font-size:7.5pt;
    text-align:${lang === "ar" ? "right" : "left"};
    white-space:nowrap;
  }
  td {
    padding:4px 4px;
    border:1px solid #cbd5e1;
    font-size:7.5pt;
    vertical-align:middle;
    color:#0f172a !important;
  }
  tr { page-break-inside:avoid !important; break-inside:avoid !important; }

  /* Signatures */
  .signatures-section {
    display:flex;
    justify-content:space-between;
    gap:20px;
    margin-top:16px;
    padding-top:10px;
    border-top:1.5px solid #cbd5e1;
    page-break-inside:avoid !important;
    break-inside:avoid !important;
  }
  .sig-card {
    flex:1;
    border:1px dashed #94a3b8;
    border-radius:8px;
    padding:8px;
    text-align:center;
  }
  .sig-card p { font-weight:700; font-size:8.5pt; color:#0f172a; }
  .sig-line {
    margin:24px 8px 4px 8px;
    border-bottom:1px dotted #94a3b8;
  }
  .sig-sub { font-size:7.5pt; color:#64748b; }
  .footer-note {
    text-align:center;
    font-size:7.5pt;
    color:#64748b;
    margin-top:12px;
    line-height:1.4;
  }

  @media print {
    .no-print { display:none !important; }
    .sheet-container { padding:0 !important; }
    body { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
  }
</style>
</head>
<body>
<div class="no-print">
  <div>
    <strong>${reportTitle}</strong>
    <span style="opacity:0.8; margin-${lang === "ar" ? "right" : "left"}:8px;">— اضغط للطباعة أو الحفظ كملف PDF</span>
  </div>
  <div style="display:flex; gap:8px;">
    <button class="btn-print" onclick="window.focus(); window.print();">🖨️ طباعة / حفظ PDF</button>
    <button class="btn-close" onclick="window.close();">✕ إغلاق</button>
  </div>
</div>

<div class="sheet-container">
  <div class="report-header">
    <div>
      <div class="factory-title">🏭 ${factoryName}</div>
      <div class="factory-sub">${tagline}</div>
      <div class="doc-title">${reportTitle}</div>
    </div>
    <div class="report-meta">
      <p><strong>${t("reportDate")}:</strong> ${todayStr}</p>
      <p><strong>${t("totalItems")}:</strong> ${items.length} ${t("item")}</p>
    </div>
  </div>

  <div class="kpi-row">
    <div class="kpi-card kpi-quarantine">
      <div class="kpi-label">${t("quarantine")}</div>
      <div class="kpi-val">${quarantineCount}</div>
    </div>
    <div class="kpi-card kpi-approved">
      <div class="kpi-label">${t("approved")}</div>
      <div class="kpi-val">${approvedCount}</div>
    </div>
    <div class="kpi-card kpi-rejected">
      <div class="kpi-label">${t("rejected")}</div>
      <div class="kpi-val">${rejectedCount}</div>
    </div>
    <div class="kpi-card kpi-critical">
      <div class="kpi-label">${t("statusCritical")}</div>
      <div class="kpi-val">${criticalCount}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:24px; text-align:center;">#</th>
        <th style="width:68px;">${t("itemCode")}</th>
        <th style="width:78px;">${t("batchNumber")}</th>
        <th style="width:130px;">${t("name")}</th>
        <th style="width:105px;">${t("supplier")}</th>
        <th style="width:65px; text-align:center;">${t("qcStatus")}</th>
        <th style="width:65px; text-align:center;">FEFO</th>
        <th style="width:70px; text-align:center;">${t("coaNumber")}</th>
        <th style="width:85px;">${t("storageLocation")}</th>
        <th style="width:90px;">${t("expiryDate")}</th>
        <th style="width:55px;">${t("quantity")}</th>
        <th style="width:125px;">${t("qcNotes")}</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="signatures-section">
    <div class="sig-card">
      <p>${t("preparedBy")}</p>
      <div class="sig-line"></div>
      <div class="sig-sub">${t("signature")}</div>
    </div>
    <div class="sig-card">
      <p>${t("inspectedBy")}</p>
      <div class="sig-line"></div>
      <div class="sig-sub">${t("signature")}</div>
    </div>
    <div class="sig-card">
      <p>${t("approvedBy")}</p>
      <div class="sig-line"></div>
      <div class="sig-sub">${t("signature")}</div>
    </div>
  </div>

  <div class="footer-note">
    <p><strong>${factoryName} — نظام إدارة الجودة وسلامة الغذاء المعتمد</strong></p>
    <p>Adhering to Good Manufacturing Practice (GMP) & FEFO Dispatch Policy</p>
  </div>
</div>

<script>
  window.addEventListener('load', function() {
    setTimeout(function() {
      try {
        window.focus();
        window.print();
      } catch (e) {}
    }, 250);
  });
</script>
</body>
</html>`;

    // 1. Try dedicated print window
    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      return;
    }

    // 2. Fallback for mobile popup blocker: hidden printable iframe
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          try {
            document.body.removeChild(iframe);
          } catch {}
        }, 3000);
      }, 350);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92dvh] sm:max-h-[92vh] max-w-5xl overflow-y-auto p-4 sm:p-8 print:max-h-none print:max-w-none print:w-full print:p-0 print:border-none print:shadow-none print:overflow-visible">
          <DialogHeader className="flex flex-row items-center justify-between border-b pb-4 print:hidden">
            <DialogTitle className="text-lg font-semibold text-cocoa">
              {t("qcReportTitle")}
            </DialogTitle>
            <div className="flex gap-2">
              <Button
                onClick={() => setShareWhatsApp(true)}
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs text-[#25D366] border-[#25D366]/40 hover:bg-[#25D366]/10 font-bold"
              >
                <MessageCircle className="size-4" />
                <span>مشاركة عبر واتساب</span>
              </Button>
              <Button
                onClick={handlePrint}
                size="sm"
                className="gap-1.5 bg-brand hover:bg-brand/90 text-white font-bold text-xs"
              >
                <Printer className="size-4" />
                <span>{lang === "ar" ? "طباعة / حفظ PDF" : "Print / Save PDF"}</span>
              </Button>
            </div>
          </DialogHeader>

        {/* Printable Paper Content */}
        <div className="print-content space-y-6 pt-2 text-foreground">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b-2 border-cocoa pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🏭</span>
                <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-cocoa">
                  {lang === "ar" ? "مصنع فينا للبسكوت والشيكولاتة" : "Vienna Biscuit & Chocolate Factory"}
                </h1>
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-0.5">
                {lang === "ar"
                  ? "إدارة توكيد ومراقبة الجودة — فحص واعتماد خامات التشغيل وقاعدة الصرف بالصلاحية (FEFO)"
                  : "QA & QC Department — Raw Material Release & Confectionery FEFO Protocol"}
              </p>
              <h2 className="mt-2 text-sm sm:text-base font-bold text-cocoa">{t("qcReportTitle")}</h2>
            </div>
            <div className="mt-3 sm:mt-0 text-xs text-muted-foreground text-start sm:text-end">
              <p>
                <span className="font-semibold text-foreground">{t("reportDate")}:</span> {todayStr}
              </p>
              <p>
                <span className="font-semibold text-foreground">{t("totalItems")}:</span>{" "}
                {items.length} {t("item")}
              </p>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-center dark:bg-amber-950/20">
              <p className="text-xs text-amber-900 dark:text-amber-300">{t("quarantine")}</p>
              <p className="text-xl font-bold text-amber-950 dark:text-amber-200">
                {quarantineCount}
              </p>
            </div>
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-center dark:bg-emerald-950/20">
              <p className="text-xs text-emerald-900 dark:text-emerald-300">{t("approved")}</p>
              <p className="text-xl font-bold text-emerald-950 dark:text-emerald-200">
                {approvedCount}
              </p>
            </div>
            <div className="rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-center dark:bg-rose-950/20">
              <p className="text-xs text-rose-900 dark:text-rose-300">{t("rejected")}</p>
              <p className="text-xl font-bold text-rose-950 dark:text-rose-200">{rejectedCount}</p>
            </div>
            <div className="rounded-lg border border-red-300 bg-red-50 p-2.5 text-center dark:bg-red-950/20">
              <p className="text-xs text-red-900 dark:text-red-300">{t("statusCritical")}</p>
              <p className="text-xl font-bold text-red-950 dark:text-red-200">{criticalCount}</p>
            </div>
          </div>

          {/* Main Inspection Table */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-start text-xs">
              <thead className="bg-muted/80 font-semibold text-cocoa">
                <tr>
                  <th className="p-2 text-start">#</th>
                  <th className="p-2 text-start">{t("itemCode")}</th>
                  <th className="p-2 text-start">{t("batchNumber")}</th>
                  <th className="p-2 text-start">{t("name")}</th>
                  <th className="p-2 text-start">{t("supplier")}</th>
                  <th className="p-2 text-start">{t("qcStatus")}</th>
                  <th className="p-2 text-start">FEFO</th>
                  <th className="p-2 text-start">{t("coaNumber")}</th>
                  <th className="p-2 text-start">{t("storageLocation")}</th>
                  <th className="p-2 text-start">{t("expiryDate")}</th>
                  <th className="p-2 text-start">{t("quantity")}</th>
                  <th className="p-2 text-start">{t("qcNotes")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedItems.map((it, idx) => {
                  const days = daysUntil(it.expiry_date);
                  const isFefoFirst = fefoPriorityMap.get(it.id);
                  return (
                    <tr key={it.id} className="odd:bg-background even:bg-muted/20">
                      <td className="p-2 font-mono">{idx + 1}</td>
                      <td className="p-2 font-mono font-medium">{it.item_code || "—"}</td>
                      <td className="p-2 font-mono text-muted-foreground">
                        {it.batch_number || "—"}
                      </td>
                      <td className="p-2 font-medium">{it.name}</td>
                      <td className="p-2">{it.supplier || "—"}</td>
                      <td className="p-2 font-semibold">
                        {t((it.qc_status ?? "quarantine") as never)}
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {isFefoFirst ? (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 border border-amber-300">
                            ⭐ FEFO #1
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2 font-mono text-xs">{it.coa_number || "—"}</td>
                      <td className="p-2">{it.storage_location || "—"}</td>
                      <td className="p-2 font-mono whitespace-nowrap">
                        {it.expiry_date}
                        <span className="block text-[10px] text-muted-foreground">
                          {countdownText(days, t)}
                        </span>
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {it.quantity != null ? `${it.quantity}` : "—"}
                      </td>
                      <td className="p-2 max-w-[12rem] text-muted-foreground">
                        {it.qc_notes || it.notes || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Signatures & Official Approvals Section */}
          <div className="mt-8 border-t pt-6 print-signatures-section">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center text-xs">
              <div className="rounded-lg border border-dashed p-4">
                <p className="font-semibold text-cocoa">{t("preparedBy")}</p>
                <div className="my-6 border-b border-muted-foreground/30" />
                <p className="text-muted-foreground">{t("signature")}</p>
              </div>

              <div className="rounded-lg border border-dashed p-4">
                <p className="font-semibold text-cocoa">{t("inspectedBy")}</p>
                <div className="my-6 border-b border-muted-foreground/30" />
                <p className="text-muted-foreground">{t("signature")}</p>
              </div>

              <div className="rounded-lg border border-dashed p-4">
                <p className="font-semibold text-cocoa">{t("approvedBy")}</p>
                <div className="my-6 border-b border-muted-foreground/30" />
                <p className="text-muted-foreground">{t("signature")}</p>
              </div>
            </div>

            <div className="mt-6 text-center text-[11px] text-muted-foreground">
              <p className="font-semibold text-cocoa">
                {lang === "ar"
                  ? "مصنع فينا للبسكوت والشيكولاتة — نظام إدارة الجودة وسلامة الغذاء المعتمد"
                  : "Vienna Biscuit & Chocolate Factory — Certified Food Safety & Quality Management System"}
              </p>
              <p className="font-serif italic text-cocoa/70">
                Adhering to Good Manufacturing Practice (GMP) & FEFO Dispatch Policy
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <WhatsAppShareDialog
      open={shareWhatsApp}
      onOpenChange={setShareWhatsApp}
      customText={qcReportMessage}
      thresholds={thresholds}
      defaultPhone={settings.data?.whatsapp_phone}
    />
  </>
);
}
