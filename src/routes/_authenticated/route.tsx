import { useState, useEffect } from "react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { MaintenanceLockedScreen } from "@/components/MaintenanceLockedScreen";
import { AppLockBanner } from "@/components/AppLockBanner";
import { useAndroidBack } from "@/hooks/use-android-back";

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
  const { isAdmin } = useAuth();
  const settings = useSettings();
  const [adminBypassed, setAdminBypassed] = useState(false);

  // Android Back button and gesture navigation stack handling
  useAndroidBack();

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
      <Outlet />
    </div>
  );
}

