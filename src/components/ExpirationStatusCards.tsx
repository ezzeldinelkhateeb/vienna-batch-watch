import { useI18n } from "@/lib/i18n";
import { STATUS_ORDER, type Status, type Thresholds } from "@/lib/status";
import { STATUS_LABEL_KEY } from "@/components/StatusPill";
import { CheckCircle, AlertTriangle, AlertOctagon, Clock, XCircle, Layers } from "lucide-react";

interface ExpirationStatusCardsProps {
  counts: Record<Status, number>;
  totalCount: number;
  statusFilter: Status | "all";
  onSelectStatus: (status: Status | "all") => void;
  thresholds?: Thresholds;
}

interface StatusConfig {
  bgClass: string;
  activeBorderClass: string;
  defaultBorderClass: string;
  textClass: string;
  countClass: string;
  dotColor: string;
  icon: typeof CheckCircle;
  thresholdHint: (t?: Thresholds) => string;
}

const STATUS_CARD_CONFIG: Record<Status, StatusConfig> = {
  normal: {
    bgClass: "bg-emerald-50/90 dark:bg-emerald-950/25 hover:bg-emerald-100/80 dark:hover:bg-emerald-950/35",
    defaultBorderClass: "border-emerald-200/90 dark:border-emerald-800/40",
    activeBorderClass: "border-amber-500 ring-2 ring-amber-400/70 shadow-md",
    textClass: "text-emerald-900 dark:text-emerald-200",
    countClass: "text-emerald-950 dark:text-emerald-100",
    dotColor: "bg-emerald-500",
    icon: CheckCircle,
    thresholdHint: (t) => (t ? `> ${t.early} يوم` : ""),
  },
  early: {
    bgClass: "bg-amber-50/90 dark:bg-amber-950/25 hover:bg-amber-100/80 dark:hover:bg-amber-950/35",
    defaultBorderClass: "border-amber-200/90 dark:border-amber-800/40",
    activeBorderClass: "border-amber-500 ring-2 ring-amber-400/70 shadow-md",
    textClass: "text-amber-900 dark:text-amber-200",
    countClass: "text-amber-950 dark:text-amber-100",
    dotColor: "bg-amber-500",
    icon: Clock,
    thresholdHint: (t) => (t ? `${t.medium + 1} - ${t.early} يوم` : ""),
  },
  medium: {
    bgClass: "bg-orange-50/90 dark:bg-orange-950/25 hover:bg-orange-100/80 dark:hover:bg-orange-950/35",
    defaultBorderClass: "border-orange-200/90 dark:border-orange-800/40",
    activeBorderClass: "border-amber-500 ring-2 ring-amber-400/70 shadow-md",
    textClass: "text-orange-900 dark:text-orange-200",
    countClass: "text-orange-950 dark:text-orange-100",
    dotColor: "bg-orange-500",
    icon: AlertTriangle,
    thresholdHint: (t) => (t ? `${t.critical + 1} - ${t.medium} يوم` : ""),
  },
  critical: {
    bgClass: "bg-rose-50/90 dark:bg-rose-950/25 hover:bg-rose-100/80 dark:hover:bg-rose-950/35",
    defaultBorderClass: "border-rose-200/90 dark:border-rose-800/40",
    activeBorderClass: "border-amber-500 ring-2 ring-amber-400/70 shadow-md",
    textClass: "text-rose-900 dark:text-rose-200",
    countClass: "text-rose-950 dark:text-rose-100",
    dotColor: "bg-rose-500",
    icon: AlertOctagon,
    thresholdHint: (t) => (t ? `≤ ${t.critical} يوم` : ""),
  },
  expired: {
    bgClass: "bg-slate-100/90 dark:bg-slate-900/40 hover:bg-slate-200/70 dark:hover:bg-slate-900/60",
    defaultBorderClass: "border-slate-300/80 dark:border-slate-700/50",
    activeBorderClass: "border-amber-500 ring-2 ring-amber-400/70 shadow-md",
    textClass: "text-slate-800 dark:text-slate-200",
    countClass: "text-slate-950 dark:text-slate-100",
    dotColor: "bg-slate-500",
    icon: XCircle,
    thresholdHint: () => "منتهي",
  },
};

export function ExpirationStatusCards({
  counts,
  totalCount,
  statusFilter,
  onSelectStatus,
  thresholds,
}: ExpirationStatusCardsProps) {
  const { t, lang } = useI18n();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs sm:text-sm font-bold text-cocoa flex items-center gap-1.5">
          <Layers className="size-4 text-brand" />
          <span>{lang === "ar" ? "حالات وتصنيفات الصلاحية" : "Expiry Status Breakdown"}</span>
        </h2>
        {statusFilter !== "all" && (
          <button
            type="button"
            onClick={() => onSelectStatus("all")}
            className="text-xs text-brand font-semibold hover:underline"
          >
            {lang === "ar" ? "عرض جميع الحالات" : "Show All"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {STATUS_ORDER.map((status) => {
          const cfg = STATUS_CARD_CONFIG[status];
          const isSelected = statusFilter === status;
          const count = counts[status] ?? 0;
          const Icon = cfg.icon;
          const hint = cfg.thresholdHint(thresholds);

          return (
            <button
              key={status}
              type="button"
              onClick={() => onSelectStatus(isSelected ? "all" : status)}
              className={`group relative flex flex-col justify-between rounded-xl border p-3 text-start transition-all duration-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 ${
                cfg.bgClass
              } ${isSelected ? cfg.activeBorderClass : cfg.defaultBorderClass}`}
            >
              {/* Header: Label + Dot/Icon */}
              <div className="flex items-center justify-between gap-1 w-full">
                <span className={`text-xs font-bold truncate flex items-center gap-1.5 ${cfg.textClass}`}>
                  <span className={`size-2.5 rounded-full shrink-0 ${cfg.dotColor}`} />
                  <span>{t(STATUS_LABEL_KEY[status])}</span>
                </span>
                {isSelected ? (
                  <span className="rounded-full bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.2 shadow-xs">
                    {lang === "ar" ? "محدد" : "Active"}
                  </span>
                ) : (
                  <Icon className={`size-3.5 shrink-0 opacity-70 ${cfg.textClass}`} />
                )}
              </div>

              {/* Number and Subtext */}
              <div className="mt-2 flex items-baseline justify-between gap-1">
                <div>
                  <p className={`text-2xl sm:text-3xl font-extrabold leading-tight ${cfg.countClass}`}>
                    {count}
                  </p>
                  <p className={`text-[10px] font-medium mt-0.5 opacity-85 ${cfg.textClass}`}>
                    {lang === "ar" ? "تشغيلة مسجلة" : "lots recorded"}
                  </p>
                </div>
                {hint && (
                  <span className={`text-[10px] font-mono font-semibold opacity-75 dir-ltr self-end ${cfg.textClass}`}>
                    {hint}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
