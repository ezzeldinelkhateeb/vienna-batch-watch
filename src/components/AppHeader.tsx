import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, LogOut, Package, Settings as SettingsIcon, Languages } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function AppHeader({ showNav = true }: { showNav?: boolean }) {
  const { t, toggle } = useI18n();
  const navigate = useNavigate();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <header className="brand-header">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between">
        <Link to="/" className="block">
          <span className="brand-script block text-[40px] sm:text-[44px]">Vienna</span>
          <span className="brand-tagline block">{t("brandTagline")}</span>
          <span className="mt-1 block text-[13px] text-cream/75">{t("systemSubtitle")}</span>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={toggle} className="text-cream hover:bg-white/10">
            <Languages className="size-4" />
            {t("language")}
          </Button>

          {showNav && (
            <>
              <Button asChild variant="ghost" size="sm" className="text-cream hover:bg-white/10">
                <Link to="/">
                  <Package className="size-4" />
                  <span className="hidden sm:inline">{t("inventory")}</span>
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="text-cream hover:bg-white/10">
                <Link to="/notifications">
                  <Bell className="size-4" />
                  <span className="hidden sm:inline">{t("notificationsLog")}</span>
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="text-cream hover:bg-white/10">
                <Link to="/settings">
                  <SettingsIcon className="size-4" />
                  <span className="hidden sm:inline">{t("settings")}</span>
                </Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={signOut} className="text-cream hover:bg-white/10">
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
