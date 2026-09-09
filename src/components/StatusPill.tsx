import { useI18n, type TranslateKey } from "@/lib/i18n";
import { STATUS_VAR, type Status } from "@/lib/status";

export const STATUS_LABEL_KEY: Record<Status, TranslateKey> = {
  normal: "statusNormal",
  early: "statusEarly",
  medium: "statusMedium",
  critical: "statusCritical",
  expired: "statusExpired",
};

export function StatusPill({ status }: { status: Status }) {
  const { t } = useI18n();
  return (
    <span className="status-pill" style={{ backgroundColor: STATUS_VAR[status] }}>
      {t(STATUS_LABEL_KEY[status])}
    </span>
  );
}

export type QcStatusType = "quarantine" | "approved" | "rejected" | "conditional";

export const QC_CONFIG: Record<
  QcStatusType,
  { labelKey: TranslateKey; className: string; icon: string }
> = {
  quarantine: {
    labelKey: "quarantine",
    className:
      "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
    icon: "🔒",
  },
  approved: {
    labelKey: "approved",
    className:
      "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
    icon: "✅",
  },
  rejected: {
    labelKey: "rejected",
    className:
      "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800",
    icon: "❌",
  },
  conditional: {
    labelKey: "conditional",
    className:
      "bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800",
    icon: "⚠️",
  },
};

export function QcBadge({ status }: { status?: QcStatusType | null | undefined }) {
  const { t } = useI18n();
  const current = status ?? "quarantine";
  const cfg = QC_CONFIG[current] ?? QC_CONFIG.quarantine;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}
    >
      <span>{cfg.icon}</span>
      <span>{t(cfg.labelKey)}</span>
    </span>
  );
}

export function FefoBadge() {
  const { t } = useI18n();
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-amber-400/80 bg-gradient-to-r from-amber-500/20 via-yellow-400/20 to-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-950 dark:text-amber-200 shadow-xs ring-1 ring-amber-400/40"
      title={t("fefoExplanation")}
    >
      <span>⭐</span>
      <span>{t("fefoPriorityOne")}</span>
    </span>
  );
}

