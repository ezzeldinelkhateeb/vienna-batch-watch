import { Link, useLocation } from "@tanstack/react-router";
import { Package, Bell, Plus, QrCode, Menu } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useNavigationDrawer } from "@/hooks/use-navigation-drawer";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface MobileBottomNavProps {
  onAddItem?: () => void;
  onScan?: () => void;
}

export function MobileBottomNav({ onAddItem, onScan }: MobileBottomNavProps) {
  const { t, lang } = useI18n();
  const location = useLocation();
  const pathname = location.pathname;
  const { openDrawer } = useNavigationDrawer();

  const isInventory = pathname === "/" || pathname === "/inventory";
  const isNotifications = pathname === "/notifications";

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

  const handleScanClick = () => {
    navigator.vibrate?.(15);
    if (onScan) {
      onScan();
    } else {
      window.dispatchEvent(new CustomEvent("vienna:action", { detail: "scan" }));
    }
  };

  const handleAddClick = () => {
    navigator.vibrate?.(20);
    if (onAddItem) {
      onAddItem();
    } else {
      window.dispatchEvent(new CustomEvent("vienna:action", { detail: "add-item" }));
    }
  };

  const handleMenuClick = () => {
    navigator.vibrate?.(15);
    openDrawer();
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-card/95 backdrop-blur-xl md:hidden shadow-[0_-4px_25px_rgba(0,0,0,0.08)] pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      <div className="flex h-16 items-center justify-around px-2 max-w-lg mx-auto">
        {/* 1. Inventory / Home */}
        <Link
          to="/"
          className={`flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-colors ${
            isInventory ? "text-brand font-bold" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <div
            className={`flex size-9 items-center justify-center rounded-xl transition-all ${
              isInventory ? "bg-brand/15 text-brand scale-105 shadow-2xs" : ""
            }`}
          >
            <Package className="size-5" />
          </div>
          <span className="text-[11px] leading-none">{t("mobileNavHome")}</span>
        </Link>

        {/* 2. Camera Barcode Scanner */}
        <button
          type="button"
          onClick={handleScanClick}
          className="flex flex-1 flex-col items-center justify-center gap-1 py-1 text-muted-foreground hover:text-foreground transition-colors"
          title={t("mobileNavScan")}
        >
          <div className="flex size-9 items-center justify-center rounded-xl bg-muted/70 hover:bg-muted text-brand transition-colors">
            <QrCode className="size-5" />
          </div>
          <span className="text-[11px] leading-none">{t("mobileNavScan")}</span>
        </button>

        {/* 3. Center Floating Prominent FAB (Add Batch / Item) */}
        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            onClick={handleAddClick}
            aria-label={t("mobileNavAdd")}
            className="-mt-5 flex size-13 items-center justify-center rounded-full bg-gradient-to-tr from-cocoa via-brand to-amber-600 text-cream shadow-lg shadow-brand/40 ring-4 ring-background transition-transform active:scale-90 hover:scale-105"
          >
            <Plus className="size-6 stroke-[3]" />
          </button>
        </div>

        {/* 4. Notifications / Alerts with Live Badge */}
        <Link
          to="/notifications"
          className={`flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-colors relative ${
            isNotifications ? "text-brand font-bold" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <div
            className={`relative flex size-9 items-center justify-center rounded-xl transition-all ${
              isNotifications ? "bg-brand/15 text-brand scale-105 shadow-2xs" : ""
            }`}
          >
            <Bell className="size-5" />
            {urgentCount > 0 && (
              <span className="absolute -top-1 -end-1 flex min-w-4 h-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white shadow-xs">
                {urgentCount > 99 ? "99+" : urgentCount}
              </span>
            )}
          </div>
          <span className="text-[11px] leading-none">{t("mobileNavAlerts")}</span>
        </Link>

        {/* 5. 3-line Hamburger Menu Drawer Button ("المزيد" / "القائمة") */}
        <button
          type="button"
          onClick={handleMenuClick}
          className="flex flex-1 flex-col items-center justify-center gap-1 py-1 text-muted-foreground hover:text-foreground transition-colors"
          title={lang === "ar" ? "قائمة جميع الأقسام" : "All Sections"}
        >
          <div className="flex size-9 items-center justify-center rounded-xl bg-brand/10 text-brand hover:bg-brand/20 transition-colors">
            <Menu className="size-5 stroke-[2.5]" />
          </div>
          <span className="text-[11px] leading-none font-semibold">
            {lang === "ar" ? "القائمة" : "Menu"}
          </span>
        </button>
      </div>
    </nav>
  );
}
