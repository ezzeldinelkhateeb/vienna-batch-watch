import { useState } from "react";
import {
  ShieldAlert,
  Users,
  Smartphone,
  Laptop,
  Tablet,
  LogOut,
  Lock,
  Unlock,
  AlertTriangle,
  Clock,
  Globe,
  Radio,
  RefreshCw,
  Eye,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useSettings, settingsQueryKey } from "@/hooks/use-settings";
import { useActiveSessions, type ActiveSession } from "@/hooks/use-active-sessions";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { logActivity } from "@/lib/activity-logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function AdminSecurityHub() {
  const { lang } = useI18n();
  const { user, isAdmin } = useAuth();
  const settings = useSettings();
  const queryClient = useQueryClient();
  const { sessions, activeCount, kickSession, kickAllOthers, broadcastAppLock } = useActiveSessions();

  const [lockMessage, setLockMessage] = useState(
    settings.data?.lock_message ||
      (lang === "ar"
        ? "المنظومة تحت أعمال الصيانة والتحديث الدوري، سنعود للعمل قريباً."
        : "System is undergoing maintenance. Please check back shortly."),
  );
  const [togglingLock, setTogglingLock] = useState(false);
  const [savingMessage, setSavingMessage] = useState(false);

  const isLocked = settings.data?.is_app_locked ?? false;

  // Toggle Maintenance / Lockdown
  const handleToggleLock = async (newVal: boolean) => {
    if (!isAdmin) return;
    setTogglingLock(true);
    try {
      const { error } = await supabase
        .from("app_settings")
        .update({
          is_app_locked: newVal,
          lock_message: lockMessage.trim() || null,
          locked_at: newVal ? new Date().toISOString() : null,
          locked_by: newVal ? user?.id : null,
        })
        .eq("id", true);

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: settingsQueryKey });
      await broadcastAppLock(newVal);

      void logActivity({
        action_type: "app_lock_toggle",
        entity_name: newVal ? "تفعيل وضع الصيانة المركزي" : "إلغاء وضع الصيانة",
        details: { is_locked: newVal, message: lockMessage.trim() || null },
      });

      toast.success(
        newVal
          ? (lang === "ar" ? "تم تفعيل وضع الصيانة وإغلاق الموقع لجميع المستخدمين 🔒" : "Maintenance mode activated 🔒")
          : (lang === "ar" ? "تم إلغاء وضع الصيانة وفتح المنظومة لجميع المستخدمين 🔓" : "System unlocked 🔓"),
      );
    } catch (err) {
      console.error(err);
      toast.error(lang === "ar" ? "فشل تعديل حالة وضع الصيانة" : "Failed to toggle maintenance mode");
    } finally {
      setTogglingLock(false);
    }
  };

  // Save Lock Message
  const handleSaveLockMessage = async () => {
    if (!isAdmin) return;
    setSavingMessage(true);
    try {
      const { error } = await supabase
        .from("app_settings")
        .update({
          lock_message: lockMessage.trim() || null,
        })
        .eq("id", true);

      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: settingsQueryKey });
      toast.success(lang === "ar" ? "تم حفظ رسالة الصيانة بنجاح ✅" : "Maintenance message saved ✅");
    } catch (err) {
      console.error(err);
      toast.error(lang === "ar" ? "فشل حفظ رسالة الصيانة" : "Failed to save message");
    } finally {
      setSavingMessage(false);
    }
  };

  const getDeviceIcon = (deviceType: string) => {
    if (deviceType === "mobile") return <Smartphone className="size-4 text-emerald-600" />;
    if (deviceType === "tablet") return <Tablet className="size-4 text-amber-600" />;
    return <Laptop className="size-4 text-blue-600" />;
  };

  const formatOnlineSince = (isoStr: string) => {
    try {
      const date = new Date(isoStr);
      return date.toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Live Active Sessions Header */}
      <div className="rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex size-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full size-3 bg-emerald-500" />
              </span>
              <h3 className="text-sm sm:text-base font-bold text-foreground">
                {lang === "ar" ? "المستخدمون والأجهزة المتصلة حالياً بالمنظومة" : "Live Connected Users & Devices"}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lang === "ar"
                ? "مراقبة مباشرة لجميع الأجهزة النشطة في الوقت الفعلي مع إمكانية إنهاء أي جلسة فوراً."
                : "Real-time presence monitoring of all active devices with instant session termination."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 px-3 py-1 text-xs font-bold font-mono flex items-center gap-1.5">
              <Radio className="size-3.5 animate-pulse text-emerald-600" />
              <span>
                {activeCount} {lang === "ar" ? "أجهزة متصلة الآن" : "devices online"}
              </span>
            </span>

            {sessions.filter((s) => !s.isCurrentDevice).length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (window.confirm(lang === "ar" ? "هل تريد بالتأكيد إخراج جميع المستخدمين الآخرين من المنظومة؟" : "Kick all other active users?")) {
                    void kickAllOthers();
                  }
                }}
                className="text-xs font-semibold text-destructive hover:bg-destructive/10 border-destructive/30 gap-1.5"
              >
                <LogOut className="size-3.5" />
                <span>{lang === "ar" ? "إخراج جميع الأجهزة الأخرى" : "Kick All Others"}</span>
              </Button>
            )}
          </div>
        </div>

        {/* Sessions List */}
        {sessions.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            <p>{lang === "ar" ? "جارٍ مزامنة الاتصال المباشر للأجهزة..." : "Syncing live device connections..."}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {sessions.map((s) => (
              <div
                key={s.sessionId}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-start gap-3">
                  <div className="size-9 rounded-xl bg-muted/70 flex items-center justify-center shrink-0 border border-border/80">
                    {getDeviceIcon(s.deviceType)}
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-foreground font-mono">
                        {s.email}
                      </span>
                      {s.isCurrentDevice ? (
                        <span className="rounded-md bg-brand/10 text-brand border border-brand/20 px-2 py-0.2 text-[10px] font-bold">
                          {lang === "ar" ? "أنت (هذا الجهاز)" : "This Device"}
                        </span>
                      ) : null}
                      <span className="rounded-md bg-muted px-1.5 py-0.2 text-[10px] font-semibold text-muted-foreground">
                        {s.role === "admin" ? (lang === "ar" ? "مسؤول" : "Admin") : (lang === "ar" ? "فني جودة" : "QC Staff")}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground font-mono">
                      <span>{s.os} • {s.browser}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Globe className="size-3" />
                        <span>{s.currentPath === "/" ? (lang === "ar" ? "المخزون" : "Inventory") : s.currentPath}</span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        <span>{formatOnlineSince(s.onlineAt)}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  {!s.isCurrentDevice ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (window.confirm(lang === "ar" ? `هل تريد بالتأكيد إنهاء جلسة (${s.email}) وإخراجه؟` : `Disconnect session for ${s.email}?`)) {
                          void kickSession(s.sessionId, s.email);
                        }
                      }}
                      className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5 h-8 font-semibold"
                    >
                      <LogOut className="size-3.5" />
                      <span>{lang === "ar" ? "إخراج الجهاز" : "Kick Device"}</span>
                    </Button>
                  ) : (
                    <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="size-3.5" />
                      <span>{lang === "ar" ? "نشط حالياً" : "Active"}</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Maintenance & Lockdown Control Hub */}
      <div className="rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Lock className="size-4 text-brand" />
              <h3 className="text-sm sm:text-base font-bold text-foreground">
                {lang === "ar" ? "وضع الصيانة وإغلاق المنظومة المركزي" : "Maintenance & Central App Lock"}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lang === "ar"
                ? "إغلاق الموقع فوراً لجميع الفنيين والمستخدمين مع استمرار وصول الأدمن فقط، وعرض رسالة الصيانة."
                : "Instantly lock out all non-admin users while allowing admin access to perform updates."}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-xs font-semibold">
              {isLocked ? (
                <span className="text-red-600 flex items-center gap-1 font-bold">
                  <Lock className="size-3.5" />
                  <span>{lang === "ar" ? "وضع الصيانة: مفعل" : "Locked: ON"}</span>
                </span>
              ) : (
                <span className="text-emerald-600 flex items-center gap-1 font-bold">
                  <Unlock className="size-3.5" />
                  <span>{lang === "ar" ? "المنظومة: مفتوحة" : "Unlocked: Open"}</span>
                </span>
              )}
            </span>
            <Switch
              checked={isLocked}
              disabled={togglingLock}
              onCheckedChange={(val) => void handleToggleLock(val)}
            />
          </div>
        </div>

        {/* Lock Settings & Message */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              {lang === "ar" ? "رسالة الصيانة التي تظهر للمستخدمين عند الإغلاق:" : "Custom Maintenance Message:"}
            </Label>
            <Input
              value={lockMessage}
              onChange={(e) => setLockMessage(e.target.value)}
              placeholder="المنظومة تحت الصيانة الدورية..."
              className="text-xs font-medium"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <p className="text-[11px] text-muted-foreground">
              {lang === "ar"
                ? "المسؤولون يظلون قادرين على العمل وتجاوز شاشة الصيانة تلقائياً."
                : "Admins bypass the maintenance screen and can manage the system normally."}
            </p>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSaveLockMessage}
              disabled={savingMessage}
              className="text-xs font-semibold h-8"
            >
              {lang === "ar" ? "حفظ نص الرسالة فقط" : "Save Message"}
            </Button>
          </div>
        </div>

        {/* Live Preview Box */}
        {isLocked && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-red-900 dark:text-red-200">
              <AlertTriangle className="size-4 text-red-600 shrink-0" />
              <span>{lang === "ar" ? "تنبيه هام: المنظومة مغلقة حالياً أمام المستخدمين" : "Notice: System is currently in maintenance mode"}</span>
            </div>
            <p className="text-xs text-muted-foreground bg-card p-3 rounded-lg border">
              "{lockMessage || "المنظومة تحت الصيانة..."}"
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
