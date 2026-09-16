import { useI18n } from "@/lib/i18n";
import { Package, Layers, Scale, AlertOctagon, Boxes, CheckCircle2 } from "lucide-react";

interface InventoryKpiOverviewProps {
  uniqueMaterials: number;
  totalBatches: number;
  totalStockDisplay: string;
  criticalExpired: number;
  multiBatchCount: number;
  approvedReady: number;
  hasActiveFilters: boolean;
  isUrgentActive: boolean;
  isMultiBatchActive: boolean;
  isApprovedActive: boolean;
  onFilterReset: () => void;
  onFilterUrgent: () => void;
  onFilterMultiBatch: () => void;
  onFilterApproved: () => void;
}

export function InventoryKpiOverview({
  uniqueMaterials,
  totalBatches,
  totalStockDisplay,
  criticalExpired,
  multiBatchCount,
  approvedReady,
  hasActiveFilters,
  isUrgentActive,
  isMultiBatchActive,
  isApprovedActive,
  onFilterReset,
  onFilterUrgent,
  onFilterMultiBatch,
  onFilterApproved,
}: InventoryKpiOverviewProps) {
  const { t, lang } = useI18n();

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
      {/* 1. Unique Materials Card */}
      <button
        type="button"
        onClick={onFilterReset}
        className={`group relative flex flex-col justify-between rounded-xl border p-3 text-start transition-all duration-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 ${
          !hasActiveFilters
            ? "border-brand ring-2 ring-brand/40 bg-card"
            : "border-border/80 bg-card hover:border-brand/40"
        }`}
      >
        <div className="flex items-center justify-between gap-1 w-full">
          <span className="text-xs font-semibold text-muted-foreground truncate flex items-center gap-1.5">
            <Package className="size-3.5 text-brand" />
            <span>{t("kpiUniqueMaterials")}</span>
          </span>
          {!hasActiveFilters && <span className="size-1.5 rounded-full bg-brand animate-ping" />}
        </div>
        <div className="mt-1.5">
          <p className="text-2xl font-bold text-cocoa leading-tight">{uniqueMaterials}</p>
          <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
            {lang === "ar" ? "صنف مسجل" : "materials"}
          </p>
        </div>
      </button>

      {/* 2. Total Batches Card */}
      <button
        type="button"
        onClick={onFilterReset}
        className={`group relative flex flex-col justify-between rounded-xl border p-3 text-start transition-all duration-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 ${
          !hasActiveFilters
            ? "border-brand ring-2 ring-brand/40 bg-card"
            : "border-border/80 bg-card hover:border-brand/40"
        }`}
      >
        <div className="flex items-center justify-between gap-1 w-full">
          <span className="text-xs font-semibold text-muted-foreground truncate flex items-center gap-1.5">
            <Layers className="size-3.5 text-cocoa" />
            <span>{t("kpiTotalBatches")}</span>
          </span>
        </div>
        <div className="mt-1.5">
          <p className="text-2xl font-bold text-cocoa leading-tight">{totalBatches}</p>
          <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
            {lang === "ar" ? "تشغيلة بالمخزن" : "recorded lots"}
          </p>
        </div>
      </button>

      {/* 3. Total Stock Quantities Card */}
      <div className="relative flex flex-col justify-between rounded-xl border border-border/80 bg-muted/20 p-3 text-start shadow-xs">
        <div className="flex items-center justify-between gap-1 w-full">
          <span className="text-xs font-semibold text-muted-foreground truncate flex items-center gap-1.5">
            <Scale className="size-3.5 text-brand" />
            <span>{t("kpiTotalStock")}</span>
          </span>
        </div>
        <div className="mt-1.5 min-w-0">
          <p className="text-base font-bold text-cocoa leading-tight truncate" title={totalStockDisplay}>
            {totalStockDisplay}
          </p>
          <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
            {lang === "ar" ? "إجمالي الرصيد الفعلي" : "balance sum"}
          </p>
        </div>
      </div>

      {/* 4. Critical & Expired Urgent Batches Card */}
      <button
        type="button"
        onClick={onFilterUrgent}
        className={`group relative flex flex-col justify-between rounded-xl border p-3 text-start transition-all duration-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 ${
          isUrgentActive
            ? "border-red-600 ring-2 ring-red-500/40 bg-red-50 dark:bg-red-950/30"
            : criticalExpired > 0
              ? "border-red-300 bg-red-50/70 hover:border-red-400 dark:bg-red-950/20"
              : "border-border/80 bg-card hover:border-brand/40"
        }`}
      >
        <div className="flex items-center justify-between gap-1 w-full">
          <span className="text-xs font-semibold text-red-900 dark:text-red-300 truncate flex items-center gap-1.5">
            <AlertOctagon className="size-3.5 text-red-600" />
            <span>{t("kpiCriticalExpired")}</span>
          </span>
          {criticalExpired > 0 && (
            <span className="rounded-full bg-red-600 text-white text-[9px] px-1.5 py-0.2 font-bold animate-pulse">
              !
            </span>
          )}
        </div>
        <div className="mt-1.5">
          <p className="text-2xl font-bold text-red-950 dark:text-red-200 leading-tight">
            {criticalExpired}
          </p>
          <p className="text-[10px] text-red-800/80 dark:text-red-300/80 font-medium mt-0.5">
            {lang === "ar" ? "تتطلب إجراءً فورياً" : "need QA action"}
          </p>
        </div>
      </button>

      {/* 5. Multi-Batch Items Card */}
      <button
        type="button"
        onClick={onFilterMultiBatch}
        className={`group relative flex flex-col justify-between rounded-xl border p-3 text-start transition-all duration-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 ${
          isMultiBatchActive
            ? "border-purple-600 ring-2 ring-purple-500/40 bg-purple-50 dark:bg-purple-950/30"
            : multiBatchCount > 0
              ? "border-purple-200 bg-purple-50/40 hover:border-purple-300 dark:bg-purple-950/15"
              : "border-border/80 bg-card hover:border-brand/40"
        }`}
      >
        <div className="flex items-center justify-between gap-1 w-full">
          <span className="text-xs font-semibold text-purple-950 dark:text-purple-300 truncate flex items-center gap-1.5">
            <Boxes className="size-3.5 text-purple-600" />
            <span>{t("kpiMultiBatch")}</span>
          </span>
        </div>
        <div className="mt-1.5">
          <p className="text-2xl font-bold text-purple-950 dark:text-purple-200 leading-tight">
            {multiBatchCount}
          </p>
          <p className="text-[10px] text-purple-800/80 dark:text-purple-300/80 font-medium mt-0.5">
            {lang === "ar" ? "خامة لها عدة تشغيلات" : "materials >1 batch"}
          </p>
        </div>
      </button>

      {/* 6. Approved Ready for Production Card */}
      <button
        type="button"
        onClick={onFilterApproved}
        className={`group relative flex flex-col justify-between rounded-xl border p-3 text-start transition-all duration-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 ${
          isApprovedActive
            ? "border-emerald-600 ring-2 ring-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30"
            : "border-border/80 bg-card hover:border-emerald-400"
        }`}
      >
        <div className="flex items-center justify-between gap-1 w-full">
          <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-300 truncate flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-emerald-600" />
            <span>{t("kpiApprovedReady")}</span>
          </span>
        </div>
        <div className="mt-1.5">
          <p className="text-2xl font-bold text-emerald-950 dark:text-emerald-200 leading-tight">
            {approvedReady}
          </p>
          <p className="text-[10px] text-emerald-800/80 dark:text-emerald-300/80 font-medium mt-0.5">
            {lang === "ar" ? "مفرج عنها للتشغيل" : "ready for line"}
          </p>
        </div>
      </button>
    </div>
  );
}
