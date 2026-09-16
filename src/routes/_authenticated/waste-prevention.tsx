import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShieldAlert,
  Flame,
  AlertTriangle,
  Clock,
  Sparkles,
  Search,
  Printer,
  Factory,
  MessageCircle,
  TrendingDown,
  Percent,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Boxes,
  Layers,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { daysUntil, statusFor } from "@/lib/status";
import { countdownText } from "@/lib/format";
import { AppHeader } from "@/components/AppHeader";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { StatusPill, QcBadge, FefoBadge } from "@/components/StatusPill";
import { DispenseProductionDialog } from "@/components/DispenseProductionDialog";
import { type ItemRow } from "@/components/ItemFormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildDirectWhatsAppUrl } from "@/lib/whatsapp.shared";

export const Route = createFileRoute("/_authenticated/waste-prevention")({
  component: WastePreventionPage,
});

type Horizon = "all" | "7" | "15" | "30" | "60" | "90";

function suggestProductionLine(materialName: string): string {
  const name = materialName.toLowerCase();
  if (name.includes("شوكول") || name.includes("كاكاو") || name.includes("زبده") || name.includes("حليب") || name.includes("لبن") || name.includes("cocoa") || name.includes("choc")) {
    return "خط صب الشوكولاتة والبارات";
  }
  if (name.includes("دقيق") || name.includes("نشا") || name.includes("سكر") || name.includes("بيكنج") || name.includes("flour") || name.includes("sugar")) {
    return "خط بسكويت ويفر";
  }
  if (name.includes("زيت") || name.includes("دهن") || name.includes("بندق") || name.includes("نكه") || name.includes("فانيليا") || name.includes("vanilla") || name.includes("flavor") || name.includes("oil")) {
    return "خط الكريمات والحشوات";
  }
  if (name.includes("كيس") || name.includes("كرتون") || name.includes("سلوفان") || name.includes("استيكر") || name.includes("foil") || name.includes("pack")) {
    return "خط التعبئة والتغليف";
  }
  return "خط الإنتاج العام";
}

