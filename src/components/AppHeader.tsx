import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, LogOut, Package, Settings as SettingsIcon, Languages, ClipboardCheck, ShieldAlert, Menu } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/hooks/use-settings";
import { useNavigationDrawer } from "@/hooks/use-navigation-drawer";
import { AppNavigationDrawer } from "@/components/AppNavigationDrawer";
import { Button } from "@/components/ui/button";

export function AppHeader({ showNav = true }: { showNav?: boolean }) {
  const { t, toggle, lang } = useI18n();
  const navigate = useNavigate();
  const settings = useSettings();
  const { openDrawer } = useNavigationDrawer();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const urgentCountQuery = useQuery({
    queryKey: ["urgent-badge-count"],
    enabled: showNav,
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

  const brandName = settings.data?.factory_name || "Vienna";
  const brandTagline = settings.data?.system_tagline || t("brandTagline");
  const brandLogo = settings.data?.app_logo_url;
  const brandIcon = settings.data?.app_icon || "🏭";
  const enableAudit = settings.data?.feature_flags.enable_monthly_audit !== false;
  const enableWaste = settings.data?.feature_flags.enable_waste_prevention !== false;

  return (
    <header className="brand-header">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          {brandLogo ? (
            <img
              src={brandLogo}
              alt={brandName}
              className="h-12 sm:h-14 w-auto max-w-[150px] sm:max-w-[190px] object-contain rounded-xl bg-white/15 p-1 border border-white/20 shadow-xs"
            />
          ) : (
            <div className="flex size-11 sm:size-13 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-2xl sm:text-3xl border border-white/20 shadow-xs group-hover:scale-105 transition-transform">
              <span>{brandIcon}</span>
            </div>
          )}
          <div>
            <span className="brand-script block text-[36px] sm:text-[42px] leading-none">{brandName}</span>
            <span className="brand-tagline block mt-1">{brandTagline}</span>
            <span className="mt-0.5 block text-[12px] text-cream/75">{t("systemSubtitle")}</span>
          </div>
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2 ms-auto">
          {showNav && (
            <>
              {/* Desktop Nav Items */}
              <div className="hidden md:flex items-center gap-1">
                <Button asChild variant="ghost" size="sm" className="text-cream hover:bg-white/10 text-xs font-semibold">
                  <Link to="/">
                    <Package className="size-4" />
                    <span>{t("inventory")}</span>
                  </Link>
                </Button>

                {enableAudit && (
                  <Button asChild variant="ghost" size="sm" className="text-cream hover:bg-white/10 text-xs font-semibold">
                    <Link to="/monthly-audit">
                      <ClipboardCheck className="size-4" />
                      <span>{lang === "ar" ? "الجرد الشهري" : "Monthly Audit"}</span>
                    </Link>
                  </Button>
                )}

                {enableWaste && (
                  <Button asChild variant="ghost" size="sm" className="text-cream hover:bg-white/10 text-xs font-semibold">
                    <Link to="/waste-prevention">
                      <ShieldAlert className="size-4 text-amber-300" />
                      <span>{lang === "ar" ? "منع الهالك" : "Waste Prevention"}</span>
                    </Link>
                  </Button>
                )}

                <Button asChild variant="ghost" size="sm" className="text-cream hover:bg-white/10 text-xs font-semibold">
                  <Link to="/notifications" className="relative">
                    <div className="relative inline-flex items-center">
                      <Bell className="size-4" />
                      {urgentCount > 0 && (
                        <span className="absolute -top-1.5 -end-2 flex min-w-4 h-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white shadow-sm ring-1 ring-cocoa">
                          {urgentCount > 99 ? "99+" : urgentCount}
                        </span>
                      )}
                    </div>
                    <span>{t("notificationsLog")}</span>
                  </Link>
                </Button>

                <Button asChild variant="ghost" size="sm" className="text-cream hover:bg-white/10 text-xs font-semibold">
                  <Link to="/settings">
                    <SettingsIcon className="size-4" />
                    <span>{t("settings")}</span>
                  </Link>
                </Button>

                {/* Desktop More / Drawer Button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={openDrawer}
                  className="text-cream hover:bg-white/15 text-xs font-semibold gap-1.5 px-2.5"
                  title={lang === "ar" ? "كافة الأقسام وأدوات الجودة" : "All Tools & Reports"}
                >
                  <Menu className="size-4" />
                  <span>{lang === "ar" ? "المزيد" : "More"}</span>
                </Button>
              </div>

              {/* Mobile 3-line Hamburger Menu Button */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={openDrawer}
                className="flex md:hidden text-cream hover:bg-white/20 bg-white/10 border border-white/20 text-xs font-bold gap-1.5 px-2.5 shadow-xs"
                title={lang === "ar" ? "قائمة أقسام الموقع" : "All Sections Menu"}
              >
                <Menu className="size-5 stroke-[2.5]" />
                <span>{lang === "ar" ? "القائمة" : "Menu"}</span>
              </Button>
            </>
          )}

          {/* Language Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            className="text-cream hover:bg-white/10 text-xs sm:text-sm font-medium px-2 sm:px-3"
          >
            <Languages className="size-4" />
            <span className="hidden sm:inline">{t("language")}</span>
          </Button>

          {/* Sign Out (Desktop & General) */}
          {showNav && (
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="text-cream/90 hover:bg-white/10 hover:text-white text-xs sm:text-sm"
              title={t("signOut")}
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">{t("signOut")}</span>
            </Button>
          )}
        </div>
      </div>
      <AppNavigationDrawer />
    </header>
  );
}
