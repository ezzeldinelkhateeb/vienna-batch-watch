import { useState, useEffect } from "react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { MaintenanceLockedScreen } from "@/components/MaintenanceLockedScreen";
import { SuspendedAccountScreen } from "@/components/SuspendedAccountScreen";
import { AppLockBanner } from "@/components/AppLockBanner";
import { useAndroidBack } from "@/hooks/use-android-back";
import { useActiveSessions } from "@/hooks/use-active-sessions";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data?.session?.user) {
        throw redirect({ to: "/auth" });
      }
      return { user: data.session.user };
    } catch (err: any) {
      if (err && typeof err === "object" && (err.to || err.isRedirect || err.status === 307 || err.status === 302)) {
        throw err;
      }
      throw redirect({ to: "/auth" });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, isAdmin, isPrimaryAdmin, isSuspended } = useAuth();
  const settings = useSettings();
  const [adminBypassed, setAdminBypassed] = useState(false);

  // Active sessions tracking and force logout listener
  useActiveSessions();

  // Android Back button and gesture navigation stack handling
  useAndroidBack();

  // Track session login timestamp for revoked session verification
  useEffect(() => {
    if (typeof window !== "undefined" && !sessionStorage.getItem("vienna_login_time")) {
      sessionStorage.setItem("vienna_login_time", String(Date.now()));
    }
  }, []);

  // Sync settings via Realtime channel
  useEffect(() => {
    const channel = supabase
      .channel("app-lock-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings" },
        () => {
          void settings.refetch();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [settings]);

  // Check persistent session revocation from database
  useEffect(() => {
    if (!user || isPrimaryAdmin) return;
    const flags = settings.data?.feature_flags;
    const revokedSessions = flags?.revoked_sessions;
    if (revokedSessions && typeof revokedSessions === "object") {
      const revokedAt = revokedSessions[user.id];
      if (typeof revokedAt === "number") {
        const loginTimeStr = sessionStorage.getItem("vienna_login_time");
        const loginTime = loginTimeStr ? parseInt(loginTimeStr, 10) : 0;
        if (revokedAt > loginTime) {
          void supabase.auth.signOut().then(() => {
            if (typeof window !== "undefined") {
              window.location.href = "/auth";
            }
          });
        }
      }
    }
  }, [user, isPrimaryAdmin, settings.data?.feature_flags]);

  // Intercept suspended state
  if (isSuspended && !isPrimaryAdmin) {
    return <SuspendedAccountScreen />;
  }

  const isLocked = settings.data?.is_app_locked ?? false;

  // Intercept locked state
  if (isLocked && (!isAdmin || !adminBypassed)) {
    return (
      <MaintenanceLockedScreen
        message={settings.data?.lock_message}
        lockedAt={settings.data?.locked_at}
        onAdminBypass={isAdmin ? () => setAdminBypassed(true) : undefined}
      />
    );
  }

  return (
    <div className="relative min-h-screen">
      <AppLockBanner isLocked={isLocked} />
      <AppErrorBoundary fallbackTitle="تعذر تحميل محتوى هذه الصفحة">
        <Outlet />
      </AppErrorBoundary>
    </div>
  );
}

