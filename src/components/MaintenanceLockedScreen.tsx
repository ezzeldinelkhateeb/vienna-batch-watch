import { useState } from "react";
import { Lock, AlertTriangle, ShieldCheck, LogOut, RefreshCw, Sparkles, Key } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { settingsQueryKey } from "@/hooks/use-settings";

interface MaintenanceLockedScreenProps {
  message?: string | null | undefined;
  lockedAt?: string | null | undefined;
  onAdminBypass?: () => void;
}

export function MaintenanceLockedScreen({
  message,
  lockedAt,
  onAdminBypass,
}: MaintenanceLockedScreenProps) {
  const { lang } = useI18n();
  const { user, isAdmin, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [unlocking, setUnlocking] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleUnlock = async () => {
    if (!isAdmin) return;
    setUnlocking(true);
    try {
      const { error } = await supabase
        .from("app_settings")
        .update({
          is_app_locked: false,
          locked_at: null,
          locked_by: null,
        })
        .eq("id", true);

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: settingsQueryKey });
      toast.success(lang === "ar" ? "تم إلغاء قفل التطبيق بنجاح" : "Application unlocked successfully");
    } catch (err) {
      console.error(err);
      toast.error(lang === "ar" ? "فشل إلغاء القفل" : "Failed to unlock application");
    } finally {
      setUnlocking(false);
    }
  };

  const handleCheckStatus = async () => {
    setChecking(true);
    try {
      await queryClient.invalidateQueries({ queryKey: settingsQueryKey });
      toast.info(lang === "ar" ? "تم تحديث حالة النظام" : "System status checked");
    } finally {
      setTimeout(() => setChecking(false), 500);
    }
  };

  const defaultMessage =
    lang === "ar"
      ? "التطبيق متوقف مؤقتاً لأعمال الصيانة الدورية أو الجرد السنوي للمخزون لمنع تضارب البيانات. يُرجى مراجعة إدارة المصنع."
      : "The application is temporarily locked for maintenance or stock inventory audit to prevent data conflicts. Please contact plant management.";

  return (
    <div className="fixed inset-0 z-50 flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-900 via-zinc-900 to-black p-4 text-white select-none">
      {/* Glow decorative effects */}
      <div className="absolute top-1/4 size-96 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 size-80 rounded-full bg-brand/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 mx-auto w-full max-w-lg rounded-2xl border border-white/15 bg-card/85 p-6 sm:p-8 text-center shadow-2xl backdrop-blur-xl">
        {/* Animated Lock Icon */}
        <div className="relative mx-auto mb-5 flex size-20 items-center justify-center rounded-2xl bg-amber-500/20 border-2 border-amber-500/40 text-amber-400 shadow-lg">
          <Lock className="size-10 animate-pulse" />
          <div className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full bg-amber-500 text-slate-950 font-bold text-xs shadow-md">
            !
          </div>
        </div>

        {/* Vienna Factory Title */}
        <div className="mb-2 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-300/80">
          <Sparkles className="size-3.5" />
          <span>{lang === "ar" ? "مصنع فينا للبسكوت والشيكولاتة" : "Vienna Biscuit & Chocolate Factory"}</span>
        </div>

        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-3">
          {lang === "ar" ? "التطبيق متوقف مؤقتاً" : "Application Temporarily Locked"}
        </h1>

        {/* Lock message */}
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs sm:text-sm text-amber-100/90 leading-relaxed text-start">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="size-4 text-amber-400 shrink-0 mt-0.5" />
            <p>{message || defaultMessage}</p>
          </div>
          {lockedAt && (
            <div className="mt-2.5 pt-2 border-t border-amber-500/20 text-[11px] text-amber-300/70 font-mono">
              {lang === "ar" ? "توقيت القفل:" : "Locked at:"} {new Date(lockedAt).toLocaleString()}
            </div>
          )}
        </div>

        {/* Admin Controls Banner */}
        {isAdmin && (
          <div className="mb-6 rounded-xl border border-brand/50 bg-brand/15 p-4 text-start">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="size-4 text-brand" />
              <span className="font-bold text-xs text-white">
                {lang === "ar" ? "صلاحيات مسؤول النظام (Admin Mode)" : "System Administrator Mode"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              {lang === "ar"
                ? "أنت مسجل كمسؤول نظام. يمكنك إلغاء قفل التطبيق لجميع المستخدمين فوراً، أو الاستمرار بالدخول للمعاينة."
                : "You are signed in as Admin. You can unlock the application for everyone or proceed to inspect."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={handleUnlock}
                disabled={unlocking}
                size="sm"
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold gap-1.5 text-xs shadow-md"
              >
                <Key className="size-3.5" />
                <span>{unlocking ? (lang === "ar" ? "جارٍ الفتح..." : "Unlocking...") : (lang === "ar" ? "إلغاء قفل التطبيق للجميع" : "Unlock Application")}</span>
              </Button>
              {onAdminBypass && (
                <Button
                  type="button"
                  onClick={onAdminBypass}
                  variant="outline"
                  size="sm"
                  className="border-white/30 text-white hover:bg-white/10 text-xs"
                >
                  <span>{lang === "ar" ? "المتابعة كمسؤول" : "Bypass as Admin"}</span>
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCheckStatus}
            disabled={checking}
            className="w-full sm:w-auto gap-2 border-white/20 bg-white/5 text-white hover:bg-white/15 text-xs font-semibold"
          >
            <RefreshCw className={`size-3.5 ${checking ? "animate-spin" : ""}`} />
            <span>{lang === "ar" ? "فحص الحالة الآن" : "Check Status"}</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void signOut()}
            className="w-full sm:w-auto gap-2 text-rose-300 hover:bg-rose-500/20 hover:text-rose-200 text-xs"
          >
            <LogOut className="size-3.5" />
            <span>{lang === "ar" ? "تسجيل الخروج" : "Sign Out"}</span>
          </Button>
        </div>

        <p className="mt-6 text-[11px] text-white/40">
          {user?.email ? `${user.email} • ` : ""}
          Vienna Smart Batch System
        </p>
      </div>
    </div>
  );
}
