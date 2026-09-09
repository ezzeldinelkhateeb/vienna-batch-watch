import { Link, useLocation } from "@tanstack/react-router";
import { Package, Bell, Settings, Plus, QrCode } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface MobileBottomNavProps {
  onAddItem?: () => void;
  onScan?: () => void;
}

export function MobileBottomNav({ onAddItem, onScan }: MobileBottomNavProps) {
  const { t } = useI18n();
  const location = useLocation();
  const pathname = location.pathname;

  const isInventory = pathname === "/" || pathname === "/inventory";
  const isNotifications = pathname === "/notifications";
  const isSettings = pathname === "/settings";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-card/95 backdrop-blur-xl md:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.06)] pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      <div className="flex h-16 items-center justify-around px-2">
        {/* Inventory Tab */}
        <Link
          to="/"
          className={`flex flex-col items-center justify-center gap-1 px-3 py-1 transition-colors ${
            isInventory ? "text-brand font-semibold" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <div
            className={`flex size-8 items-center justify-center rounded-full transition-all ${
              isInventory ? "bg-brand/15 text-brand scale-110" : ""
            }`}
          >
            <Package className="size-4" />
          </div>
          <span className="text-[10px] leading-none">{t("mobileNavHome")}</span>
        </Link>

        {/* Scan Barcode Button */}
        {onScan ? (
          <button
            type="button"
            onClick={() => {
              navigator.vibrate?.(15);
              onScan();
            }}
            className="flex flex-col items-center justify-center gap-1 px-3 py-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <div className="flex size-8 items-center justify-center rounded-full bg-muted">
              <QrCode className="size-4 text-brand" />
            </div>
            <span className="text-[10px] leading-none">{t("mobileNavScan")}</span>
          </button>
        ) : null}

        {/* Center Floating Action Button (Add Item) */}
        {onAddItem ? (
          <button
            type="button"
            onClick={() => {
              navigator.vibrate?.(20);
              onAddItem();
            }}
            aria-label={t("mobileNavAdd")}
            className="-mt-5 flex size-12 items-center justify-center rounded-full bg-gradient-to-tr from-cocoa to-brand text-cream shadow-lg shadow-brand/30 ring-4 ring-background transition-transform active:scale-90 hover:scale-105"
          >
            <Plus className="size-6 stroke-[2.5]" />
          </button>
        ) : null}

        {/* Notifications Tab */}
        <Link
          to="/notifications"
          className={`flex flex-col items-center justify-center gap-1 px-3 py-1 transition-colors ${
            isNotifications
              ? "text-brand font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <div
            className={`flex size-8 items-center justify-center rounded-full transition-all ${
              isNotifications ? "bg-brand/15 text-brand scale-110" : ""
            }`}
          >
            <Bell className="size-4" />
          </div>
          <span className="text-[10px] leading-none">{t("mobileNavAlerts")}</span>
        </Link>

        {/* Settings Tab */}
        <Link
          to="/settings"
          className={`flex flex-col items-center justify-center gap-1 px-3 py-1 transition-colors ${
            isSettings ? "text-brand font-semibold" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <div
            className={`flex size-8 items-center justify-center rounded-full transition-all ${
              isSettings ? "bg-brand/15 text-brand scale-110" : ""
            }`}
          >
            <Settings className="size-4" />
          </div>
          <span className="text-[10px] leading-none">{t("mobileNavSettings")}</span>
        </Link>
      </div>
    </nav>
  );
}
