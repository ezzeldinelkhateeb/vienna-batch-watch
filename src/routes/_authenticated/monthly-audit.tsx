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
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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

  // Toggle single item review status
  const toggleItemReview = useMutation({
    mutationFn: async ({ itemId, nextState }: { itemId: string; nextState: boolean }) => {
      const payload = {
        item_id: itemId,
        month_year: selectedMonth,
        is_reviewed: nextState,
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("batch_monthly_reviews")
        .upsert(payload, { onConflict: "item_id,month_year" });

      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["batch_monthly_reviews", selectedMonth] });
    },
    onError: (err) => {
      console.error(err);
      toast.error(lang === "ar" ? "فشل تحديث حالة المراجعة" : "Failed to update review status");
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

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6 pb-24 md:pb-10">
        {/* Page Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
        <div className="flex flex-wrap items-center justify-between gap-3">
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
              onClick={() => window.print()}
              className="h-8 gap-1.5 text-xs"
            >
              <Printer className="size-3.5" />
              <span>{lang === "ar" ? "طباعة كشف الجرد" : "Print Audit Sheet"}</span>
            </Button>
          </div>
        </div>

        {/* Main Audit Table */}
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm print-content">
          <table className="w-full min-w-[1000px] text-xs">
            <thead className="bg-muted/70 font-semibold text-cocoa">
              <tr>
                <th className="px-3 py-2.5 text-start w-12">#</th>
                <th className="px-3 py-2.5 text-start">{lang === "ar" ? "حالة التدقيق" : "Audit Status"}</th>
                <th className="px-3 py-2.5 text-start">{t("name")}</th>
                <th className="px-3 py-2.5 text-start">{t("batchNumber")}</th>
                <th className="px-3 py-2.5 text-start">{t("itemCode")}</th>
                <th className="px-3 py-2.5 text-start">{t("quantity")}</th>
                <th className="px-3 py-2.5 text-start">{t("storageLocation")}</th>
                <th className="px-3 py-2.5 text-start">{t("qcStatus")}</th>
                <th className="px-3 py-2.5 text-start">{t("expiryDate")}</th>
                <th className="px-3 py-2.5 text-start">{lang === "ar" ? "تاريخ الإضافة" : "Added Date"}</th>
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
                          disabled={!canEditItems || toggleItemReview.isPending}
                          onClick={() =>
                            toggleItemReview.mutate({
                              itemId: item.id,
                              nextState: !isReviewed,
                            })
                          }
                          className={`flex size-5 shrink-0 items-center justify-center rounded border transition-all cursor-pointer ${
                            isReviewed
                              ? "bg-emerald-600 border-emerald-600 text-white shadow-xs"
                              : "border-border/80 bg-background hover:border-brand"
                          }`}
                        >
                          {isReviewed && <CheckCheck className="size-3.5" />}
                        </button>

                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            isReviewed
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          }`}
                        >
                          {isReviewed
                            ? (lang === "ar" ? "تمت المراجعة" : "Reviewed")
                            : (lang === "ar" ? "بانتظار التدقيق" : "Pending")}
                        </span>
                      </div>
                    </td>

                    {/* Raw Material Name + NEW Badge */}
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
                    </td>

                    {/* Batch Number */}
                    <td className="px-3 py-2.5 font-mono font-medium">
                      {item.batch_number ? (
                        <span className="rounded bg-brand/10 px-1.5 py-0.5 text-brand">
                          #{item.batch_number}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Item Code */}
                    <td className="px-3 py-2.5 font-mono text-muted-foreground">
                      {item.item_code || "—"}
                    </td>

                    {/* Quantity */}
                    <td className="px-3 py-2.5 font-mono font-semibold">
                      {item.quantity != null ? `${item.quantity} ${item.unit || ""}`.trim() : "—"}
                    </td>

                    {/* Storage Location */}
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {item.storage_location ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3 text-brand" />
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

                    {/* Expiry Date */}
                    <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                      <span>{item.expiry_date}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {countdownText(days, t)}
                      </span>
                    </td>

                    {/* Created Date */}
                    <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                      {item.created_at ? item.created_at.slice(0, 10) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      <MobileBottomNav />
    </div>
  );
}
