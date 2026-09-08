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
