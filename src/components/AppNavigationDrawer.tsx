import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Package,
  ClipboardCheck,
  ShieldAlert,
  Bell,
  Settings,
  Plus,
  QrCode,
  Printer,
  Download,
  LogOut,
  Languages,
  Building2,
  Database,
  ShieldCheck,
  Layers,
  ChevronLeft,
  ChevronRight,
  User,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { useNavigationDrawer } from "@/hooks/use-navigation-drawer";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export function AppNavigationDrawer() {
  const { t, lang, toggle } = useI18n();
  const { user, isAdmin } = useAuth();
  const settings = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const { isOpen, closeDrawer } = useNavigationDrawer();

  const brandName = settings.data?.factory_name || "Vienna";
  const brandTagline = settings.data?.system_tagline || t("brandTagline");
  const brandLogo = settings.data?.app_logo_url;
  const brandIcon = settings.data?.app_icon || "🏭";

  const enableAudit = settings.data?.feature_flags.enable_monthly_audit !== false;
  const enableWaste = settings.data?.feature_flags.enable_waste_prevention !== false;
  const enableScanner = settings.data?.feature_flags.enable_barcode_scanner !== false;

  const urgentCountQuery = useQuery({
    queryKey: ["urgent-badge-count"],
    queryFn: async () => {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 30);
      const limitStr = targetDate.toISOString().slice(0, 10);

      const { count, error } = await supabase
        .from("items")
        .select("*", { count: "exact", head: true })
        .lte("expiry_date", limitStr);

      if (error) return 0;
      return count ?? 0;
    },
    staleTime: 30 * 1000,
  });

  const urgentCount = urgentCountQuery.data ?? 0;

  const handleAction = (action: string) => {
    closeDrawer();
    if (pathname === "/" || pathname === "/inventory") {
      window.dispatchEvent(new CustomEvent("vienna:action", { detail: action }));
    } else {
      navigate({ to: "/", search: { action } as any });
    }
  };

  const signOut = async () => {
    closeDrawer();
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const isCurrent = (path: string) => {
    if (path === "/" && (pathname === "/" || pathname === "/inventory")) return true;
    return pathname === path;
  };

  const isRtl = lang === "ar";
  const ArrowIcon = isRtl ? ChevronLeft : ChevronRight;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeDrawer()}>
      <SheetContent
        side={isRtl ? "right" : "left"}
        className="w-[85vw] sm:w-[380px] p-0 flex flex-col bg-card border-border/80 text-foreground overflow-hidden"
      >
        {/* Drawer Header with Factory Branding */}
        <SheetHeader className="p-4 sm:p-5 brand-header text-start shrink-0 border-b border-white/10">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {brandLogo ? (
                <img
                  src={brandLogo}
                  alt={brandName}
                  className="h-11 w-auto max-w-[130px] object-contain rounded-lg bg-white/15 p-1 border border-white/20 shadow-xs"
                />
              ) : (
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-2xl border border-white/20 shadow-xs">
                  <span>{brandIcon}</span>
                </div>
              )}
              <div className="min-w-0">
                <SheetTitle className="brand-script text-2xl sm:text-3xl text-cream truncate leading-none">
                  {brandName}
                </SheetTitle>
                <p className="brand-tagline text-[11px] text-cream/90 truncate mt-0.5">{brandTagline}</p>
              </div>
            </div>
          </div>

          {/* User Badge */}
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-white/10 px-3 py-1.5 border border-white/15 text-xs text-cream/90">
            <div className="flex items-center gap-2 truncate">
              <User className="size-3.5 shrink-0 opacity-80" />
              <span className="truncate font-mono text-[11px]">
                {user?.email || (lang === "ar" ? "مهندس الجودة" : "Quality Engineer")}
              </span>
            </div>
            <span className="shrink-0 rounded-full bg-cream/20 px-2 py-0.5 text-[10px] font-bold text-cream">
              {isAdmin ? (lang === "ar" ? "مسؤول النظام" : "Admin") : (lang === "ar" ? "فني جودة" : "QC Staff")}
            </span>
          </div>
        </SheetHeader>

        {/* Scrollable Navigation List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
          {/* Section 1: Core Operations */}
          <div className="space-y-1">
            <p className="px-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              {lang === "ar" ? "العمليات والمخزون" : "Core Operations"}
            </p>

            <Link
              to="/"
              onClick={closeDrawer}
              className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
                isCurrent("/")
                  ? "bg-brand text-brand-foreground shadow-sm"
                  : "hover:bg-muted text-foreground"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`size-8 rounded-lg flex items-center justify-center ${
                    isCurrent("/") ? "bg-white/20 text-white" : "bg-brand/10 text-brand"
                  }`}
                >
                  <Package className="size-4" />
                </div>
                <span>{lang === "ar" ? "لوحة الجودة والمخزون" : "Inventory Hub"}</span>
              </div>
              <ArrowIcon className="size-4 opacity-60" />
            </Link>

            {enableAudit && (
              <Link
                to="/monthly-audit"
                onClick={closeDrawer}
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
                  isCurrent("/monthly-audit")
                    ? "bg-brand text-brand-foreground shadow-sm"
                    : "hover:bg-muted text-foreground"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`size-8 rounded-lg flex items-center justify-center ${
                      isCurrent("/monthly-audit") ? "bg-white/20 text-white" : "bg-blue-500/10 text-blue-600"
                    }`}
                  >
                    <ClipboardCheck className="size-4" />
                  </div>
                  <span>{lang === "ar" ? "الجرد الدوري والتسويات" : "Monthly Stock Audit"}</span>
                </div>
                <ArrowIcon className="size-4 opacity-60" />
              </Link>
            )}

            {enableWaste && (
              <Link
                to="/waste-prevention"
                onClick={closeDrawer}
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
                  isCurrent("/waste-prevention")
                    ? "bg-brand text-brand-foreground shadow-sm"
                    : "hover:bg-muted text-foreground"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`size-8 rounded-lg flex items-center justify-center ${
                      isCurrent("/waste-prevention") ? "bg-white/20 text-white" : "bg-amber-500/10 text-amber-600"
                    }`}
                  >
                    <ShieldAlert className="size-4" />
                  </div>
                  <span>{lang === "ar" ? "منع الهالك والصرف العاجل" : "Waste Prevention Hub"}</span>
                </div>
                <ArrowIcon className="size-4 opacity-60" />
              </Link>
            )}

            <button
              type="button"
              onClick={() => handleAction("add-item")}
              className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold hover:bg-muted text-foreground transition-all text-start"
            >
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-600">
                  <Plus className="size-4 stroke-[2.5]" />
                </div>
                <span>{lang === "ar" ? "إضافة تشغيلة / مادة جديدة" : "Add New Batch"}</span>
              </div>
              <span className="text-[10px] rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5">
                {lang === "ar" ? "جديد +" : "New"}
              </span>
            </button>

            {enableScanner && (
              <button
                type="button"
                onClick={() => handleAction("scan")}
                className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold hover:bg-muted text-foreground transition-all text-start"
              >
                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-lg flex items-center justify-center bg-purple-500/10 text-purple-600">
                    <QrCode className="size-4" />
                  </div>
                  <span>{lang === "ar" ? "فحص الباركود بالكاميرا" : "Camera Barcode Scanner"}</span>
                </div>
                <ArrowIcon className="size-4 opacity-60" />
              </button>
            )}
          </div>

          {/* Section 2: QC Reports & Actions */}
          <div className="space-y-1 pt-2 border-t border-border/70">
            <p className="px-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              {lang === "ar" ? "تقارير وأدوات الجودة" : "QC Reports & Tools"}
            </p>

            <button
              type="button"
              onClick={() => handleAction("print-report")}
              className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold hover:bg-muted text-foreground transition-all text-start"
            >
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-lg flex items-center justify-center bg-brand/10 text-brand">
                  <Printer className="size-4" />
                </div>
                <span>{lang === "ar" ? "تقرير فحص واعتماد الجودة (A4)" : "QC Inspection Report (A4)"}</span>
              </div>
              <ArrowIcon className="size-4 opacity-60" />
            </button>

            <button
              type="button"
              onClick={() => handleAction("export-csv")}
              className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold hover:bg-muted text-foreground transition-all text-start"
            >
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-lg flex items-center justify-center bg-teal-500/10 text-teal-600">
                  <Download className="size-4" />
                </div>
                <span>{lang === "ar" ? "تصدير شيت المخزون (Excel/CSV)" : "Export Stock Sheet (CSV)"}</span>
              </div>
              <ArrowIcon className="size-4 opacity-60" />
            </button>

            <Link
              to="/notifications"
              onClick={closeDrawer}
              className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
                isCurrent("/notifications")
                  ? "bg-brand text-brand-foreground shadow-sm"
                  : "hover:bg-muted text-foreground"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`size-8 rounded-lg flex items-center justify-center ${
                    isCurrent("/notifications") ? "bg-white/20 text-white" : "bg-red-500/10 text-red-600"
                  }`}
                >
                  <Bell className="size-4" />
                </div>
                <span>{lang === "ar" ? "سجل التنبيهات والإشعارات" : "Alerts & Notifications"}</span>
              </div>
              {urgentCount > 0 && (
                <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                  {urgentCount}
                </span>
              )}
            </Link>
          </div>

          {/* Section 3: System & Administration */}
          <div className="space-y-1 pt-2 border-t border-border/70">
            <p className="px-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              {lang === "ar" ? "النظام والإدارة" : "System & Settings"}
            </p>

            <Link
              to="/settings"
              onClick={closeDrawer}
              className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
                isCurrent("/settings")
                  ? "bg-brand text-brand-foreground shadow-sm"
                  : "hover:bg-muted text-foreground"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`size-8 rounded-lg flex items-center justify-center ${
                    isCurrent("/settings") ? "bg-white/20 text-white" : "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  <Settings className="size-4" />
                </div>
                <span>{lang === "ar" ? "الإعدادات ولوحة المسؤول" : "Settings & Admin Hub"}</span>
              </div>
              <ArrowIcon className="size-4 opacity-60" />
            </Link>

            {isAdmin && (
              <button
                type="button"
                onClick={() => handleAction("backup")}
                className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold hover:bg-muted text-foreground transition-all text-start"
              >
                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-lg flex items-center justify-center bg-indigo-500/10 text-indigo-600">
                    <Database className="size-4" />
                  </div>
                  <span>{lang === "ar" ? "النسخ الاحتياطي واستعادة البيانات" : "Backup & Restore"}</span>
                </div>
                <ArrowIcon className="size-4 opacity-60" />
              </button>
            )}

            <button
              type="button"
              onClick={toggle}
              className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold hover:bg-muted text-foreground transition-all text-start"
            >
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-lg flex items-center justify-center bg-amber-500/10 text-amber-600">
                  <Languages className="size-4" />
                </div>
                <span>{t("language")}</span>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground font-bold">
                {lang === "ar" ? "English" : "العربية"}
              </span>
            </button>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-3 sm:p-4 border-t border-border/80 bg-muted/30 shrink-0 space-y-2">
          <Button
            type="button"
            variant="ghost"
            onClick={signOut}
            className="w-full justify-start gap-2.5 text-destructive hover:bg-destructive/10 text-xs sm:text-sm font-semibold"
          >
            <LogOut className="size-4" />
            <span>{t("signOut")}</span>
          </Button>

          <div className="text-center pt-1">
            <p className="text-[10px] text-muted-foreground font-mono flex items-center justify-center gap-1">
              <ShieldCheck className="size-3 text-emerald-600" />
              <span>{lang === "ar" ? "معايير سلامة الغذاء HACCP / ISO 22000" : "HACCP & ISO 22000 Compliant"}</span>
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
