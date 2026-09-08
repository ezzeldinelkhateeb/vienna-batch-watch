import { useI18n } from "@/lib/i18n";
import { STATUS_ORDER, STATUS_VAR, type Thresholds } from "@/lib/status";
import { STATUS_LABEL_KEY } from "@/components/StatusPill";

export function StatusLegend({ thresholds }: { thresholds: Thresholds }) {
  const { t } = useI18n();

  const description: Record<string, string> = {
    normal: t("legendNormal", { n: thresholds.early }),
    early: t("legendEarly", { a: thresholds.early, b: thresholds.medium + 1 }),
    medium: t("legendEarly", { a: thresholds.medium, b: thresholds.critical + 1 }),
    critical: t("legendCritical", { n: thresholds.critical }),
    expired: t("legendExpired"),
  };

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-cocoa">{t("legend")}</h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {STATUS_ORDER.map((s) => (
          <li key={s} className="flex items-center gap-2 text-sm">
            <span
              className="size-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: STATUS_VAR[s] }}
            />
            <span className="font-medium">{t(STATUS_LABEL_KEY[s])}</span>
            <span className="text-muted-foreground">— {description[s]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