export function WastePreventionPage() {
  const { t, lang } = useI18n();
  const { canEditItems } = useAuth();
  const queryClient = useQueryClient();
  const settings = useSettings();
  const thresholds = settings.data?.thresholds;

  const [horizon, setHorizon] = useState<Horizon>("30");
  const [search, setSearch] = useState("");
  const [dispenseItem, setDispenseItem] = useState<ItemRow | null>(null);

  const itemsQuery = useQuery({
    queryKey: ["items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .order("expiry_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
  });

  const allItems = itemsQuery.data ?? [];

  // Filter out zero-quantity items
  const activeStockItems = useMemo(() => {
    return allItems.filter((i) => (Number(i.quantity) || 0) > 0);
  }, [allItems]);

  // Risk buckets calculation
  const riskAnalytics = useMemo(() => {
    let under7Qty = 0;
    let under7Count = 0;

    let between8And30Qty = 0;
    let between8And30Count = 0;

    let between31And60Qty = 0;
    let between31And60Count = 0;

    let safeQty = 0;
    let safeCount = 0;

    for (const item of activeStockItems) {
      const days = daysUntil(item.expiry_date);
      const qty = Number(item.quantity) || 0;

      if (days < 7) {
        under7Count++;
        under7Qty += qty;
      } else if (days <= 30) {
        between8And30Count++;
        between8And30Qty += qty;
      } else if (days <= 60) {
        between31And60Count++;
        between31And60Qty += qty;
      } else {
        safeCount++;
        safeQty += qty;
      }
    }

    const totalActiveBatches = activeStockItems.length;
    const safetyScore =
      totalActiveBatches > 0
        ? Math.round((safeCount / totalActiveBatches) * 100)
        : 100;

    return {
      under7Count,
      under7Qty: Math.round(under7Qty * 10) / 10,
      between8And30Count,
      between8And30Qty: Math.round(between8And30Qty * 10) / 10,
      between31And60Count,
      between31And60Qty: Math.round(between31And60Qty * 10) / 10,
      safeCount,
      safeQty: Math.round(safeQty * 10) / 10,
      safetyScore,
      totalActiveBatches,
    };
  }, [activeStockItems]);

  // Filtered rows for priority matrix
  const matrixRows = useMemo(() => {
    let filtered = activeStockItems;

    // Horizon filter
    if (horizon !== "all") {
      const maxDays = parseInt(horizon, 10);
      filtered = filtered.filter((i) => daysUntil(i.expiry_date) <= maxDays);
    }

    // Search query filter
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.item_code && i.item_code.toLowerCase().includes(q)) ||
          (i.batch_number && i.batch_number.toLowerCase().includes(q)) ||
          (i.supplier && i.supplier.toLowerCase().includes(q)),
      );
    }

    // Sort by earliest expiry date
    return [...filtered].sort(
      (a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime(),
    );
  }, [activeStockItems, horizon, search]);

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsAppReport = () => {
    const urgentItems = activeStockItems.filter((i) => daysUntil(i.expiry_date) <= 30);
    if (urgentItems.length === 0) {
      toast.info(lang === "ar" ? "لا توجد خامات حرجة أو مهددة خلال 30 يوم" : "No urgent items in 30 days");
      return;
    }

    let msg = `🏭 *تقرير خطة مكافحة الهالك وتوجيه الإنتاج — مصنع فيينا*\n`;
    msg += `📅 التاريخ: ${new Date().toLocaleDateString("ar-EG")}\n`;
    msg += `🛡️ مؤشر الأمان المخزني: ${riskAnalytics.safetyScore}%\n`;
    msg += `⚠️ عدد التشغيلات المهددة (خلال 30 يوم): ${urgentItems.length} تشغيلة\n\n`;
    msg += `*قائمة الخامات المطلوب إدراجها فوراً في خطة التشغيل:*\n`;

    urgentItems.slice(0, 15).forEach((it, idx) => {
      const days = daysUntil(it.expiry_date);
      const line = suggestProductionLine(it.name);
      msg += `${idx + 1}. *${it.name}* ${it.batch_number ? `(#${it.batch_number})` : ""}\n`;
      msg += `   • الكمية: ${it.quantity} ${it.unit || "كجم"}\n`;
      msg += `   • الأيام المتبقية: ${days} يوم (تنتهي ${it.expiry_date})\n`;
      msg += `   • الخط المقترح: ${line}\n\n`;
    });

    if (urgentItems.length > 15) {
      msg += `... ومتبقي ${urgentItems.length - 15} أصناف أخرى في التقرير الكامل داخل التطبيق.\n`;
    }

    const defaultPhone = settings.data?.whatsapp_phone;
    const url = buildDirectWhatsAppUrl(defaultPhone, msg);
    window.open(url, "_blank");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground pb-20 md:pb-12">
      <AppHeader />

      <main className="mx-auto flex-1 w-full max-w-7xl px-4 py-6 sm:px-6 space-y-6">
        {/* Top Header Card */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-tr from-brand to-cocoa text-cream shadow-sm">
                <ShieldAlert className="size-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-cocoa dark:text-cream">
                  {t("wastePrevention")}
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t("wastePreventionSubtitle")}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={handleShareWhatsAppReport}
              className="gap-1.5 text-xs text-[#25D366] border-[#25D366]/40 hover:bg-[#25D366]/10 font-semibold"
            >
              <MessageCircle className="size-3.5" />
              <span>{t("shareReportWhatsApp")}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="gap-1.5 text-xs font-semibold"
            >
              <Printer className="size-3.5" />
              <span>{t("printWasteReport")}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void itemsQuery.refetch()}
              className="size-8"
              title={lang === "ar" ? "تحديث" : "Refresh"}
            >
              <RefreshCw className={`size-4 ${itemsQuery.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Risk Metrics Cards (4 Buckets + Safety Score) */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Critical Risk (< 7 Days) */}
          <div className="rounded-xl border border-rose-300/80 bg-rose-50/80 dark:bg-rose-950/40 p-4 space-y-1 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1">
                <Flame className="size-4 text-rose-600 animate-pulse" />
                <span>{t("criticalRiskUnder7")}</span>
              </span>
              <span className="rounded-full bg-rose-600 text-white font-mono font-bold text-xs px-2 py-0.5">
                {riskAnalytics.under7Count}
              </span>
            </div>
            <div className="text-2xl font-black font-mono text-rose-900 dark:text-rose-100 pt-1">
              {riskAnalytics.under7Qty}
            </div>
            <p className="text-[11px] text-rose-700/80 dark:text-rose-300/80">
              {lang === "ar" ? "كجم معرض للتلف المباشر" : "kg at urgent disposal risk"}
            </p>
          </div>

          {/* High Risk (8 - 30 Days) */}
          <div className="rounded-xl border border-amber-300/80 bg-amber-50/80 dark:bg-amber-950/40 p-4 space-y-1 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                <AlertTriangle className="size-4 text-amber-600" />
                <span>{t("highRisk30")}</span>
              </span>
              <span className="rounded-full bg-amber-600 text-white font-mono font-bold text-xs px-2 py-0.5">
                {riskAnalytics.between8And30Count}
              </span>
            </div>
            <div className="text-2xl font-black font-mono text-amber-900 dark:text-amber-100 pt-1">
              {riskAnalytics.between8And30Qty}
            </div>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80">
              {lang === "ar" ? "كجم يلزم جدولتها هذا الشهر" : "kg to schedule in monthly plan"}
            </p>
          </div>

          {/* Medium Risk (31 - 60 Days) */}
          <div className="rounded-xl border border-yellow-300/80 bg-yellow-50/80 dark:bg-yellow-950/40 p-4 space-y-1 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-yellow-800 dark:text-yellow-300 flex items-center gap-1">
                <Clock className="size-4 text-yellow-600" />
                <span>{t("mediumRisk60")}</span>
              </span>
              <span className="rounded-full bg-yellow-600 text-white font-mono font-bold text-xs px-2 py-0.5">
                {riskAnalytics.between31And60Count}
              </span>
            </div>
            <div className="text-2xl font-black font-mono text-yellow-900 dark:text-yellow-100 pt-1">
              {riskAnalytics.between31And60Qty}
            </div>
            <p className="text-[11px] text-yellow-700/80 dark:text-yellow-300/80">
              {lang === "ar" ? "كجم تحت المراقبة الاستباقية" : "kg under proactive watch"}
            </p>
          </div>

          {/* Safe Stock (> 60 Days) */}
          <div className="rounded-xl border border-emerald-300/80 bg-emerald-50/80 dark:bg-emerald-950/40 p-4 space-y-1 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="size-4 text-emerald-600" />
                <span>{t("safeStock")}</span>
              </span>
              <span className="rounded-full bg-emerald-600 text-white font-mono font-bold text-xs px-2 py-0.5">
                {riskAnalytics.safeCount}
              </span>
            </div>
            <div className="text-2xl font-black font-mono text-emerald-900 dark:text-emerald-100 pt-1">
              {riskAnalytics.safeQty}
            </div>
            <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80">
              {lang === "ar" ? "كجم صلاحية مستقرة" : "kg safe inventory balance"}
            </p>
          </div>

          {/* Factory Safety Score */}
          <div className="col-span-2 sm:col-span-2 lg:col-span-1 rounded-xl border border-brand/30 bg-card p-4 space-y-2 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cocoa dark:text-cream flex items-center gap-1">
                <Percent className="size-4 text-brand" />
                <span>{t("factorySafetyScore")}</span>
              </span>
              <span className="text-xs font-mono text-muted-foreground">
                {riskAnalytics.safeCount}/{riskAnalytics.totalActiveBatches}
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black font-mono text-brand">
                {riskAnalytics.safetyScore}%
              </span>
              <span className="text-[10px] text-muted-foreground">
                {riskAnalytics.safetyScore >= 80 ? (lang === "ar" ? "ممتاز" : "Optimal") : (lang === "ar" ? "يحتاج تحسين" : "Needs Action")}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  riskAnalytics.safetyScore >= 80
                    ? "bg-emerald-500"
                    : riskAnalytics.safetyScore >= 60
                    ? "bg-amber-500"
                    : "bg-rose-500"
                }`}
                style={{ width: `${riskAnalytics.safetyScore}%` }}
              />
            </div>
          </div>
        </div>

        {/* Matrix Controls (Time Horizon Filter & Search) */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 p-3.5 rounded-xl border border-border/80 print:hidden">
          {/* Time Horizon Switcher */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <span className="text-xs font-bold text-foreground shrink-0 flex items-center gap-1 me-1">
              <Clock className="size-3.5 text-brand" />
              <span>{lang === "ar" ? "الأفق الزمني:" : "Horizon:"}</span>
            </span>
            {(
              [
                { key: "7", label: lang === "ar" ? "خلال 7 أيام" : "7 Days" },
                { key: "15", label: lang === "ar" ? "خلال 15 يوم" : "15 Days" },
                { key: "30", label: lang === "ar" ? "خلال 30 يوم" : "30 Days" },
                { key: "60", label: lang === "ar" ? "خلال 60 يوم" : "60 Days" },
                { key: "90", label: lang === "ar" ? "خلال 90 يوم" : "90 Days" },
                { key: "all", label: lang === "ar" ? "كل المخزون" : "All" },
              ] as const
            ).map((h) => (
              <button
                key={h.key}
                type="button"
                onClick={() => setHorizon(h.key)}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition-all shrink-0 ${
                  horizon === h.key
                    ? "bg-brand text-white shadow-xs"
                    : "bg-card border border-border/70 text-muted-foreground hover:bg-muted"
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder={lang === "ar" ? "بحث في قائمة الخامات المهددة..." : "Search matrix..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9 text-xs h-9 bg-background"
            />
          </div>
        </div>

        {/* Urgent Production Priority Matrix Table */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border/80 bg-gradient-to-r from-muted/60 to-muted/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Factory className="size-5 text-brand" />
              <h2 className="text-sm sm:text-base font-bold text-foreground">
                {t("urgentProductionMatrix")} ({matrixRows.length})
              </h2>
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              {lang === "ar" ? "مرتبة وفق الأولوية القصوى للتشغيل (FEFO)" : "Sorted by strict FEFO priority"}
            </span>
          </div>

          {matrixRows.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground space-y-2">
              <CheckCircle2 className="size-10 text-emerald-500/80 mx-auto" />
              <p className="font-bold text-sm">
                {lang === "ar"
                  ? "المخزون آمن! لا توجد خامات مهددة بالانتهاء ضمن هذا الأفق الزمني."
                  : "All inventory safe! No near-expiry materials found in this horizon."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 font-bold text-muted-foreground">
                    <th className="p-3">#</th>
                    <th className="p-3">{t("name")}</th>
                    <th className="p-3">{t("batchNumber")}</th>
                    <th className="p-3">{t("quantity")}</th>
                    <th className="p-3">{t("expiryDate")}</th>
                    <th className="p-3">{t("remaining")}</th>
                    <th className="p-3">{t("qcStatus")}</th>
                    <th className="p-3 text-brand">{t("suggestedLine")}</th>
                    <th className="p-3 print:hidden text-center">{t("actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {matrixRows.map((item, idx) => {
                    const days = daysUntil(item.expiry_date);
                    const suggestedLine = suggestProductionLine(item.name);
                    const isUltraUrgent = days <= 7;
                    const isHighUrgent = days > 7 && days <= 30;

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-muted/40 transition-colors ${
                          isUltraUrgent
                            ? "bg-rose-50/40 dark:bg-rose-950/20"
                            : isHighUrgent
                            ? "bg-amber-50/30 dark:bg-amber-950/10"
                            : ""
                        }`}
                      >
                        <td className="p-3 font-mono text-muted-foreground">{idx + 1}</td>
                        <td className="p-3 font-bold text-foreground">
                          <div className="flex items-center gap-1.5">
                            {isUltraUrgent && <Flame className="size-3.5 text-rose-600 shrink-0" />}
                            <span>{item.name}</span>
                          </div>
                          {item.item_code && (
                            <span className="text-[10px] text-muted-foreground block font-mono">
                              {item.item_code}
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono">
                          {item.batch_number ? (
                            <span className="rounded bg-brand/10 text-brand px-1.5 py-0.5 font-semibold">
                              #{item.batch_number}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-3 font-mono font-bold text-cocoa dark:text-cream">
                          {item.quantity} {item.unit || "كجم"}
                        </td>
                        <td className="p-3 font-mono">{item.expiry_date}</td>
                        <td className="p-3">
                          <span
                            className={`font-bold px-2 py-0.5 rounded-full text-[11px] ${
                              days < 0
                                ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
                                : days <= 7
                                ? "bg-rose-600 text-white animate-pulse"
                                : days <= 30
                                ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {countdownText(days, lang)}
                          </span>
                        </td>
                        <td className="p-3">
                          <QcBadge status={item.qc_status ?? "quarantine"} />
                        </td>
                        <td className="p-3">
                          <span className="rounded-md bg-brand/15 text-brand px-2.5 py-1 font-semibold text-[11px] border border-brand/20 inline-flex items-center gap-1">
                            <Factory className="size-3 text-brand shrink-0" />
                            <span>{suggestedLine}</span>
                          </span>
                        </td>
                        <td className="p-3 print:hidden text-center">
                          {canEditItems && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => setDispenseItem(item)}
                              className="bg-brand hover:bg-brand/90 text-white text-xs font-bold gap-1 h-7 px-2.5 shadow-xs"
                              title={t("quickDispense")}
                            >
                              <Factory className="size-3" />
                              <span>{t("quickDispense")}</span>
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Dispense Modal Integration */}
      <DispenseProductionDialog
        open={Boolean(dispenseItem)}
        onOpenChange={(open) => !open && setDispenseItem(null)}
        item={dispenseItem}
        allItems={allItems}
        onDispensed={() => {
          void queryClient.invalidateQueries({ queryKey: ["items"] });
          void queryClient.invalidateQueries({ queryKey: ["stock_movements"] });
        }}
        onSelectAnotherItem={(newItem) => setDispenseItem(newItem)}
      />

      <MobileBottomNav />
    </div>
  );
}
