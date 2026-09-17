import { dicts, type Lang, type TranslateKey } from "./i18n";

type T = (key: TranslateKey, vars?: Record<string, string | number>) => string;

/** Human-readable countdown, e.g. "2 months and 5 days left (65 days)". */
export function countdownText(days: number, tOrLang?: T | Lang | string): string {
  const isFunc = typeof tOrLang === "function";
  const lang: Lang = !isFunc && tOrLang === "en" ? "en" : "ar";

  const resolve = (key: TranslateKey, vars?: Record<string, string | number>): string => {
    if (isFunc) {
      return (tOrLang as T)(key, vars);
    }
    let template = dicts[lang]?.[key] ?? dicts.ar[key] ?? String(key);
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        template = template.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return template;
  };

  if (days < 0) return resolve("expiredAgo", { n: Math.abs(days) });
  if (days === 0) return resolve("todayExpires");
  const months = Math.floor(days / 30);
  const rest = days % 30;
  if (months === 0) return resolve("daysLeft", { n: days });
  if (rest === 0) return resolve("monthsOnlyLeft", { m: months, n: days });
  return resolve("monthsDaysLeft", { m: months, d: rest, n: days });
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return value;
}
