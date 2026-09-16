import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { closeTopModal, hasOpenModal } from "@/lib/modal-stack";

const GUARD_STATE_KEY = "__vienna_back_guard__";

/**
 * Custom hook to handle Android hardware back button and swipe gesture navigation:
 * 1. If any modal/dialog/sheet/camera/scanner is open, dismiss it first without leaving the screen.
 * 2. If on a sub-route (e.g. /settings, /notifications, /monthly-audit), navigate back to /inventory.
 * 3. If on the home route (/ or /inventory) with no modals open:
 *    - First back press: shows "اضغط مرة أخرى للخروج من التطبيق" (Double tap to exit toast).
 *    - Second back press within 2 seconds: allows app exit.
 */
export function useAndroidBack() {
  const { t, lang } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();

  const lastExitTapRef = useRef<number>(0);
  const isExitingRef = useRef<boolean>(false);
  const pathnameRef = useRef<string>(location.pathname);
  pathnameRef.current = location.pathname;

  // Stable helper to push our guard state to history
  const pushGuard = () => {
    if (typeof window === "undefined" || isExitingRef.current) return;
    try {
      const state = window.history.state || {};
      if (!state[GUARD_STATE_KEY]) {
        window.history.pushState(
          { ...state, [GUARD_STATE_KEY]: true, ts: Date.now() },
          "",
          window.location.href,
        );
      }
    } catch {
      // Ignore pushState restrictions if any
    }
  };

  // Push guard state whenever the active route pathname changes
  useEffect(() => {
    pushGuard();
  }, [location.pathname]);

  // Intercept popstate events from hardware back button / swipe back gesture
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Ensure initial guard is in place on mount
    pushGuard();

    const handlePopState = () => {
      if (isExitingRef.current) return;

      // 1. Priority 1: Check if any modal/dialog/sheet is currently open
      if (hasOpenModal()) {
        const closed = closeTopModal();
        if (closed) {
          // Re-push guard state so the user stays on the current screen
          pushGuard();
          lastExitTapRef.current = 0;
          return;
        }
      }

      // 2. Priority 2: Check if user is on a sub-route (e.g. /settings, /monthly-audit)
      const currentPath = pathnameRef.current;
      const isHome = currentPath === "/" || currentPath === "/inventory";

      if (!isHome) {
        // Navigate back to the home / inventory view
        void navigate({ to: "/inventory" });
        pushGuard();
        lastExitTapRef.current = 0;
        return;
      }

      // 3. Priority 3: User is on home with no modals open -> Double tap to exit
      const now = Date.now();
      const elapsed = now - lastExitTapRef.current;

      if (elapsed < 2000) {
        // Double-tap confirmed! Allow exit
        isExitingRef.current = true;
        window.history.back();
      } else {
        // First tap: register timestamp, trigger haptic pulse, and show warning toast
        lastExitTapRef.current = now;

        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(30);
        }

        toast.info(
          t("pressAgainToExit") ||
            (lang === "ar"
              ? "اضغط مرة أخرى للخروج من التطبيق"
              : "Press back again to exit"),
          {
            id: "android-exit-toast",
            duration: 2000,
          },
        );

        // Re-push guard state to catch the second tap
        pushGuard();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [navigate, t, lang]);
}
