import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useSettings, settingsQueryKey } from "@/hooks/use-settings";
import {
  sendTestWhatsApp,
  sendTestTelegram,
  triggerExpiryCheckNow,
  registerTelegramBotWebhook,
} from "@/lib/whatsapp.functions";
import { buildDirectWhatsAppUrl } from "@/lib/whatsapp.shared";
import { AppHeader } from "@/components/AppHeader";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { TeamManagement } from "@/components/TeamManagement";
import { WhatsAppShareDialog } from "@/components/WhatsAppShareDialog";
import { BackupRestoreManager } from "@/components/BackupRestoreManager";
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

export const Route = createFileRoute("/_authenticated/settings")({
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

type SettingsTab = "alerts" | "thresholds" | "team" | "backup";

function SettingsPage() {
  const { t, lang } = useI18n();
  const { session, isAdmin } = useAuth();
  const settings = useSettings();
  const queryClient = useQueryClient();

  const sendWaTest = useServerFn(sendTestWhatsApp);
  const sendTgTest = useServerFn(sendTestTelegram);
  const runCheckNow = useServerFn(triggerExpiryCheckNow);
  const registerWebhook = useServerFn(registerTelegramBotWebhook);

  const [activeTab, setActiveTab] = useState<SettingsTab>("alerts");

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
  const [triggering, setTriggering] = useState(false);
  const [callmebotDiagnostic, setCallmebotDiagnostic] = useState<string | null>(null);
  const [whatsAppDialogOpen, setWhatsAppDialogOpen] = useState(false);

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
  }, [settings.data]);

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
      const res = await registerWebhook({ data: { botToken: tgToken } });
      if (res.success) {
        toast.success(
          "تم تفعيل الرد التلقائي الذكي للبوت بنجاح! 🎉 يمكنك الآن مراسلة البوت وسؤاله في الخاص أو في الجروب وسيجيبك فوراً.",
          { duration: 8000 },
        );
      } else {
        toast.error(res.error || "فشل تفعيل الـ Webhook مع سيرفر تليجرام.");
      }
    } catch (err: any) {
      toast.error(err?.message || "حدث خطأ أثناء تفعيل الرد الذكي.");
    } finally {
      setActivatingWebhook(false);
    }
  };

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
                    <span>{activatingWebhook ? "جارٍ التفعيل..." : "⚡ تفعيل الرد الذكي للبوت (Webhook)"}</span>
                  </Button>
                </div>

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
                      <span>🧠 قدرات البوت الذكي (بعد الضغط على تفعيل الرد الذكي):</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      يمكنك أو لأي عضو في الجروب كتابة أي أمر للبوت وسيقوم بالرد الفوري من قاعدة البيانات:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] font-mono text-cocoa pt-1">
                      <div className="rounded bg-card/80 p-1.5 border border-border/60">
                        <span className="font-bold text-brand">/status</span> أو "تقرير" : ملخص شامل للمخزون
                      </div>
                      <div className="rounded bg-card/80 p-1.5 border border-border/60">
                        <span className="font-bold text-red-600">/urgent</span> أو "طوارئ" : الخامات الحرجة فوراً
                      </div>
                      <div className="rounded bg-card/80 p-1.5 border border-border/60">
                        <span className="font-bold text-amber-600">/qc</span> أو "حجر" : شحنات الحجر الصحي
                      </div>
                      <div className="rounded bg-card/80 p-1.5 border border-border/60">
                        <span className="font-bold text-blue-600">/search &lt;اسم&gt;</span> : تفاصيل أي صنف أو تشغيلة
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
        {activeTab === "team" && isAdmin && <TeamManagement currentUserId={session?.user?.id} />}

        {/* Tab 4: Smart Backup & Restore */}
        {activeTab === "backup" && <BackupRestoreManager />}

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
