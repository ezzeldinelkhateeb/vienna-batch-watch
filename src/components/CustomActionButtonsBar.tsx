import { Link } from "@tanstack/react-router";
import {
  ExternalLink,
  Link as LinkIcon,
  FileText,
  Sparkles,
  Phone,
  Printer,
  Shield,
  Factory,
  Download,
  Share2,
  FolderOpen,
  PlusCircle,
  Settings,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useSettings, type CustomActionButton } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  link: LinkIcon,
  "external-link": ExternalLink,
  "file-text": FileText,
  sparkles: Sparkles,
  phone: Phone,
  printer: Printer,
  shield: Shield,
  factory: Factory,
  download: Download,
  share: Share2,
  folder: FolderOpen,
};

const COLOR_CLASSES: Record<string, string> = {
  brand: "bg-brand text-brand-foreground hover:bg-brand/90 border-transparent",
  emerald: "bg-emerald-600 text-white hover:bg-emerald-700 border-transparent",
  amber: "bg-amber-600 text-white hover:bg-amber-700 border-transparent",
  rose: "bg-rose-600 text-white hover:bg-rose-700 border-transparent",
  purple: "bg-purple-600 text-white hover:bg-purple-700 border-transparent",
  blue: "bg-blue-600 text-white hover:bg-blue-700 border-transparent",
  default: "bg-card text-foreground hover:bg-muted border-border/80",
};

export function CustomActionButtonsBar() {
  const { lang } = useI18n();
  const { isAdmin } = useAuth();
  const settings = useSettings();

  const buttons: CustomActionButton[] = (settings.data?.custom_buttons ?? [])
    .filter((b) => b.is_active !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (buttons.length === 0 && !isAdmin) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border/70 bg-card/60 p-3 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="flex size-2 rounded-full bg-brand animate-pulse" />
          <h3 className="text-xs font-bold text-cocoa">
            {lang === "ar" ? "أزرار وروابط المهام السريعة للفريق" : "Team Quick Action Buttons & Links"}
          </h3>
          {buttons.length > 0 && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground font-semibold">
              {buttons.length}
            </span>
          )}
        </div>

        {isAdmin && (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px] text-brand hover:bg-brand/10"
          >
            <Link to="/settings" search={{ tab: "admin_hub" } as any}>
              <Settings className="size-3" />
              <span>{lang === "ar" ? "تخصيص الأزرار والأقسام ⚙️" : "Manage Buttons ⚙️"}</span>
            </Link>
          </Button>
        )}
      </div>

      {buttons.length === 0 && isAdmin ? (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 rounded-lg border border-dashed border-border/90 bg-muted/30 p-3 text-center sm:text-start">
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-foreground">
              {lang === "ar"
                ? "لم يتم إضافة أزرار مخصصة للفريق حتى الآن"
                : "No custom action buttons configured yet"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {lang === "ar"
                ? "بصفتك مسؤولاً (Admin)، يمكنك إضافة أزرار مخصصة لروابط المستندات، تقارير الإنتاج، أو جروبات الواتساب لتسهيل عمل الفريق."
                : "As Admin, you can add custom buttons for documentation links, production logs, or WhatsApp groups."}
            </p>
          </div>
          <Button
            asChild
            size="sm"
            className="shrink-0 gap-1.5 bg-brand text-brand-foreground text-xs shadow-xs"
          >
            <Link to="/settings" search={{ tab: "admin_hub" } as any}>
              <PlusCircle className="size-3.5" />
              <span>{lang === "ar" ? "إضافة أزرار الآن" : "Add Buttons"}</span>
            </Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {buttons.map((btn) => {
            const Icon = (btn.icon && ICON_MAP[btn.icon]) || ExternalLink;
            const colorClass = COLOR_CLASSES[btn.color || "default"] || COLOR_CLASSES.default;
            const label = lang === "ar" ? btn.label_ar || btn.label_en : btn.label_en || btn.label_ar;
            const isExternal = btn.url.startsWith("http://") || btn.url.startsWith("https://");

            if (isExternal) {
              return (
                <a
                  key={btn.id}
                  href={btn.url}
                  target={btn.target || "_blank"}
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] ${colorClass}`}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span>{label}</span>
                </a>
              );
            }

            return (
              <Button
                key={btn.id}
                asChild
                size="sm"
                className={`h-8 gap-1.5 text-xs font-semibold shadow-xs ${colorClass}`}
              >
                <Link to={btn.url as any}>
                  <Icon className="size-3.5 shrink-0" />
                  <span>{label}</span>
                </Link>
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
