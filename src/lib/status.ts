export type Status = "normal" | "early" | "medium" | "critical" | "expired";

export interface Thresholds {
  early: number;
  medium: number;
  critical: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { early: 90, medium: 60, critical: 30 };

/** Whole days between today (local) and the expiry date. Negative = past expiry. */
export function daysUntil(expiryDate: string, now: Date = new Date()): number {
  const [y, m, d] = expiryDate.split("-").map(Number);
  const expiry = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((expiry.getTime() - today.getTime()) / 86_400_000);
}

export function statusFor(days: number, t: Thresholds = DEFAULT_THRESHOLDS): Status {
  if (days < 0) return "expired";
  if (days <= t.critical) return "critical";
  if (days <= t.medium) return "medium";
  if (days <= t.early) return "early";
  return "normal";
}

export const STATUS_ORDER: Status[] = ["normal", "early", "medium", "critical", "expired"];

export const STATUS_VAR: Record<Status, string> = {
  normal: "var(--status-green)",
  early: "var(--status-yellow)",
  medium: "var(--status-orange)",
  critical: "var(--status-red)",
  expired: "var(--status-expired)",
};

export const STATUS_TINT: Record<Status, string> = {
  normal: "var(--status-green-tint)",
  early: "var(--status-yellow-tint)",
  medium: "var(--status-orange-tint)",
  critical: "var(--status-red-tint)",
  expired: "var(--status-expired-tint)",
};
