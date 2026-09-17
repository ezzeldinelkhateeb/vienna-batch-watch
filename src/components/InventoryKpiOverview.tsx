import { useI18n } from "@/lib/i18n";
import {
  Package,
  Layers,
  Scale,
  AlertOctagon,
  Boxes,
  CheckCircle2,
  FlaskConical,
} from "lucide-react";

export interface InventoryKpiOverviewProps {
  uniqueMaterials: number;
  totalBatches: number;
  criticalExpired: number;
  multiBatchCount: number;
  approvedReady: number;
  quarantineCount: number;
  totalWeightKg: number;
  totalWeightTons: number;
  weightBatchesCount: number;
  unrecordedBatchesCount: number;
  otherUnits?: { unit: string; quantity: number }[];
  hasActiveFilters: boolean;
  isUrgentActive: boolean;
  isMultiBatchActive: boolean;
  isApprovedActive: boolean;
  isQuarantineActive: boolean;
  onFilterReset: () => void;
  onFilterUrgent: () => void;
  onFilterMultiBatch: () => void;
  onFilterApproved: () => void;
  onFilterQuarantine: () => void;
}

export function InventoryKpiOverview({
  uniqueMaterials,
  totalBatches,
  criticalExpired,
  multiBatchCount,
  approvedReady,
  quarantineCount,
  totalWeightKg,
  totalWeightTons,
  weightBatchesCount,
  unrecordedBatchesCount,
  otherUnits = [],
  hasActiveFilters,
  isUrgentActive,
  isMultiBatchActive,
  isApprovedActive,
  isQuarantineActive,
  onFilterReset,
  onFilterUrgent,
  onFilterMultiBatch,
  onFilterApproved,
  onFilterQuarantine,
}: InventoryKpiOverviewProps) {
  const { t, lang } = useI18n();

  return (
    <div className="space-y-3">
      {/* 1. Main 6 Quality & Inventory KPI Cards Grid (2 cols on mobile, 3 cols on tablet, 6 cols on desktop) */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {/* Card 1: Unique Materials (أصناف الخامات) */}
        <button
          type="button"
          onClick={onFilterReset}
          className={`group relative flex flex-col justify-between rounded-xl border p-3 text-start transition-all duration-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 ${
            !hasActiveFilters
              ? "border-amber-500 ring-2 ring-amber-400/60 bg-amber-50/40 dark:bg-amber-950/20"
              : "border-border/80 bg-card hover:border-brand/40"
          }`}
        >
          <div className="flex items-center justify-between gap-1 w-full">
            <span className="text-xs font-bold text-cocoa truncate flex items-center gap-1.5">
              <Package className="size-3.5 text-brand shrink-0" />
              <span>{t("kpiUniqueMaterials")}</span>
            </span>
            {!hasActiveFilters && (
              <span className="size-1.5 rounded-full bg-brand animate-ping shrink-0" />
            )}
          </div>
          <div className="mt-2">
            <p className="text-2xl sm:text-3xl font-black text-cocoa leading-tight font-mono">
              {uniqueMaterials}
            </p>
            <p className="text-[10px] text-muted-foreground font-semibold mt-0.5">
              {lang === "ar" ? "صنف مسجل" : "materials recorded"}
            </p>
          </div>
        </button>

        {/* Card 2: Total Batches (إجمالي التشغيلات) */}
        <button
          type="button"
          onClick={onFilterReset}
          className={`group relative flex flex-col justify-between rounded-xl border p-3 text-start transition-all duration-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 ${
            !hasActiveFilters
              ? "border-border/90 bg-card"
              : "border-border/80 bg-card hover:border-brand/40"
          }`}
        >
          <div className="flex items-center justify-between gap-1 w-full">
            <span className="text-xs font-bold text-cocoa truncate flex items-center gap-1.5">
              <Layers className="size-3.5 text-cocoa shrink-0" />
              <span>{t("kpiTotalBatches")}</span>
            </span>
          </div>
          <div className="mt-2">
            <p className="text-2xl sm:text-3xl font-black text-cocoa leading-tight font-mono">
              {totalBatches}
            </p>
            <p className="text-[10px] text-muted-foreground font-semibold mt-0.5">
              {lang === "ar" ? "تشغيلة بالمخزن" : "recorded lots"}
            </p>
          </div>
        </button>

        {/* Card 3: Approved for Production (جاهز للصرف والتشغيل) */}
        <button
          type="button"
          onClick={onFilterApproved}
          className={`group relative flex flex-col justify-between rounded-xl border p-3 text-start transition-all duration-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 ${
            isApprovedActive
              ? "border-emerald-500 ring-2 ring-emerald-400/70 bg-emerald-50/80 dark:bg-emerald-950/40"
              : "border-emerald-200/80 dark:border-emerald-800/40 bg-emerald-50/40 dark:bg-emerald-950/20 hover:border-emerald-400"
          }`}
        >
          <div className="flex items-center justify-between gap-1 w-full">
            <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 truncate flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
              <span>{t("kpiApprovedReady")}</span>
            </span>
          </div>
          <div className="mt-2">
            <p className="text-2xl sm:text-3xl font-black text-emerald-950 dark:text-emerald-100 leading-tight font-mono">
              {approvedReady}
            </p>
            <p className="text-[10px] text-emerald-800/85 dark:text-emerald-300/85 font-semibold mt-0.5">
              {lang === "ar" ? "مفرج عنها للتشغيل" : "ready for line"}
            </p>
          </div>
        </button>

        {/* Card 4: Critical & Expired Urgent Batches (حرجة / منتهية الصلاحية) */}
        <button
          type="button"
          onClick={onFilterUrgent}
          className={`group relative flex flex-col justify-between rounded-xl border p-3 text-start transition-all duration-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 ${
            isUrgentActive
              ? "border-rose-600 ring-2 ring-rose-500/70 bg-rose-50/90 dark:bg-rose-950/40"
              : criticalExpired > 0
                ? "border-rose-300/90 bg-rose-50/60 dark:bg-rose-950/25 hover:border-rose-400"
                : "border-border/80 bg-card hover:border-rose-400"
          }`}
        >
          <div className="flex items-center justify-between gap-1 w-full">
            <span className="text-xs font-bold text-rose-900 dark:text-rose-300 truncate flex items-center gap-1.5">
              <AlertOctagon className="size-3.5 text-rose-600 shrink-0" />
              <span>{t("kpiCriticalExpired")}</span>
            </span>
            {criticalExpired > 0 && (
              <span className="rounded-full bg-rose-600 text-white text-[9px] px-1.5 py-0.2 font-bold animate-pulse">
                !
              </span>
            )}
          </div>
          <div className="mt-2">
            <p className="text-2xl sm:text-3xl font-black text-rose-950 dark:text-rose-100 leading-tight font-mono">
              {criticalExpired}
            </p>
            <p className="text-[10px] text-rose-800/85 dark:text-rose-300/85 font-semibold mt-0.5">
              {lang === "ar" ? "تتطلب إجراءً فورياً" : "need QA action"}
            </p>
          </div>
        </button>

        {/* Card 5: Multi-Batch Materials (خامات متعددة التشغيلات) */}
        <button
          type="button"
          onClick={onFilterMultiBatch}
          className={`group relative flex flex-col justify-between rounded-xl border p-3 text-start transition-all duration-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 ${
            isMultiBatchActive
              ? "border-purple-600 ring-2 ring-purple-400/70 bg-purple-50/80 dark:bg-purple-950/40"
              : multiBatchCount > 0
                ? "border-purple-200/80 bg-purple-50/40 dark:bg-purple-950/20 hover:border-purple-300"
                : "border-border/80 bg-card hover:border-purple-300"
          }`}
        >
          <div className="flex items-center justify-between gap-1 w-full">
            <span className="text-xs font-bold text-purple-950 dark:text-purple-300 truncate flex items-center gap-1.5">
              <Boxes className="size-3.5 text-purple-600 shrink-0" />
              <span>{t("kpiMultiBatch")}</span>
            </span>
          </div>
          <div className="mt-2">
            <p className="text-2xl sm:text-3xl font-black text-purple-950 dark:text-purple-100 leading-tight font-mono">
              {multiBatchCount}
            </p>
            <p className="text-[10px] text-purple-800/85 dark:text-purple-300/85 font-semibold mt-0.5">
              {lang === "ar" ? "خامة لها عدة تشغيلات" : "materials >1 batch"}
            </p>
          </div>
        </button>

        {/* Card 6: Quarantine & Under Inspection (قيد الفحص والاعتماد) */}
        <button
          type="button"
          onClick={onFilterQuarantine}
          className={`group relative flex flex-col justify-between rounded-xl border p-3 text-start transition-all duration-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 ${
            isQuarantineActive
              ? "border-amber-600 ring-2 ring-amber-400/70 bg-amber-50/80 dark:bg-amber-950/40"
              : quarantineCount > 0
                ? "border-amber-200/80 bg-amber-50/40 dark:bg-amber-950/20 hover:border-amber-400"
                : "border-border/80 bg-card hover:border-amber-400"
          }`}
        >
          <div className="flex items-center justify-between gap-1 w-full">
            <span className="text-xs font-bold text-amber-950 dark:text-amber-300 truncate flex items-center gap-1.5">
              <FlaskConical className="size-3.5 text-amber-600 shrink-0" />
              <span>{t("kpiQuarantine")}</span>
            </span>
          </div>
          <div className="mt-2">
            <p className="text-2xl sm:text-3xl font-black text-amber-950 dark:text-amber-100 leading-tight font-mono">
              {quarantineCount}
            </p>
            <p className="text-[10px] text-amber-800/85 dark:text-amber-300/85 font-semibold mt-0.5">
              {lang === "ar" ? "قيد المراجعة المخبرية" : "under inspection"}
            </p>
          </div>
        </button>
      </div>

      {/* 2. Compact Warehouse Stock Balance Bar (شريط رصيد المخزن المصغر) */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-amber-900/15 bg-card/90 px-3.5 py-2 shadow-2xs">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <Scale className="size-3.5" />
          </div>
          <div className="flex items-baseline gap-1.5 truncate">
            <span className="text-xs font-bold text-foreground">
              {lang === "ar" ? "رصيد المخزن الفعلي:" : "Stock Balance:"}
            </span>
            <span className="text-sm font-black text-cocoa font-mono">
              {totalWeightKg.toLocaleString("en-US")}
            </span>
            <span className="text-xs font-bold text-cocoa">
              {lang === "ar" ? "كجم" : "kg"}
            </span>
            <span className="text-[11px] font-semibold text-muted-foreground font-mono">
              ({totalWeightTons.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 0 })} {lang === "ar" ? "طن" : "tons"})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 ms-auto text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 font-bold text-emerald-800 dark:text-emerald-300 font-mono">
            <CheckCircle2 className="size-3 text-emerald-600 shrink-0" />
            <span>
              {weightBatchesCount} {lang === "ar" ? "تشغيلة موثقة" : "verified lots"}
            </span>
          </span>

          {unrecordedBatchesCount > 0 && (
            <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground font-semibold font-mono">
              {unrecordedBatchesCount} {lang === "ar" ? "قيد الجرد" : "pending"}
            </span>
          )}

          {otherUnits.map((ou) => (
            <span
              key={ou.unit}
              className="rounded-md bg-blue-500/10 px-2 py-0.5 text-blue-800 dark:text-blue-300 font-semibold font-mono"
            >
              {ou.quantity.toLocaleString("en-US")} {ou.unit}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
