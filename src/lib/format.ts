import type { TranslateKey } from "./i18n";

type T = (key: TranslateKey, vars?: Record<string, string | number>) => string;

/** Human-readable countdown, e.g. "2 months and 5 days left (65 days)". */
export function countdownText(days: number, t: T): string {
  if (days < 0) return t("expiredAgo", { n: Math.abs(days) });
  if (days === 0) return t("todayExpires");
  const months = Math.floor(days / 30);
  const rest = days % 30;
  if (months === 0) return t("daysLeft", { n: days });
  return t("monthsDaysLeft", { m: months, d: rest, n: days });
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return value;
}
