import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ExternalLink,
  MessageCircle,
  PlayCircle,
  Send,
  ShieldAlert,
  Users,
  Clock,
  Settings as SettingsIcon,
  CheckCircle2,
  Sparkles,
  Archive,
  Lock,
  Sliders,
} from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useSettings, settingsQueryKey } from "@/hooks/use-settings";
import {
  sendTestWhatsApp,
  sendTestTelegram,
  triggerExpiryCheckNow,
  registerTelegramBotWebhook,
  getTelegramWebhookStatus,
  sendMorningBriefingNow,
} from "@/lib/whatsapp.functions";
import { buildDirectWhatsAppUrl } from "@/lib/whatsapp.shared";
import { AppHeader } from "@/components/AppHeader";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { TeamManagement } from "@/components/TeamManagement";
import { WhatsAppShareDialog } from "@/components/WhatsAppShareDialog";
import { BackupRestoreManager } from "@/components/BackupRestoreManager";
import { AdminControlHub } from "@/components/AdminControlHub";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { logActivity } from "@/lib/activity-logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SettingsTab = "alerts" | "thresholds" | "team" | "backup" | "admin_hub";

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: (search: Record<string, unknown>): { tab?: SettingsTab } => ({
    tab: (search["tab"] as SettingsTab) || undefined,
  }),
  head: () => ({
    meta: [
      { title: "Settings — Vienna Expiry Tracker" },
      {
        name: "description",
        content: "Configure WhatsApp and Telegram alerts and warning thresholds.",
      },
      { property: "og:title", content: "Settings — Vienna Expiry Tracker" },
      {
        name: "property",
        content: "WhatsApp & Telegram alert credentials and warning thresholds.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t, lang } = useI18n();
  const { session, isAdmin, loading: authLoading } = useAuth();
  const search = Route.useSearch();
  const settings = useSettings();
  const queryClient = useQueryClient();

  const sendWaTest = useServerFn(sendTestWhatsApp);
  const sendTgTest = useServerFn(sendTestTelegram);
  const runCheckNow = useServerFn(triggerExpiryCheckNow);
  const registerWebhook = useServerFn(registerTelegramBotWebhook);
  const checkWebhook = useServerFn(getTelegramWebhookStatus);
  const sendMorning = useServerFn(sendMorningBriefingNow);

  const [activeTab, setActiveTab] = useState<SettingsTab>(search?.tab || "alerts");
  const [sendingMorning, setSendingMorning] = useState(false);

  useEffect(() => {
    if (search?.tab) {
      setActiveTab(search.tab);
    }
  }, [search?.tab]);

  // WhatsApp state
  const [phone, setPhone] = useState("");
  const [apiKey, setApiKey] = useState("");

  // Telegram state
  const [tgToken, setTgToken] = useState("");
  const [tgChatId, setTgChatId] = useState("");

  // Channel & Thresholds state
  const [notifyChannel, setNotifyChannel] = useState<"both" | "whatsapp" | "telegram">("both");
  const [early, setEarly] = useState("90");
  const [medium, setMedium] = useState("60");
  const [critical, setCritical] = useState("30");

  // Action status
  const [saving, setSaving] = useState(false);
  const [testingWa, setTestingWa] = useState(false);
  const [testingTg, setTestingTg] = useState(false);
  const [activatingWebhook, setActivatingWebhook] = useState(false);
  const [checkingWebhook, setCheckingWebhook] = useState(false);
  const [telegramDiagnostic, setTelegramDiagnostic] = useState<{
    bot?: any;
    webhook?: any;
  } | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [callmebotDiagnostic, setCallmebotDiagnostic] = useState<string | null>(null);
  const [whatsAppDialogOpen, setWhatsAppDialogOpen] = useState(false);

  // Centralized App Lock State
  const [isAppLocked, setIsAppLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState("");
  const [togglingLock, setTogglingLock] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setPhone(settings.data.whatsapp_phone ?? "");
    setApiKey(settings.data.callmebot_apikey ?? "");
    setTgToken(settings.data.telegram_bot_token ?? "");
    setTgChatId(settings.data.telegram_chat_id ?? "");
    setNotifyChannel(settings.data.notify_channel ?? "both");
    setEarly(String(settings.data.thresholds.early));
    setMedium(String(settings.data.thresholds.medium));
    setCritical(String(settings.data.thresholds.critical));
    setIsAppLocked(Boolean(settings.data.is_app_locked));
    setLockMessage(settings.data.lock_message || "");
  }, [settings.data]);

  const handleToggleLock = async (newVal: boolean) => {
    if (!isAdmin) return;
    setTogglingLock(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("app_settings")
        .update({
          is_app_locked: newVal,
          lock_message: lockMessage.trim() || null,
          locked_at: newVal ? new Date().toISOString() : null,
          locked_by: newVal ? userRes.user?.id : null,
        })
        .eq("id", true);

      if (error) throw error;
      setIsAppLocked(newVal);
      await queryClient.invalidateQueries({ queryKey: settingsQueryKey });
      void logActivity({
        action_type: "app_lock_toggle",
        entity_name: newVal ? "قفل التطبيق المركزي" : "إلغاء قفل التطبيق المركزي",
        details: { is_locked: newVal, message: lockMessage.trim() || null },
      });
      toast.success(
        newVal
          ? (lang === "ar" ? "تم قفل التطبيق لجميع المستخدمين بنجاح 🔒" : "App locked for all users 🔒")
          : (lang === "ar" ? "تم إلغاء قفل التطبيق وفتحه للمستخدمين 🔓" : "App unlocked for all users 🔓"),
      );
    } catch (err) {
      console.error(err);
      toast.error(lang === "ar" ? "فشل تعديل حالة قفل التطبيق" : "Failed to update app lock state");
    } finally {
      setTogglingLock(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        id: true,
        whatsapp_phone: phone.trim() || null,
        callmebot_apikey: apiKey.trim() || null,
        telegram_bot_token: tgToken.trim() || null,
        telegram_chat_id: tgChatId.trim() || null,
        notify_channel: notifyChannel,
        ...(isAdmin
          ? {
              threshold_early: Number(early),
              threshold_medium: Number(medium),
              threshold_critical: Number(critical),
            }
          : {}),
      };

      const { error } = await supabase.from("app_settings").upsert(payload);
      if (error) {
        const fullErr = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`;
        if (
          fullErr.includes("telegram_bot_token") ||
          fullErr.includes("notify_channel") ||
          fullErr.includes("schema cache")
        ) {
          throw new Error(
            "جدول الإعدادات في Supabase يحتاج لتشغيل كود التحديث (SQL Migration) لإضافة حقول التليجرام وقنوات التنبيه. يرجى تشغيل كود SQL في Supabase."
          );
        }
        throw new Error(error.message || t("errGeneric"));
      }
      toast.success(t("saved"));
      void queryClient.invalidateQueries({ queryKey: settingsQueryKey });
      void logActivity({
        action_type: "settings_change",
        entity_name: "إعدادات الإشعارات وتنبيهات الصلاحية",
        details: { notify_channel: notifyChannel, has_whatsapp: Boolean(phone.trim()), has_telegram: Boolean(tgToken.trim()) },
      });
    } catch (err: any) {
      const msg = err?.message || (err instanceof Error ? err.message : t("errGeneric"));
      toast.error(msg, { duration: 7000 });
    } finally {
      setSaving(false);
    }
  };

  const testWhatsAppBot = async () => {
    if (!phone.trim() || !apiKey.trim()) {
      toast.error(t("errMissingWhatsapp"));
      return;
    }
    setTestingWa(true);
    setCallmebotDiagnostic(null);
    try {
      const result = await sendWaTest({ data: { phone, apiKey } });
      if (result.success) {
        toast.success(t("testSent"));
      } else {
        setCallmebotDiagnostic(result.error ?? "تعذر الاتصال ببوت CallMeBot.");
        toast.error(result.error ?? t("errGeneric"));
      }
    } catch (err: any) {
      const msg = err?.message || (err instanceof Error ? err.message : t("errGeneric"));
      setCallmebotDiagnostic(msg);
      toast.error(msg);
    } finally {
      setTestingWa(false);
    }
  };

  const openDirectWhatsApp = () => {
    setWhatsAppDialogOpen(true);
  };

  const testTelegramBot = async () => {
    if (!tgToken.trim() || !tgChatId.trim()) {
      toast.error(t("errMissingTelegram"));
      return;
    }
    setTestingTg(true);
    try {
      const result = await sendTgTest({
        data: { botToken: tgToken, chatId: tgChatId },
      });
      if (result.success) {
        toast.success(t("telegramTestSent"));
      } else {
        toast.error(result.error ?? t("errGeneric"));
      }
    } catch (err: any) {
      // Fallback: send directly via Telegram Bot API from browser
      try {
        const directRes = await fetch(
          `https://api.telegram.org/bot${encodeURIComponent(tgToken.trim())}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: tgChatId.trim(),
              text:
                "🍫 *Vienna Expiry Tracker (Telegram)* 🍫\n" +
                "تأكيد استلام: تنبيهات تليجرام تعمل بنجاح وبأعلى سرعة ✅ (إرسال مباشر)\n" +
                "وقت الإرسال: " +
                new Date().toLocaleString("ar-EG"),
              disable_web_page_preview: true,
            }),
          }
        );
        const directData = (await directRes.json()) as { ok: boolean; description?: string };
        if (directData.ok) {
          toast.success("تم إرسال رسالة تليجرام بنجاح! ✅");
          return;
        } else {
          toast.error(`خطأ من تليجرام: ${directData.description || "تعذر الإرسال"}`);
          return;
        }
      } catch {
        // pass to original error
      }
      const msg = err?.message || (err instanceof Error ? err.message : t("errGeneric"));
      toast.error(msg);
    } finally {
      setTestingTg(false);
    }
  };

  const handleManualCheck = async () => {
    setTriggering(true);
    try {
      const res = await runCheckNow();
      if (res.success) {
        const msg = t("checkCompleted", {
          checked: res.checked,
          sent: res.totalSent ?? 0,
          wa: res.sentWhatsApp ?? 0,
          tg: res.sentTelegram ?? 0,
        });
        toast.success(msg, { duration: 6000 });
        void queryClient.invalidateQueries({ queryKey: ["notification_log"] });
        void queryClient.invalidateQueries({ queryKey: ["items"] });
      } else {
        toast.error(res.error ?? t("errGeneric"), { duration: 8000 });
      }
    } catch (err: any) {
      const msg = err?.message || (err instanceof Error ? err.message : t("errGeneric"));
      toast.error(msg, { duration: 8000 });
    } finally {
      setTriggering(false);
    }
  };

  const handleActivateWebhook = async () => {
    if (!tgToken.trim()) {
      toast.error("يرجى إدخال وحفظ رمز البوت (Bot Token) أولاً لتفعيل الرد الذكي.");
      return;
    }
    setActivatingWebhook(true);
    try {
      const siteUrl = typeof window !== "undefined" ? window.location.origin : undefined;
      const res = await registerWebhook({ data: { botToken: tgToken, siteUrl } });
      if (res.success) {
        const usernameTag = res.botUsername ? ` (@${res.botUsername})` : "";
        toast.success(
          `تم تفعيل وإصلاح الرد التلقائي الذكي للبوت بنجاح! 🎉${usernameTag} يمكنك الآن مراسلة البوت وسؤاله في الخاص أو في الجروب وسيجيبك فوراً مع عمل كافة الأزرار.`,
          { duration: 8000 },
        );
        void handleCheckWebhookStatus();
      } else {
        toast.error(res.error || "فشل تفعيل الـ Webhook مع سيرفر تليجرام.");
      }
    } catch (err: any) {
      toast.error(err?.message || "حدث خطأ أثناء تفعيل الرد الذكي.");
    } finally {
      setActivatingWebhook(false);
    }
  };

  const handleCheckWebhookStatus = async () => {
    if (!tgToken.trim()) {
      toast.error("يرجى إدخال رمز البوت (Bot Token) لفحص حالته.");
      return;
    }
    setCheckingWebhook(true);
    try {
      const res = await checkWebhook({ data: { botToken: tgToken } });
      if (res.success) {
        setTelegramDiagnostic({ bot: res.bot, webhook: res.webhook });
        if (res.webhook?.url) {
          toast.success("البوت متصل بالـ Webhook بنجاح وجاهز لاستقبال الرسائل والأزرار ✅");
        } else {
          toast.warning("الـ Webhook غير مفعل حالياً للبوت. اضغط على زر تفعيل الرد الذكي ⚡");
        }
      } else {
        toast.error(res.error || "فشل التحقق من حالة البوت.");
      }
    } catch (err: any) {
      toast.error(err?.message || "خطأ في الاتصال بسيرفر تليجرام.");
    } finally {
      setCheckingWebhook(false);
    }
  };

  const handleSendMorning = async () => {
    if (!tgToken.trim() || !tgChatId.trim()) {
      toast.error("يرجى إدخال وحفظ رمز البوت ومعرّف المحادثة أولاً.");
      return;
    }
    setSendingMorning(true);
    try {
      const res = await sendMorning({ data: { botToken: tgToken.trim(), chatId: tgChatId.trim() } });
      if (res.success) {
        toast.success("تم إرسال نشرة وردية الصباح إلى تليجرام بنجاح! 🌅");
      } else {
        toast.error(res.error || "فشل إرسال نشرة الصباح.");
      }
    } catch (err: any) {
      toast.error(err?.message || "تعذر إرسال نشرة الصباح.");
    } finally {
      setSendingMorning(false);
    }
  };

  if (!authLoading && !isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto w-full max-w-lg px-4 py-16 text-center">
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-8 shadow-sm space-y-4">
            <div className="size-16 rounded-full bg-destructive/20 text-destructive flex items-center justify-center mx-auto">
              <Lock className="size-8" />
            </div>
            <h1 className="text-xl font-bold text-foreground">
              {lang === "ar" ? "إعدادات النظام محصورة للأدمن فقط" : "Administrator Access Only"}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {lang === "ar"
                ? "عذراً، إعدادات البرنامج والتحكم في قنوات التنبيهات والمخازن وصلاحيات الفريق مقتصرة حصرياً على مدير النظام (Admin)."
                : "System settings, alert channels, and team permissions are restricted exclusively to full Administrators."}
            </p>
            <div className="pt-2">
              <Button asChild className="bg-brand text-white font-bold">
                <Link to="/inventory">
                  {lang === "ar" ? "العودة لسجل المخزون" : "Back to Inventory"}
                </Link>
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6 pb-24 md:pb-10">
        {/* Page Title */}
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <SettingsIcon className="size-4" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-cocoa">{t("settings")}</h1>
            <p className="text-xs text-muted-foreground">
              {lang === "ar"
                ? "إعدادات قنوات الإرسال التلقائي، وحدود صلاحية المواد، وصلاحيات الفريق."
                : "Manage alert channels, threshold warnings, and team permissions."}
            </p>
          </div>
        </div>

        {/* Admin Central App Lock Card */}
        {isAdmin && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 sm:p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500 text-slate-950 font-bold">
                    <Lock className="size-4" />
                  </div>
                  <h2 className="text-sm sm:text-base font-bold text-amber-950 dark:text-amber-100">
                    {lang === "ar" ? "قفل التطبيق المركزي (وضع الصيانة والجرد)" : "Centralized App Lock & Maintenance Mode"}
                  </h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      isAppLocked ? "bg-red-600 text-white animate-pulse" : "bg-emerald-600 text-white"
                    }`}
                  >
                    {isAppLocked
                      ? lang === "ar"
                        ? "🔒 النظام مقفل حالياً"
                        : "🔒 System Locked"
                      : lang === "ar"
                        ? "✅ النظام يعمل طبيعياً"
                        : "✅ Normal Operation"}
                  </span>
                </div>
                <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
                  {lang === "ar"
                    ? "عند تفعيل القفل، يتم حجب التطبيق فوراً عن جميع الموظفين لمنع أي تعديلات أثناء أعمال الجرد الدوري أو الصيانة."
                    : "When enabled, all users are blocked from taking actions to prevent data mismatch during audit or maintenance."}
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <Switch
                  checked={isAppLocked}
                  onCheckedChange={handleToggleLock}
                  disabled={togglingLock}
                  id="app-lock-switch"
                />
                <Label htmlFor="app-lock-switch" className="text-xs font-bold cursor-pointer">
                  {isAppLocked
                    ? lang === "ar"
                      ? "إلغاء القفل (فتح)"
                      : "Unlock App"
                    : lang === "ar"
                      ? "قفل التطبيق الآن"
                      : "Lock App Now"}
                </Label>
              </div>
            </div>

            {isAppLocked && (
              <div className="mt-3 pt-3 border-t border-amber-500/20 flex flex-col sm:flex-row gap-2">
                <Input
                  value={lockMessage}
                  onChange={(e) => setLockMessage(e.target.value)}
                  placeholder={lang === "ar" ? "رسالة القفل المعروضة للمستخدمين..." : "Lock message displayed to users..."}
                  className="text-xs bg-card"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleToggleLock(true)}
                  disabled={togglingLock}
                  className="text-xs shrink-0 bg-card"
                >
                  {lang === "ar" ? "تحديث الرسالة" : "Update Message"}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Segmented Tabs Navigation */}
        <div className="flex rounded-xl border border-border/80 bg-muted/50 p-1 shadow-xs">
          <button
            type="button"
            onClick={() => setActiveTab("alerts")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs sm:text-sm font-medium transition-all ${
              activeTab === "alerts"
                ? "bg-card text-cocoa font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageCircle className="size-4 text-brand" />
            <span>{t("tabSettingsAlerts")}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("thresholds")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs sm:text-sm font-medium transition-all ${
              activeTab === "thresholds"
                ? "bg-card text-cocoa font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Clock className="size-4 text-brand" />
            <span>{t("tabSettingsThresholds")}</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab("team")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs sm:text-sm font-medium transition-all ${
                activeTab === "team"
                  ? "bg-card text-cocoa font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="size-4 text-brand" />
              <span>{t("tabSettingsTeam")}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab("backup")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs sm:text-sm font-medium transition-all ${
              activeTab === "backup"
                ? "bg-card text-cocoa font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Archive className="size-4 text-brand" />
            <span>{t("tabSettingsBackup")}</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab("admin_hub")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs sm:text-sm font-medium transition-all ${
                activeTab === "admin_hub"
                  ? "bg-card text-cocoa font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sliders className="size-4 text-brand" />
              <span>{lang === "ar" ? "لوحة الأدمن" : "Admin Hub"}</span>
            </button>
          )}
        </div>

        {/* Tab 1: Alert Channels & Manual Check */}
        {activeTab === "alerts" && (
          <div className="space-y-5">
            {/* Manual Instant Trigger Card */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border bg-gradient-to-r from-amber-500/10 via-brand/10 to-amber-500/5 p-4 sm:p-5 shadow-sm">
              <div>
                <h2 className="text-sm sm:text-base font-semibold text-cocoa flex items-center gap-2">
                  <PlayCircle className="size-5 text-brand" />
                  {t("triggerCheckNow")}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {lang === "ar"
                    ? "تشغيل فحص فوري لكافة شحنات المواد الخام، وإرسال التنبيهات اللازمة للمواد التي شارفت على الانتهاء فوراً."
                    : "Instantly evaluate raw material expiries and dispatch alerts for all urgent batches right now."}
                </p>
              </div>
              <Button
                type="button"
                onClick={handleManualCheck}
                disabled={triggering}
                className="shrink-0 gap-2 bg-brand hover:bg-brand/90 text-white shadow-sm text-xs"
              >
                <PlayCircle className="size-4" />
                {triggering ? t("triggeringCheck") : t("triggerCheckNow")}
              </Button>
            </div>

            <form
              onSubmit={save}
              className="space-y-6 rounded-xl border bg-card p-5 sm:p-6 shadow-sm"
            >
              {/* WhatsApp Settings */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-cocoa flex items-center gap-2">
                      <MessageCircle className="size-5 text-[#25D366]" />
                      {t("whatsappSettings")}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">{t("callmebotHint")}</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">{t("phone")}</Label>
                    <Input
                      id="phone"
                      dir="ltr"
                      placeholder="+201026017665"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="apikey">{t("apiKey")}</Label>
                    <Input
                      id="apikey"
                      dir="ltr"
                      placeholder="7250276"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </div>
                </div>

                {callmebotDiagnostic && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-950 dark:text-amber-200 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-300">
                      <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                      <span>
                        {lang === "ar" ? "تشخيص سيرفر CallMeBot:" : "CallMeBot Server Diagnostic:"}
                      </span>
                    </div>
                    <p>{callmebotDiagnostic}</p>
                    <p className="text-[11px] opacity-80">
                      {lang === "ar"
                        ? "💡 نصيحة: إذا كان سيرفر CallMeBot يمر بأعمال صيانة من المصدر، يمكنك استخدام زر 'فتح في واتساب ويب / التطبيق مباشرة' أدناه، أو تفعيل تنبيهات بوت تليجرام المستقرة 100%."
                        : "💡 Tip: If CallMeBot is experiencing maintenance, you can use 'Open in WhatsApp Web/App' below, or activate 100% reliable Telegram Bot alerts."}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={testWhatsAppBot}
                    disabled={testingWa}
                    className="gap-2 text-xs"
                  >
                    <Send className="size-3.5" />
                    {testingWa ? t("sending") : t("sendTest")}
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    onClick={openDirectWhatsApp}
                    className="gap-2 text-xs text-[#128C7E] hover:text-[#075E54] border border-[#25D366]/30 bg-[#25D366]/10"
                  >
                    <ExternalLink className="size-3.5" />
                    {t("openWhatsAppDirect")}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">{t("whatsappDirectHint")}</p>
              </div>

              {/* Telegram Bot Settings */}
              <div className="space-y-4 border-t pt-5">
                <div>
                  <h2 className="text-base font-semibold text-cocoa flex items-center gap-2">
                    <Send className="size-5 text-[#229ED9]" />
                    {t("telegramSettings")}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">{t("telegramHint")}</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="tgToken">{t("telegramBotToken")}</Label>
                    <Input
                      id="tgToken"
                      dir="ltr"
                      type="password"
                      placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                      value={tgToken}
                      onChange={(e) => setTgToken(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tgChatId">{t("telegramChatId")}</Label>
                    <Input
                      id="tgChatId"
                      dir="ltr"
                      placeholder="-100123456789 or 987654321"
                      value={tgChatId}
                      onChange={(e) => setTgChatId(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={testTelegramBot}
                    disabled={testingTg}
                    className="gap-2 text-xs"
                  >
                    <Send className="size-3.5 text-[#229ED9]" />
                    {testingTg ? t("sending") : t("sendTestTelegram")}
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleActivateWebhook}
                    disabled={activatingWebhook || !tgToken.trim()}
                    className="gap-2 text-xs border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 font-bold"
                  >
                    <Sparkles className="size-3.5 text-blue-600" />
                    <span>{activatingWebhook ? "جارٍ التفعيل..." : "⚡ تفعيل وإصلاح الرد الذكي (Webhook)"}</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCheckWebhookStatus}
                    disabled={checkingWebhook || !tgToken.trim()}
                    className="gap-2 text-xs border-dashed text-muted-foreground hover:text-foreground"
                  >
                    <CheckCircle2 className="size-3.5 text-emerald-600" />
                    <span>{checkingWebhook ? "جارٍ الفحص..." : "🔍 فحص وتشخيص الـ Webhook"}</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSendMorning}
                    disabled={sendingMorning || !tgToken.trim() || !tgChatId.trim()}
                    className="gap-2 text-xs border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                  >
                    <Sparkles className="size-3.5 text-amber-500" />
                    <span>{sendingMorning ? "جارٍ الإرسال..." : "🌅 تجربة نشرة الصباح"}</span>
                  </Button>
                </div>

                {/* Telegram Diagnostic Card */}
                {telegramDiagnostic && (
                  <div className="rounded-xl border border-border bg-card/60 p-3.5 text-xs space-y-2 text-cocoa">
                    <div className="flex items-center justify-between font-bold text-xs pb-1 border-b border-border/50">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="size-3.5 text-blue-600" />
                        <span>معلومات البوت والـ Webhook المباشرة:</span>
                      </span>
                      {telegramDiagnostic.webhook?.url ? (
                        <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          متصل ونشط ✅
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                          غير مرتبط ⚠️
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      {telegramDiagnostic.bot && (
                        <div>
                          <span className="text-muted-foreground">اسم ومعرّف البوت:</span>{" "}
                          <strong>{telegramDiagnostic.bot.first_name}</strong>{" "}
                          {telegramDiagnostic.bot.username && (
                            <a
                              href={`https://t.me/${telegramDiagnostic.bot.username}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 underline font-mono font-bold"
                            >
                              @{telegramDiagnostic.bot.username}
                            </a>
                          )}
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">التحديثات المعلقة:</span>{" "}
                        <strong>{telegramDiagnostic.webhook?.pending_update_count ?? 0}</strong>
                      </div>
                      <div className="sm:col-span-2 break-all">
                        <span className="text-muted-foreground">رابط الـ Webhook المسجل:</span>{" "}
                        <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">
                          {telegramDiagnostic.webhook?.url || "لا يوجد رابط مسجل حالياً"}
                        </code>
                      </div>
                      {telegramDiagnostic.webhook?.allowed_updates && (
                        <div className="sm:col-span-2">
                          <span className="text-muted-foreground">الأحداث المسموح بها:</span>{" "}
                          <span className="font-mono text-[10px]">
                            {telegramDiagnostic.webhook.allowed_updates.join(", ")}
                          </span>
                        </div>
                      )}
                      {telegramDiagnostic.webhook?.last_error_message && (
                        <div className="sm:col-span-2 text-destructive bg-destructive/10 p-2 rounded border border-destructive/20 text-[11px]">
                          <strong>آخر خطأ من تليجرام:</strong> {telegramDiagnostic.webhook.last_error_message}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Group and Commands Guide */}
                <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 text-xs space-y-2.5">
                  <p className="font-bold text-cocoa flex items-center gap-2 text-sm">
                    <Users className="size-4 text-blue-600" />
                    <span>👥 إرسال التنبيهات لجروب الجودة (كل الفريق دفعة واحدة):</span>
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-muted-foreground leading-relaxed">
                    <li>أضف البوت إلى جروب تليجرام الخاص بفريق الجودة أو إدارة الإنتاج.</li>
                    <li>
                      اجعل البوت <strong>مشرفاً (Admin)</strong> في الجروب مع صلاحية إرسال الرسائل.
                    </li>
                    <li>
                      لمعرفة <strong>معرّف الجروب (Chat ID)</strong>: أضف بوت <code>@userinfobot</code> أو <code>@RawDataBot</code> للجروب، وانسخ الـ ID (يبدأ دائماً برقم سالب مثل: <code>-1002345678901</code>).
                    </li>
                    <li>
                      الصق معرّف الجروب في حقل <strong>Chat ID</strong> أعلاه واضغط <strong>حفظ</strong>. سيتم إرسال كافة التنبيهات للجروب كاملاً!
                    </li>
                  </ol>

                  <div className="border-t border-blue-500/20 pt-2.5 space-y-1">
                    <p className="font-bold text-cocoa text-xs flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-blue-600" />
                      <span>🧠 قدرات البوت التشغيلية والرد الذكي:</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      يدعم البوت الأوامر الفورية، الكلمات المفردة، والأزرار السريعة لاعتماد وفك الحجر وصرف الإنتاج:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] font-mono text-cocoa pt-1">
                      <div className="rounded bg-card/80 p-1.5 border border-border/60">
                        <span className="font-bold text-amber-600">/morning</span> أو "صباح الخير" : نشرة وردية الصباح
                      </div>
                      <div className="rounded bg-card/80 p-1.5 border border-border/60">
                        <span className="font-bold text-orange-600">/lowstock</span> أو "نواقص" : كشف نقص المخزون
                      </div>
                      <div className="rounded bg-card/80 p-1.5 border border-border/60">
                        <span className="font-bold text-brand">/status</span> أو "تقرير" : ملخص شامل للمخزون
                      </div>
                      <div className="rounded bg-card/80 p-1.5 border border-border/60">
                        <span className="font-bold text-red-600">/urgent</span> أو "حرج" : الخامات الحرجة فوراً
                      </div>
                      <div className="rounded bg-card/80 p-1.5 border border-border/60">
                        <span className="font-bold text-emerald-600">/fefo</span> أو "صرف" : أولوية الصرف #1
                      </div>
                      <div className="rounded bg-card/80 p-1.5 border border-border/60">
                        <span className="font-bold text-blue-600">/qc</span> أو "حجر" : شحنات الحجر الصحي
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notification Channel Selection */}
              <div className="space-y-3 border-t pt-5">
                <Label className="text-sm font-semibold text-cocoa">{t("notifyChannel")}</Label>
                <Select
                  value={notifyChannel}
                  onValueChange={(val) => setNotifyChannel(val as "both" | "whatsapp" | "telegram")}
                >
                  <SelectTrigger className="w-full sm:w-80">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">{t("channelBoth")}</SelectItem>
                    <SelectItem value="whatsapp">{t("channelWhatsApp")}</SelectItem>
                    <SelectItem value="telegram">{t("channelTelegram")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t pt-4">
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-brand text-white hover:bg-brand/90"
                >
                  {saving ? t("saving") : t("save")}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Tab 2: Warning Thresholds */}
        {activeTab === "thresholds" && (
          <form
            onSubmit={save}
            className="space-y-5 rounded-xl border bg-card p-5 sm:p-6 shadow-sm"
          >
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-cocoa flex items-center gap-2">
                <Clock className="size-5 text-brand" />
                {t("thresholds")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {lang === "ar"
                  ? "تحديد عدد الأيام المتبقية لبدء إرسال التنبيهات المبكرة والمتوسطة والحرجة."
                  : "Configure when early, medium, and critical expiry warnings trigger."}
              </p>
            </div>

            {!isAdmin && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-300 flex items-center gap-2">
                <ShieldAlert className="size-4 shrink-0" />
                <span>{t("adminOnly")}</span>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="early">{t("thresholdEarly")}</Label>
                <Input
                  id="early"
                  type="number"
                  min="1"
                  disabled={!isAdmin}
                  value={early}
                  onChange={(e) => setEarly(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="medium">{t("thresholdMedium")}</Label>
                <Input
                  id="medium"
                  type="number"
                  min="1"
                  disabled={!isAdmin}
                  value={medium}
                  onChange={(e) => setMedium(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="critical">{t("thresholdCritical")}</Label>
                <Input
                  id="critical"
                  type="number"
                  min="1"
                  disabled={!isAdmin}
                  value={critical}
                  onChange={(e) => setCritical(e.target.value)}
                />
              </div>
            </div>

            {isAdmin && (
              <div className="border-t pt-4">
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-brand text-white hover:bg-brand/90"
                >
                  {saving ? t("saving") : t("save")}
                </Button>
              </div>
            )}
          </form>
        )}

        {/* Tab 3: Team Management */}
        {activeTab === "team" && isAdmin && (
          <AppErrorBoundary fallbackTitle={lang === "ar" ? "تعذر تحميل قسم إدارة الفريق والمستخدمين" : "Failed to load Team Management"}>
            <TeamManagement currentUserId={session?.user?.id} />
          </AppErrorBoundary>
        )}

        {/* Tab 4: Smart Backup & Restore */}
        {activeTab === "backup" && (
          <AppErrorBoundary fallbackTitle={lang === "ar" ? "تعذر تحميل قسم النسخ الاحتياطي" : "Failed to load Backup Manager"}>
            <BackupRestoreManager />
          </AppErrorBoundary>
        )}

        {/* Tab 5: Master Admin Control Hub */}
        {activeTab === "admin_hub" && isAdmin && (
          <AppErrorBoundary fallbackTitle={lang === "ar" ? "تعذر تحميل لوحة تحكم المسؤول" : "Failed to load Admin Control Hub"}>
            <AdminControlHub />
          </AppErrorBoundary>
        )}

        <WhatsAppShareDialog
          open={whatsAppDialogOpen}
          onOpenChange={setWhatsAppDialogOpen}
          defaultPhone={phone}
          customText={
            "🍫 *Vienna Expiry Tracker* 🍫\n" +
            "رسالة تجريبية لتأكيد عمل الإرسال والمشاركة عبر واتساب بنجاح ✅\n" +
            "تاريخ الإرسال: " +
            new Date().toLocaleString(lang === "ar" ? "ar-EG" : "en-US")
          }
        />
      </main>

      <MobileBottomNav />
    </div>
  );
}
