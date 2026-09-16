import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, LogOut, Package, Settings as SettingsIcon, Languages, ClipboardCheck, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";

export function AppHeader({ showNav = true }: { showNav?: boolean }) {
  const { t, toggle, lang } = useI18n();
  const navigate = useNavigate();
  const settings = useSettings();

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
  const enableAudit = settings.data?.feature_flags.enable_monthly_audit !== false;
  const enableWaste = settings.data?.feature_flags.enable_waste_prevention !== false;

  return (
    <header className="brand-header">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between">
        <Link to="/" className="block">
          <span className="brand-script block text-[40px] sm:text-[44px]">{brandName}</span>
          <span className="brand-tagline block">{brandTagline}</span>
          <span className="mt-1 block text-[13px] text-cream/75">{t("systemSubtitle")}</span>
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2 ms-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            className="text-cream hover:bg-white/10 text-xs sm:text-sm font-medium"
          >
            <Languages className="size-4" />
            <span>{t("language")}</span>
          </Button>

          {showNav && (
            <>
              {/* Desktop Nav Items */}
              <div className="hidden md:flex items-center gap-1">
                <Button asChild variant="ghost" size="sm" className="text-cream hover:bg-white/10">
                  <Link to="/">
                    <Package className="size-4" />
                    <span>{t("inventory")}</span>
                  </Link>
                </Button>

                {enableAudit && (
                  <Button asChild variant="ghost" size="sm" className="text-cream hover:bg-white/10">
                    <Link to="/monthly-audit">
                      <ClipboardCheck className="size-4" />
                      <span>{lang === "ar" ? "الجرد الشهري" : "Monthly Audit"}</span>
                    </Link>
                  </Button>
                )}

                {enableWaste && (
                  <Button asChild variant="ghost" size="sm" className="text-cream hover:bg-white/10">
                    <Link to="/waste-prevention">
                      <ShieldAlert className="size-4 text-amber-300" />
                      <span>{lang === "ar" ? "منع الهالك" : "Waste Prevention"}</span>
                    </Link>
                  </Button>
                )}
                <Button asChild variant="ghost" size="sm" className="text-cream hover:bg-white/10">
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
                <Button asChild variant="ghost" size="sm" className="text-cream hover:bg-white/10">
                  <Link to="/settings">
                    <SettingsIcon className="size-4" />
                    <span>{t("settings")}</span>
                  </Link>
                </Button>
              </div>

              {/* Sign Out */}
              <Button
                variant="ghost"
                size="sm"
                onClick={signOut}
                className="text-cream/90 hover:bg-white/10 hover:text-white"
                title={t("signOut")}
              >
                <LogOut className="size-4" />
                <span className="hidden sm:inline">{t("signOut")}</span>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
