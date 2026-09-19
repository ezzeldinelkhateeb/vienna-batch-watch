import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  Search,
  CheckCheck,
  RotateCcw,
  Printer,
  ChevronLeft,
  ChevronRight,
  Filter,
  Boxes,
  MapPin,
  Calendar,
  AlertTriangle,
  ArrowUpDown,
  LayoutGrid,
  Table,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-logger";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { StatusPill, QcBadge } from "@/components/StatusPill";
import { daysUntil, statusFor, type Status } from "@/lib/status";
import { useSettings } from "@/hooks/use-settings";
import { countdownText } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/monthly-audit")({
  head: () => ({
    meta: [
      { title: "Monthly Inventory Audit — Vienna Factory" },
      {
        name: "description",
        content: "Monthly raw material inventory review and stock reconciliation.",
      },
    ],
  }),
  component: MonthlyAuditPage,
});

interface BatchReviewRow {
  id: string;
  item_id: string;
  month_year: string;
  is_reviewed: boolean;
  physical_count: number | null;
  notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string;
}

function getCurrentMonthYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatMonthLabel(monthYear: string, lang: string): string {
  const [y, m] = monthYear.split("-");
  if (!y || !m) return monthYear;
  const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
  return date.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", {
    month: "long",
    year: "numeric",
  });
}

function shiftMonth(monthYear: string, offset: number): string {
  const [y, m] = monthYear.split("-");
  const date = new Date(parseInt(y || "2026", 10), parseInt(m || "1", 10) - 1 + offset, 1);
  const newY = date.getFullYear();
  const newM = String(date.getMonth() + 1).padStart(2, "0");
  return `${newY}-${newM}`;
}

