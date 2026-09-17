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

      {/* 2. Dedicated Total Warehouse Balance Card (في الأسفل بعرض كامل وبحساب دقيق) */}
      <div className="w-full rounded-2xl border border-amber-900/20 bg-gradient-to-br from-card via-card to-amber-50/50 dark:to-amber-950/20 p-4 sm:p-5 shadow-xs transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 sm:size-12 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand shadow-xs border border-brand/20">
              <Scale className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-cocoa">
                  {t("kpiTotalStockBalance")}
                </h3>
                <span className="rounded-md bg-brand/10 text-brand px-2 py-0.5 text-[10px] font-bold">
                  {lang === "ar" ? "ميزان الخامات الفعلي" : "Consolidated Weight"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {lang === "ar"
                  ? "الرصيد التراكمي الفعلي لجميع تشغيلات المواد الخام المسجلة بالمستودع"
                  : "Consolidated actual physical stock weight across all recorded raw materials"}
              </p>
            </div>
          </div>

          <div className="text-start sm:text-end bg-amber-500/10 sm:bg-transparent p-3 sm:p-0 rounded-xl border border-amber-500/20 sm:border-0">
            <div className="flex items-baseline gap-2 sm:justify-end flex-wrap">
              <span className="text-2xl sm:text-3xl font-black text-cocoa font-mono tracking-tight">
                {totalWeightKg.toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}
              </span>
              <span className="text-sm font-bold text-cocoa">
                {lang === "ar" ? "كجم" : "kg"}
              </span>
              <span className="text-sm sm:text-base font-bold text-muted-foreground font-mono">
                ({totalWeightTons.toLocaleString(lang === "ar" ? "ar-EG" : "en-US", { maximumFractionDigits: 2 })} {lang === "ar" ? "طن" : "tons"})
              </span>
            </div>
          </div>
        </div>

        {/* Breakdown sub-badges */}
        <div className="mt-3.5 pt-3 border-t border-border/70 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-900 dark:text-emerald-300 border border-emerald-500/20">
            <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
            <span>
              {lang === "ar"
                ? `${weightBatchesCount} تشغيلة برصيد وزني موثق`
                : `${weightBatchesCount} lots with verified weight`}
            </span>
          </span>

          {unrecordedBatchesCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground border border-border/60">
              <span className="shrink-0">⏳</span>
              <span>
                {lang === "ar"
                  ? `${unrecordedBatchesCount} تشغيلات قيد جرد وتحديد الأوزان`
                  : `${unrecordedBatchesCount} lots pending weight count`}
              </span>
            </span>
          )}

          {otherUnits.map((ou) => (
            <span
              key={ou.unit}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/10 px-2.5 py-1 text-[11px] font-bold text-blue-900 dark:text-blue-300 border border-blue-500/20"
            >
              <span className="shrink-0">📦</span>
              <span>
                {ou.quantity.toLocaleString(lang === "ar" ? "ar-EG" : "en-US")} {ou.unit}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
