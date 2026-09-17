import { useI18n } from "@/lib/i18n";
import { STATUS_ORDER, STATUS_VAR, type Status, type Thresholds } from "@/lib/status";
import { STATUS_LABEL_KEY } from "@/components/StatusPill";

export function StatusLegend({
  thresholds,
  selectedStatus,
  onSelectStatus,
}: {
  thresholds: Thresholds;
  selectedStatus?: Status | "all" | "urgent";
  onSelectStatus?: (status: Status) => void;
}) {
  const { t, lang } = useI18n();

  const description: Record<string, string> = {
    normal: t("legendNormal", { n: thresholds.early }),
    early: t("legendEarly", { a: thresholds.early, b: thresholds.medium + 1 }),
    medium: t("legendEarly", { a: thresholds.medium, b: thresholds.critical + 1 }),
    critical: t("legendCritical", { n: thresholds.critical }),
    expired: t("legendExpired"),
  };

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-cocoa">{t("legend")}</h2>
        {selectedStatus && selectedStatus !== "all" && onSelectStatus && (
          <button
            type="button"
            onClick={() => onSelectStatus("all" as any)}
            className="text-xs text-brand hover:underline font-semibold"
          >
            {lang === "ar" ? "إلغاء التحديد" : "Clear filter"}
          </button>
        )}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {STATUS_ORDER.map((s) => {
          const isSelected = selectedStatus === s;
          return (
            <li key={s}>
              <button
                type="button"
                onClick={() => onSelectStatus?.(s)}
                className={`flex w-full items-center gap-2 text-sm text-start rounded-lg p-1.5 transition-all ${
                  isSelected
                    ? "bg-brand/15 ring-2 ring-brand/60 font-semibold shadow-xs"
                    : "hover:bg-muted/70 active:bg-muted"
                }`}
              >
                <span
                  className="size-3.5 shrink-0 rounded-full shadow-xs"
                  style={{ backgroundColor: STATUS_VAR[s] }}
                />
                <span className="font-medium text-foreground">{t(STATUS_LABEL_KEY[s])}</span>
                <span className="text-muted-foreground text-xs">— {description[s]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