export function MonthlyAuditPage() {
  const { t, lang } = useI18n();
  const { user, canEditItems } = useAuth();
  const settings = useSettings();
  const queryClient = useQueryClient();

  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthYear);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "pending" | "reviewed" | "new_only">("all");
  const [viewMode, setViewMode] = useState<"table" | "cards">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("vienna_audit_view_mode");
      if (saved === "table" || saved === "cards") return saved;
      return window.innerWidth < 768 ? "cards" : "table";
    }
    return "cards";
  });

  const handleSetViewMode = (mode: "table" | "cards") => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("vienna_audit_view_mode", mode);
    }
  };

  // 1. Fetch all active items
  const itemsQuery = useQuery({
    queryKey: ["items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // 2. Fetch monthly reviews for the selected month
  const reviewsQuery = useQuery({
    queryKey: ["batch_monthly_reviews", selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batch_monthly_reviews")
        .select("*")
        .eq("month_year", selectedMonth);
      if (error) {
        // Return empty list if table not migrated yet
        return [] as BatchReviewRow[];
      }
      return (data ?? []) as BatchReviewRow[];
    },
  });

  // Map item_id -> BatchReviewRow
  const reviewsMap = useMemo(() => {
    const map = new Map<string, BatchReviewRow>();
    for (const r of reviewsQuery.data ?? []) {
      map.set(r.item_id, r);
    }
    return map;
  }, [reviewsQuery.data]);

  // Combined Rows with Review Status and New Badge detection
  const combinedRows = useMemo(() => {
    const items = itemsQuery.data ?? [];
    return items.map((item) => {
      const review = reviewsMap.get(item.id);
      const isReviewed = Boolean(review?.is_reviewed);
      // New batch detection: created_at matches the selected month
      const isNewThisMonth = Boolean(item.created_at && item.created_at.startsWith(selectedMonth));
      const days = daysUntil(item.expiry_date);
      const status = statusFor(days, settings.data?.thresholds);

      return {
        item,
        review,
        isReviewed,
        isNewThisMonth,
        days,
        status,
      };
    });
  }, [itemsQuery.data, reviewsMap, selectedMonth, settings.data?.thresholds]);

  // KPIs
  const kpis = useMemo(() => {
    const total = combinedRows.length;
    let reviewed = 0;
    let newThisMonth = 0;

    for (const row of combinedRows) {
      if (row.isReviewed) reviewed++;
      if (row.isNewThisMonth) newThisMonth++;
    }

    const pending = total - reviewed;
    const progress = total > 0 ? Math.round((reviewed / total) * 100) : 0;

    return { total, reviewed, pending, newThisMonth, progress };
  }, [combinedRows]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return combinedRows.filter((row) => {
      if (s) {
        const matchesName = row.item.name.toLowerCase().includes(s);
        const matchesCode = (row.item.item_code || "").toLowerCase().includes(s);
        const matchesBatch = (row.item.batch_number || "").toLowerCase().includes(s);
        const matchesLocation = (row.item.storage_location || "").toLowerCase().includes(s);
        const matchesSupplier = (row.item.supplier || "").toLowerCase().includes(s);
        if (!matchesName && !matchesCode && !matchesBatch && !matchesLocation && !matchesSupplier) {
          return false;
        }
      }

      if (filterType === "pending") return !row.isReviewed;
      if (filterType === "reviewed") return row.isReviewed;
      if (filterType === "new_only") return row.isNewThisMonth;
      return true;
    });
  }, [combinedRows, search, filterType]);

  // Toggle single item review status (Instant Optimistic UI Feedback)
  const toggleItemReview = useMutation({
    onMutate: async ({ itemId, nextState }) => {
      // Cancel ongoing refetches so optimistic data is not overwritten
      await queryClient.cancelQueries({ queryKey: ["batch_monthly_reviews", selectedMonth] });
      const previousReviews = queryClient.getQueryData<BatchReviewRow[]>([
        "batch_monthly_reviews",
        selectedMonth,
      ]);

      // Optimistically update React Query cache immediately
      queryClient.setQueryData<BatchReviewRow[]>(
        ["batch_monthly_reviews", selectedMonth],
        (old = []) => {
          const exists = old.some((r) => r.item_id === itemId);
          if (exists) {
            return old.map((r) =>
              r.item_id === itemId
                ? { ...r, is_reviewed: nextState, reviewed_at: new Date().toISOString() }
                : r,
            );
          } else {
            return [
              ...old,
              {
                id: `optimistic-${itemId}`,
                item_id: itemId,
                month_year: selectedMonth,
                is_reviewed: nextState,
                physical_count: null,
                notes: null,
                reviewed_by: user?.id ?? null,
                reviewed_at: new Date().toISOString(),
              },
            ];
          }
        },
      );

      return { previousReviews };
    },
    mutationFn: async ({ itemId, nextState }: { itemId: string; nextState: boolean }) => {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from("batch_monthly_reviews")
        .upsert(
          {
            item_id: itemId,
            month_year: selectedMonth,
            is_reviewed: nextState,
            reviewed_by: user?.id ?? null,
            reviewed_at: nowIso,
          },
          { onConflict: "item_id,month_year" }
        );

      if (error) throw error;
      return { itemId, nextState };
    },
    onSuccess: (data) => {
      const targetItem = itemsQuery.data?.find((i) => i.id === data.itemId);
      void logActivity({
        action_type: "audit_status_toggle",
        entity_id: data.itemId,
        entity_name: targetItem?.name || "صنف مخزني",
        details: { month_year: selectedMonth, is_reviewed: data.nextState },
      });
    },
    onError: (err: any, _variables, context) => {
      if (context?.previousReviews) {
        queryClient.setQueryData(
          ["batch_monthly_reviews", selectedMonth],
          context.previousReviews,
        );
      }
      console.error("toggleItemReview error:", err);
      const msg = err?.message || err?.details || "";
      if (
        msg.includes("batch_monthly_reviews") ||
        msg.includes("does not exist") ||
        msg.includes("schema cache") ||
        msg.includes("relation")
      ) {
        toast.error(
          lang === "ar"
            ? "جدول الجرد الشهري يحتاج لتشغيل كود SQL في Supabase أولاً لتفعيله."
            : "Review table missing in Supabase. Please run the SQL migration.",
          { duration: 8000 }
        );
      } else {
        toast.error(
          lang === "ar"
            ? `فشل تحديث حالة المراجعة (${msg || "تحقق من الصلاحيات"})`
            : `Failed to update review status (${msg || "Permission error"})`,
          { duration: 6000 }
        );
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["batch_monthly_reviews", selectedMonth] });
    },
  });

  // 1-Click: Mark All as Reviewed
  const markAllAsReviewed = useMutation({
    mutationFn: async () => {
      const items = itemsQuery.data ?? [];
      if (items.length === 0) return;

      const nowIso = new Date().toISOString();
      const records = items.map((i) => ({
        item_id: i.id,
        month_year: selectedMonth,
        is_reviewed: true,
        reviewed_by: user?.id ?? null,
        reviewed_at: nowIso,
      }));

      const { error } = await supabase
        .from("batch_monthly_reviews")
        .upsert(records, { onConflict: "item_id,month_year" });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(
        lang === "ar"
          ? "تم اعتماد وتحديد جميع الأصناف كمُراجعة بنجاح! ✅"
          : "All items marked as reviewed successfully! ✅",
      );
      void queryClient.invalidateQueries({ queryKey: ["batch_monthly_reviews", selectedMonth] });
    },
    onError: (err) => {
      console.error(err);
      toast.error(lang === "ar" ? "فشل تحديد الكل" : "Failed to mark all as reviewed");
    },
  });

  // Reset/Unmark All for this month
  const resetAllReviews = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("batch_monthly_reviews")
        .delete()
        .eq("month_year", selectedMonth);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.info(lang === "ar" ? "تمت إعادة ضبط حالة المراجعة لهذا الشهر" : "Reset reviews for this month");
      void queryClient.invalidateQueries({ queryKey: ["batch_monthly_reviews", selectedMonth] });
    },
    onError: (err) => {
      console.error(err);
      toast.error(lang === "ar" ? "فشل إعادة الضبط" : "Failed to reset reviews");
    },
  });

  // Dedicated clean print window (bypasses dark mode & iOS blank-page issues)
  const handlePrint = () => {
    const monthLabel = formatMonthLabel(selectedMonth, lang);
    const printDate = new Date().toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const factoryName = settings.data?.factory_name || "مصنع فيينا — Vienna Factory";

    const tableRows = filteredRows
      .map(({ item, isReviewed, isNewThisMonth }, idx) => {
        const reviewMark = isReviewed ? "✓" : "";
        const newBadge = isNewThisMonth ? " 🆕" : "";
        const batchNum = item.batch_number ? `#${item.batch_number}` : "—";
        const qty = item.quantity != null ? `${item.quantity} ${item.unit || ""}`.trim() : "—";
        const rowBg = isReviewed ? "#f0fdf4" : "#ffffff";
        const statusText = isReviewed ? (lang === "ar" ? "تمت المراجعة" : "Reviewed") : (lang === "ar" ? "بانتظار التدقيق" : "Pending");
        const statusColor = isReviewed ? "#15803d" : "#b45309";
        return `<tr style="background:${rowBg}">
          <td style="text-align:center">${idx + 1}</td>
          <td style="text-align:center;font-size:14px;color:${isReviewed ? "#15803d" : "#94a3b8"}">${reviewMark}</td>
          <td style="color:${statusColor};font-weight:600">${statusText}</td>
          <td style="font-weight:700">${item.name}${newBadge}</td>
          <td>${item.supplier || "—"}</td>
          <td style="font-family:monospace;font-weight:700">${batchNum}</td>
          <td style="font-family:monospace">${item.production_date || "—"}</td>
          <td style="font-family:monospace;color:#dc2626;font-weight:700">${item.expiry_date || "—"}</td>
          <td style="font-family:monospace">${qty}</td>
          <td>${item.storage_location || "—"}</td>
          <td style="font-family:monospace;color:#64748b">${item.item_code || "—"}</td>
        </tr>`;
      })
      .join("");

    const html = `<!DOCTYPE html>
<html lang="${lang === "ar" ? "ar" : "en"}" dir="${lang === "ar" ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${lang === "ar" ? "كشف الجرد الشهري" : "Monthly Audit Sheet"} — ${monthLabel}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body {
    background:#ffffff !important;
    color:#0f172a !important;
    font-family:'Segoe UI',Arial,'Noto Sans Arabic',sans-serif;
    font-size:10pt;
    direction:${lang === "ar" ? "rtl" : "ltr"};
  }
  @page { size:A4 landscape; margin:8mm 10mm; }
  .print-header {
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    padding-bottom:8px;
    border-bottom:2.5px solid #0f172a;
    margin-bottom:8px;
  }
  .factory-name { font-size:16pt; font-weight:900; color:#0f172a; }
  .factory-sub { font-size:9pt; color:#475569; margin-top:2px; }
  .audit-meta { text-align:${lang === "ar" ? "left" : "right"}; font-size:9pt; }
  .audit-meta strong { font-size:11pt; font-weight:800; color:#0f172a; }
  .kpi-bar {
    display:flex;
    justify-content:space-between;
    background:#f1f5f9;
    border:1px solid #cbd5e1;
    border-radius:6px;
    padding:5px 12px;
    margin-bottom:8px;
    font-size:8.5pt;
    font-family:monospace;
    color:#1e293b;
  }
  .kpi-bar span strong { font-size:10pt; }
  table {
    width:100%;
    border-collapse:collapse;
    font-size:7.5pt;
    table-layout:fixed;
  }
  thead tr { background:#1e293b !important; color:#ffffff !important; }
  th {
    background:#1e293b !important;
    color:#ffffff !important;
    font-weight:700;
    padding:5px 6px;
    border:1px solid #334155;
    font-size:7.5pt;
    white-space:nowrap;
  }
  td {
    padding:4px 6px;
    border:1px solid #e2e8f0;
    font-size:7.5pt;
    vertical-align:middle;
    color:#0f172a !important;
    background:inherit;
  }
  tr:nth-child(even) { background:#f8fafc; }
  .signatures {
    display:flex;
    justify-content:space-between;
    margin-top:20px;
    padding-top:12px;
    border-top:1.5px solid #94a3b8;
  }
  .sig-box { text-align:center; width:200px; }
  .sig-box p { font-weight:700; font-size:9pt; }
  .sig-box .sub { font-size:8pt; color:#64748b; margin-top:2px; }
  .sig-line {
    margin-top:36px;
    border-bottom:1.5px dotted #94a3b8;
    width:100%;
  }
  @media print {
    body { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    thead { display:table-header-group !important; }
    tr { page-break-inside:avoid !important; }
  }
</style>
</head>
<body>
<div class="print-header">
  <div>
    <div class="factory-name">${factoryName}</div>
    <div class="factory-sub">${lang === "ar" ? "كشف الجرد والتدقيق الشهري لمطابقة الباتشات وتواريخ الصلاحية" : "Monthly Raw Material Inventory Audit & Batch Reconciliation"}</div>
  </div>
  <div class="audit-meta">
    <p><strong>${lang === "ar" ? "شهر الجرد:" : "Audit Month:"} ${monthLabel}</strong></p>
    <p style="margin-top:3px;color:#475569">${lang === "ar" ? "تاريخ الطباعة:" : "Printed:"} ${printDate}</p>
  </div>
</div>
<div class="kpi-bar">
  <span>${lang === "ar" ? "إجمالي الباتشات" : "Total Batches"}: <strong>${kpis.total}</strong></span>
  <span>${lang === "ar" ? "تمت مراجعته" : "Reviewed"}: <strong>${kpis.reviewed}</strong> (${kpis.progress}%)</span>
  <span>${lang === "ar" ? "بانتظار المراجعة" : "Pending"}: <strong>${kpis.pending}</strong></span>
  <span>${lang === "ar" ? "شحنات جديدة" : "New Batches"}: <strong>${kpis.newThisMonth}</strong></span>
  <span>${lang === "ar" ? "المُراجع" : "Audited by"}: <strong>${user?.email || (lang === "ar" ? "فريق الجودة والمخازن" : "QC & Warehouse Team")}</strong></span>
</div>
<table>
  <thead>
    <tr>
      <th style="width:30px">#</th>
      <th style="width:28px">${lang === "ar" ? "✓" : "✓"}</th>
      <th style="width:90px">${lang === "ar" ? "حالة التدقيق" : "Status"}</th>
      <th style="width:160px">${lang === "ar" ? "اسم الصنف" : "Item Name"}</th>
      <th style="width:100px">${lang === "ar" ? "المورد" : "Supplier"}</th>
      <th style="width:80px">${lang === "ar" ? "رقم الباتش" : "Batch No."}</th>
      <th style="width:80px">${lang === "ar" ? "تاريخ الإنتاج" : "Prod. Date"}</th>
      <th style="width:80px">${lang === "ar" ? "تاريخ الانتهاء" : "Expiry Date"}</th>
      <th style="width:70px">${lang === "ar" ? "الكمية" : "Qty"}</th>
      <th style="width:90px">${lang === "ar" ? "موقع التخزين" : "Location"}</th>
      <th style="width:75px">${lang === "ar" ? "كود الصنف" : "Item Code"}</th>
    </tr>
  </thead>
  <tbody>
    ${tableRows}
  </tbody>
</table>
<div class="signatures">
  <div class="sig-box">
    <p>${lang === "ar" ? "أمين / مسؤول المخزن" : "Warehouse Keeper"}</p>
    <div class="sub">${lang === "ar" ? "الاسم والتوقيع" : "Name & Signature"}</div>
    <div class="sig-line"></div>
  </div>
  <div class="sig-box">
    <p>${lang === "ar" ? "مراقب الجودة (QC)" : "Quality Controller"}</p>
    <div class="sub">${lang === "ar" ? "الاسم والتوقيع" : "Name & Signature"}</div>
    <div class="sig-line"></div>
  </div>
  <div class="sig-box">
    <p>${lang === "ar" ? "مدير الإنتاج والمصنع" : "Production Manager"}</p>
    <div class="sub">${lang === "ar" ? "الاعتماد النهائي" : "Final Approval"}</div>
    <div class="sig-line"></div>
  </div>
</div>
</body>
</html>`;

    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) {
      // Fallback: try window.print() if popup blocked
      window.print();
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    // Give browser time to render before print dialog
    setTimeout(() => {
      printWindow.print();
      // Close window after print dialog closes (works on most browsers)
      printWindow.addEventListener("afterprint", () => printWindow.close());
    }, 600);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6 pb-24 md:pb-10">
        {/* Dedicated Print-Only Official Factory Header */}
        <div className="hidden print:block mb-4 border-b-2 border-slate-900 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-black text-slate-950">
                {settings.data?.factory_name || "مصنع فيينا — Vienna Factory"}
              </h1>
              <p className="text-xs text-slate-700 font-semibold mt-0.5">
                {settings.data?.system_tagline || "كشف الجرد والتدقيق الشهري لمطابقة الباتشات وتواريخ الصلاحية"}
              </p>
            </div>
            <div className="text-end text-xs font-mono">
              <p className="font-bold text-sm text-slate-950">
                {lang === "ar" ? "شهر الجرد:" : "Audit Month:"} {formatMonthLabel(selectedMonth, lang)}
              </p>
              <p className="text-slate-600 mt-0.5">
                {lang === "ar" ? "تاريخ الطباعة:" : "Printed on:"}{" "}
                {new Date().toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between bg-slate-100 p-2 rounded text-xs font-mono border border-slate-300">
            <span>إجمالي الباتشات: <strong>{kpis.total}</strong></span>
            <span>تمت مراجعته: <strong>{kpis.reviewed}</strong> ({kpis.progress}%)</span>
            <span>بانتظار المراجعة: <strong>{kpis.pending}</strong></span>
            <span>شحنات جديدة: <strong>{kpis.newThisMonth}</strong></span>
            <span>المُراجع: <strong>{user?.email || "فريق الجودة والمخازن"}</strong></span>
          </div>
        </div>

        {/* Page Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand shadow-xs">
              <ClipboardCheck className="size-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-cocoa leading-tight">
                {lang === "ar" ? "مراجعة الجرد الشهري وتدقيق المخزون" : "Monthly Inventory Audit & Review"}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {lang === "ar"
                  ? "تدقيق واعتماد أرصدة خامات التشغيل في مصنع فينا مع تمييز الشحنات والباتشات الجديدة لشهر الجرد."
                  : "Audit and sign off raw material batches with instant identification of newly received batches."}
              </p>
            </div>
          </div>

          {/* Month Selector Bar */}
          <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-card p-1.5 shadow-xs shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setSelectedMonth((m) => shiftMonth(m, -1))}
              title={lang === "ar" ? "الشهر السابق" : "Previous Month"}
            >
              {lang === "ar" ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
            </Button>

            <div className="flex items-center gap-1.5 px-2">
              <Calendar className="size-4 text-brand" />
              <span className="text-xs sm:text-sm font-bold text-cocoa font-mono">
                {formatMonthLabel(selectedMonth, lang)}
              </span>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setSelectedMonth((m) => shiftMonth(m, 1))}
              title={lang === "ar" ? "الشهر التالي" : "Next Month"}
            >
              {lang === "ar" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
            </Button>
          </div>
        </div>

        {/* Audit Progress & KPI Overview Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 print:hidden">
          <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
            <p className="text-xs text-muted-foreground">{lang === "ar" ? "إجمالي الباتشات" : "Total Batches"}</p>
            <p className="text-2xl font-bold text-cocoa mt-1 font-mono">{kpis.total}</p>
            <div className="mt-2 h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-brand rounded-full" style={{ width: `${kpis.progress}%` }} />
            </div>
          </div>

          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 shadow-xs">
            <p className="text-xs text-emerald-950 dark:text-emerald-200 font-medium">
              {lang === "ar" ? "تمت مراجعته ✅" : "Reviewed Batches"}
            </p>
            <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100 mt-1 font-mono">
              {kpis.reviewed}
            </p>
            <p className="text-[10px] text-emerald-800/80 dark:text-emerald-300/80 mt-1">
              {kpis.progress}% {lang === "ar" ? "من إجمالي الرصيد" : "completed"}
            </p>
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 shadow-xs">
            <p className="text-xs text-amber-950 dark:text-amber-200 font-medium">
              {lang === "ar" ? "بانتظار المراجعة ⏳" : "Pending Audit"}
            </p>
            <p className="text-2xl font-bold text-amber-900 dark:text-amber-100 mt-1 font-mono">
              {kpis.pending}
            </p>
            <p className="text-[10px] text-amber-800/80 dark:text-amber-300/80 mt-1">
              {kpis.total - kpis.reviewed} {lang === "ar" ? "باتش متبقي" : "remaining"}
            </p>
          </div>

          <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs text-purple-950 dark:text-purple-200 font-medium">
                {lang === "ar" ? "أصناف جديدة هذا الشهر" : "New Batches Added"}
              </p>
              <span className="rounded bg-purple-600 px-1.5 py-0.2 text-[10px] font-bold text-white shadow-xs">
                NEW
              </span>
            </div>
            <p className="text-2xl font-bold text-purple-900 dark:text-purple-100 mt-1 font-mono">
              {kpis.newThisMonth}
            </p>
            <p className="text-[10px] text-purple-800/80 dark:text-purple-300/80 mt-1">
              {lang === "ar" ? "شحنات وردت خلال الشهر" : "Received during this month"}
            </p>
          </div>
        </div>

        {/* Toolbar: Search, Filters & Bulk Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Input
                placeholder={lang === "ar" ? "بحث بالصنف، الباتش، الكود، الموقع..." : "Search items..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="text-xs pe-8"
              />
              <Search className="absolute end-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
            </div>

            {/* Quick Filter Selector */}
            <Select value={filterType} onValueChange={(v) => setFilterType(v as typeof filterType)}>
              <SelectTrigger className="w-full sm:w-48 text-xs">
                <div className="flex items-center gap-1.5 truncate">
                  <Filter className="size-3.5 text-brand shrink-0" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{lang === "ar" ? "جميع الأصناف" : "All Items"} ({combinedRows.length})</SelectItem>
                <SelectItem value="pending">{lang === "ar" ? "بانتظار المراجعة فقط" : "Pending Only"} ({kpis.pending})</SelectItem>
                <SelectItem value="reviewed">{lang === "ar" ? "تمت المراجعة فقط" : "Reviewed Only"} ({kpis.reviewed})</SelectItem>
                <SelectItem value="new_only">{lang === "ar" ? "🆕 شحنات جديدة فقط" : "🆕 New Only"} ({kpis.newThisMonth})</SelectItem>
              </SelectContent>
            </Select>
            {/* View Mode Toggle: Cards / Table */}
            <div className="flex items-center rounded-lg border bg-muted/40 p-0.5">
              <Button
                type="button"
                variant={viewMode === "cards" ? "default" : "ghost"}
                size="sm"
                className="h-8 px-2.5 text-xs gap-1"
                onClick={() => handleSetViewMode("cards")}
                title={lang === "ar" ? "عرض الكروت (المناسب للموبايل)" : "Cards View"}
              >
                <LayoutGrid className="size-3.5" />
                <span>{lang === "ar" ? "كروت" : "Cards"}</span>
              </Button>
              <Button
                type="button"
                variant={viewMode === "table" ? "default" : "ghost"}
                size="sm"
                className="h-8 px-2.5 text-xs gap-1"
                onClick={() => handleSetViewMode("table")}
                title={lang === "ar" ? "عرض الجدول الشامل" : "Table View"}
              >
                <Table className="size-3.5" />
                <span>{lang === "ar" ? "جدول" : "Table"}</span>
              </Button>
            </div>
          </div>

          {/* Bulk Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 ms-auto">
            {canEditItems && (
              <>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    if (window.confirm(lang === "ar" ? "هل أنت متأكد من رغبتك في اعتماد وتحديد جميع الأصناف كمُراجعة لهذا الشهر؟" : "Mark all items as reviewed for this month?")) {
                      markAllAsReviewed.mutate();
                    }
                  }}
                  disabled={markAllAsReviewed.isPending || kpis.pending === 0}
                  className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs"
                >
                  <CheckCheck className="size-3.5" />
                  <span>{lang === "ar" ? "تحديد الكل كمُراجع" : "Mark All Reviewed"}</span>
                </Button>

                {kpis.reviewed > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (window.confirm(lang === "ar" ? "إعادة ضبط وإلغاء مراجعة جميع الأصناف لهذا الشهر؟" : "Reset all reviews for this month?")) {
                        resetAllReviews.mutate();
                      }
                    }}
                    disabled={resetAllReviews.isPending}
                    className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                  >
                    <RotateCcw className="size-3" />
                    <span>{lang === "ar" ? "إلغاء التحديد" : "Reset"}</span>
                  </Button>
                )}
              </>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handlePrint()}
              className="h-8 gap-1.5 text-xs"
            >
              <Printer className="size-3.5" />
              <span>{lang === "ar" ? "طباعة كشف الجرد" : "Print Audit Sheet"}</span>
            </Button>
          </div>
        </div>

        {/* 1. Cards View (Best for Mobile - hidden during print) */}
        {viewMode === "cards" && (
          <div className="space-y-3 print:hidden">
            {filteredRows.length === 0 ? (
              <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground text-xs">
                {lang === "ar" ? "لا توجد نتائج تطابق خيارات البحث." : "No records matching filters."}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredRows.map(({ item, review, isReviewed, isNewThisMonth, days, status }, idx) => (
                  <div
                    key={item.id}
                    className={`rounded-xl border p-4 transition-all shadow-xs ${
                      isReviewed
                        ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                        : "border-border/80 bg-card hover:border-brand/40"
                    }`}
                  >
                    {/* Header: # Index, Checkbox & Review Status Badge */}
                    <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-border/40">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground font-semibold">
                          #{idx + 1}
                        </span>
                        <button
                          type="button"
                          disabled={!canEditItems}
                          onClick={() => {
                            navigator.vibrate?.(10);
                            toggleItemReview.mutate({
                              itemId: item.id,
                              nextState: !isReviewed,
                            });
                          }}
                          className={`flex size-8 sm:size-7 shrink-0 items-center justify-center rounded-lg border transition-all active:scale-95 cursor-pointer ${
                            isReviewed
                              ? "bg-emerald-600 border-emerald-600 text-white shadow-xs"
                              : "border-border/80 bg-background hover:border-brand"
                          }`}
                        >
                          {isReviewed && <CheckCheck className="size-4" />}
                        </button>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            isReviewed
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          }`}
                        >
                          {isReviewed
                            ? (lang === "ar" ? "تمت المراجعة ✅" : "Reviewed ✅")
                            : (lang === "ar" ? "بانتظار التدقيق ⏳" : "Pending ⏳")}
                        </span>
                      </div>

                      <QcBadge status={item.qc_status} />
                    </div>

                    {/* Item Title & Supplier & NEW Badge */}
                    <div className="pt-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-cocoa dark:text-cream text-base leading-snug">
                          {item.name}
                        </h3>
                        {isNewThisMonth && (
                          <span className="rounded-full bg-purple-600 text-white px-2 py-0.5 text-[10px] font-extrabold shadow-xs animate-pulse shrink-0">
                            🆕 {lang === "ar" ? "جديد" : "NEW"}
                          </span>
                        )}
                      </div>
                      {item.supplier && (
                        <p className="text-xs text-muted-foreground mt-0.5">{item.supplier}</p>
                      )}
                    </div>

                    {/* Batch Number & Item Code */}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 bg-muted/40 p-2 rounded-lg text-xs font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground font-sans text-[11px]">{t("batchNumber")}:</span>
                        {item.batch_number ? (
                          <span className="rounded bg-brand/10 px-2 py-0.5 font-bold text-brand text-xs">
                            #{item.batch_number}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                      {item.item_code && (
                        <div className="text-[11px] text-muted-foreground">
                          <span>{item.item_code}</span>
                        </div>
                      )}
                    </div>

                    {/* Prominent Production Date & Expiry Date */}
                    <div className="mt-3 grid grid-cols-2 gap-2 bg-background/80 rounded-lg p-2.5 border border-border/50 text-xs">
                      {/* Production Date */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                          <Calendar className="size-3.5 text-brand shrink-0" />
                          <span>{lang === "ar" ? "تاريخ الإنتاج" : "Production"}</span>
                        </div>
                        <p className="font-mono font-bold text-foreground text-xs">
                          {item.production_date || "—"}
                        </p>
                      </div>

                      {/* Expiry Date */}
                      <div className="space-y-1 border-s border-border/40 ps-2">
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                          <Clock className="size-3.5 text-amber-500 shrink-0" />
                          <span>{lang === "ar" ? "تاريخ الانتهاء" : "Expiry"}</span>
                        </div>
                        <p className="font-mono font-bold text-xs text-destructive">
                          {item.expiry_date}
                        </p>
                        <span className="text-[10px] text-muted-foreground font-sans block">
                          ({countdownText(days, t)})
                        </span>
                      </div>
                    </div>

                    {/* Footer: Quantity & Storage Location */}
                    <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-border/40 text-muted-foreground">
                      <div className="font-mono font-semibold text-foreground">
                        {item.quantity != null ? `${item.quantity} ${item.unit || ""}`.trim() : "—"}
                      </div>
                      {item.storage_location && (
                        <div className="flex items-center gap-1 text-[11px]">
                          <MapPin className="size-3 text-brand shrink-0" />
                          <span className="truncate max-w-[140px]">{item.storage_location}</span>
                        </div>
                      )}
                    </div>

                    {/* Dedicated Mobile-Friendly Audit Button */}
                    {canEditItems && (
                      <Button
                        type="button"
                        variant={isReviewed ? "outline" : "default"}
                        size="sm"
                        onClick={() => {
                          navigator.vibrate?.(15);
                          toggleItemReview.mutate({
                            itemId: item.id,
                            nextState: !isReviewed,
                          });
                        }}
                        className={`w-full mt-3 h-9 text-xs font-bold gap-1.5 active:scale-[0.98] transition-all ${
                          isReviewed
                            ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                            : "bg-brand hover:bg-brand/90 text-white shadow-xs"
                        }`}
                      >
                        {isReviewed ? (
                          <>
                            <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                            <span>{lang === "ar" ? "تم اعتماد التدقيق ✅ (اضغط للإلغاء)" : "Reviewed ✅ (Tap to undo)"}</span>
                          </>
                        ) : (
                          <>
                            <CheckCheck className="size-3.5 shrink-0" />
                            <span>{lang === "ar" ? "اعتماد وتدقيق الباتش الآن" : "Sign Off & Review Batch"}</span>
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Mobile Table Scroll Guide Banner */}
        {viewMode === "table" && (
          <div className="flex sm:hidden items-center justify-between gap-2 rounded-xl bg-brand/10 border border-brand/20 p-2.5 text-xs text-cocoa print:hidden">
            <span className="flex items-center gap-1.5 font-medium">
              <ArrowUpDown className="size-3.5 text-brand rotate-90 shrink-0" />
              <span>{lang === "ar" ? "اسحب أفقياً أو انتقل لعرض الكروت" : "Swipe horizontally or view cards"}</span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleSetViewMode("cards")}
              className="h-7 px-2 text-xs font-bold bg-background shrink-0"
            >
              <LayoutGrid className="size-3 me-1 text-brand" />
              <span>{lang === "ar" ? "عرض الكروت" : "Cards"}</span>
            </Button>
          </div>
        )}

        {/* 2. Main Audit Table (Always used for Print, and on-screen when viewMode === 'table') */}
        <div
          className={`overflow-x-auto rounded-xl border bg-card shadow-sm print-content ${
            viewMode === "table" ? "block" : "hidden print:block"
          }`}
        >
          <table className="w-full min-w-[1000px] print:min-w-0 text-xs">
              <thead className="bg-muted/70 font-semibold text-cocoa">
                <tr>
                  <th className="px-3 py-2.5 text-start w-12">#</th>
                  <th className="px-3 py-2.5 text-start">{lang === "ar" ? "حالة التدقيق" : "Audit Status"}</th>
                  <th className="px-3 py-2.5 text-start min-w-[200px]">{t("name")}</th>
                  <th className="px-3 py-2.5 text-start font-mono">{t("batchNumber")}</th>
                  <th className="px-3 py-2.5 text-start font-mono">{lang === "ar" ? "تاريخ الإنتاج" : "Production Date"}</th>
                  <th className="px-3 py-2.5 text-start font-mono">{t("expiryDate")}</th>
                  <th className="px-3 py-2.5 text-start">{t("quantity")}</th>
                  <th className="px-3 py-2.5 text-start">{t("storageLocation")}</th>
                  <th className="px-3 py-2.5 text-start">{t("qcStatus")}</th>
                  <th className="px-3 py-2.5 text-start font-mono">{t("itemCode")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-muted-foreground">
                      {lang === "ar" ? "لا توجد نتائج تطابق خيارات البحث." : "No records matching filters."}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map(({ item, review, isReviewed, isNewThisMonth, days, status }, idx) => (
                    <tr
                      key={item.id}
                      className={`transition-colors hover:bg-muted/30 ${
                        isReviewed ? "bg-emerald-500/5" : ""
                      }`}
                    >
                      <td className="px-3 py-2.5 font-mono text-muted-foreground">{idx + 1}</td>

                      {/* Audit Checkbox & Status */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={!canEditItems}
                            onClick={() => {
                              navigator.vibrate?.(10);
                              toggleItemReview.mutate({
                                itemId: item.id,
                                nextState: !isReviewed,
                              });
                            }}
                            className={`flex size-7 sm:size-6 shrink-0 items-center justify-center rounded-md border transition-all active:scale-90 cursor-pointer print:hidden ${
                              isReviewed
                                ? "bg-emerald-600 border-emerald-600 text-white shadow-xs"
                                : "border-border/80 bg-background hover:border-brand"
                            }`}
                          >
                            {isReviewed && <CheckCheck className="size-4 sm:size-3.5" />}
                          </button>

                          {/* Print checkbox box */}
                          <span className="hidden print:inline-flex w-4 h-4 border border-slate-700 rounded items-center justify-center text-[10px] font-bold">
                            {isReviewed ? "✓" : ""}
                          </span>

                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              isReviewed
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 print:bg-transparent print:text-slate-900"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 print:bg-transparent print:text-slate-900"
                            }`}
                          >
                            {isReviewed
                              ? (lang === "ar" ? "تمت المراجعة" : "Reviewed")
                              : (lang === "ar" ? "بانتظار التدقيق" : "Pending")}
                          </span>
                        </div>
                      </td>

                      {/* Raw Material Name + Supplier + NEW Badge + In-column Dates */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-cocoa text-sm">{item.name}</span>
                          {isNewThisMonth && (
                            <span className="rounded-full bg-purple-600 text-white px-2 py-0.5 text-[10px] font-extrabold shadow-xs animate-pulse">
                              🆕 {lang === "ar" ? "جديد" : "NEW"}
                            </span>
                          )}
                        </div>
                        {item.supplier && (
                          <span className="text-[11px] text-muted-foreground block">{item.supplier}</span>
                        )}
                        {/* Compact dates visible even without scrolling on mobile */}
                        <div className="flex items-center gap-1.5 mt-1 text-[11px] font-mono flex-wrap">
                          <span className="bg-muted px-1.5 py-0.5 rounded text-foreground">
                            إنتاج: <strong>{item.production_date || "—"}</strong>
                          </span>
                          <span className="bg-amber-500/10 text-amber-900 dark:text-amber-200 px-1.5 py-0.5 rounded font-bold">
                            انتهاء: {item.expiry_date}
                          </span>
                        </div>
                      </td>

                      {/* Batch Number */}
                      <td className="px-3 py-2.5 font-mono font-medium">
                        {item.batch_number ? (
                          <span className="rounded bg-brand/10 px-1.5 py-0.5 text-brand font-bold">
                            #{item.batch_number}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>

                      {/* Production Date Column */}
                      <td className="px-3 py-2.5 font-mono whitespace-nowrap font-medium text-foreground">
                        {item.production_date || "—"}
                      </td>

                      {/* Expiry Date Column */}
                      <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                        <span className="font-bold text-destructive">{item.expiry_date}</span>
                        <span className="block text-[10px] text-muted-foreground font-sans">
                          {countdownText(days, t)}
                        </span>
                      </td>

                      {/* Quantity */}
                      <td className="px-3 py-2.5 font-mono font-semibold">
                        {item.quantity != null ? `${item.quantity} ${item.unit || ""}`.trim() : "—"}
                      </td>

                      {/* Storage Location */}
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {item.storage_location ? (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3 text-brand shrink-0" />
                            <span>{item.storage_location}</span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>

                      {/* QC Status */}
                      <td className="px-3 py-2.5">
                        <QcBadge status={item.qc_status} />
                      </td>

                      {/* Item Code */}
                      <td className="px-3 py-2.5 font-mono text-muted-foreground">
                        {item.item_code || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Official Signatures Section for Print */}
            <div className="hidden print:flex justify-between items-center mt-8 pt-4 border-t border-slate-300 text-xs text-slate-700 print-signatures-section">
              <div className="text-center w-48">
                <p className="font-bold">أمين / مسؤول المخزن</p>
                <p className="text-[10px] text-muted-foreground mt-1">الاسم والتوقيع</p>
                <div className="mt-10 border-b border-dotted border-slate-400 w-full" />
              </div>
              <div className="text-center w-48">
                <p className="font-bold">مراقب الجودة (QC)</p>
                <p className="text-[10px] text-muted-foreground mt-1">الاسم والتوقيع</p>
                <div className="mt-10 border-b border-dotted border-slate-400 w-full" />
              </div>
              <div className="text-center w-48">
                <p className="font-bold">مدير الإنتاج والمصنع</p>
                <p className="text-[10px] text-muted-foreground mt-1">الاعتماد النهائي</p>
                <div className="mt-10 border-b border-dotted border-slate-400 w-full" />
              </div>
            </div>
          </div>
      </main>

      <MobileBottomNav />
    </div>
  );
}
