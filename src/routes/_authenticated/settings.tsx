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
} from "@/lib/whatsapp.functions";
import { buildDirectWhatsAppUrl } from "@/lib/whatsapp.shared";
import { AppHeader } from "@/components/AppHeader";
import { TeamManagement } from "@/components/TeamManagement";
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

function SettingsPage() {
  const { t, lang } = useI18n();
  const { session, isAdmin } = useAuth();
  const settings = useSettings();
  const queryClient = useQueryClient();

  const sendWaTest = useServerFn(sendTestWhatsApp);
  const sendTgTest = useServerFn(sendTestTelegram);
  const runCheckNow = useServerFn(triggerExpiryCheckNow);

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
  const [triggering, setTriggering] = useState(false);
  const [callmebotDiagnostic, setCallmebotDiagnostic] = useState<string | null>(null);

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
      const { error } = await supabase.from("app_settings").upsert({
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
      });
      if (error) throw error;
      toast.success(t("saved"));
      void queryClient.invalidateQueries({ queryKey: settingsQueryKey });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errGeneric"));
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("errGeneric");
      setCallmebotDiagnostic(msg);
      toast.error(msg);
    } finally {
      setTestingWa(false);
    }
  };

  const openDirectWhatsApp = () => {
    const testMsg =
      "🍫 *Vienna Expiry Tracker* 🍫\n" +
      "رسالة تجريبية لتأكيد عمل الإرسال المباشر عبر واتساب بنجاح ✅\n" +
      "تاريخ الإرسال: " +
      new Date().toLocaleString(lang === "ar" ? "ar-EG" : "en-US");
    const url = buildDirectWhatsAppUrl(phone, testMsg);
    window.open(url, "_blank");
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errGeneric"));
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
        toast.error(res.error ?? t("errGeneric"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errGeneric"));
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        {isAdmin && <TeamManagement currentUserId={session?.user?.id} />}

        {/* Manual Instant Trigger Card */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border bg-gradient-to-r from-amber-500/10 via-brand/10 to-amber-500/5 p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-cocoa flex items-center gap-2">
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
            className="shrink-0 gap-2 bg-brand hover:bg-brand/90 text-white shadow-sm"
          >
            <PlayCircle className="size-4" />
            {triggering ? t("triggeringCheck") : t("triggerCheckNow")}
          </Button>
        </div>

        <form onSubmit={save} className="space-y-6 rounded-xl border bg-card p-6 shadow-sm">
          {/* Section 1: WhatsApp Settings */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-semibold text-cocoa flex items-center gap-2">
                  <MessageCircle className="size-5 text-[#25D366]" />
                  {t("whatsappSettings")}
                </h1>
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
                  <span>{lang === "ar" ? "تشخيص سيرفر CallMeBot:" : "CallMeBot Server Diagnostic:"}</span>
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

          {/* Section 2: Telegram Bot Settings */}
          <div className="space-y-4 border-t pt-5">
            <div>
              <h2 className="text-lg font-semibold text-cocoa flex items-center gap-2">
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

            <div className="flex items-center gap-2 pt-1">
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
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-cocoa">
                {lang === "ar" ? "كيفية إعداد بوت تليجرام في دقيقة واحدة:" : "How to set up Telegram Bot in 1 minute:"}
              </p>
              <ol className="list-decimal list-inside space-y-0.5 text-[11px]">
                <li>{lang === "ar" ? "تحدث مع @BotFather على تليجرام واكتب /newbot لإنشاء بوتك والحصول على الـ Token." : "Message @BotFather on Telegram, send /newbot to create your bot and copy the Token."}</li>
                <li>{lang === "ar" ? "أرسل أي رسالة للبوت الجديد، ثم افتح @userinfobot لمعرفة الـ Chat ID الخاص بك أو أضف البوت لمجموعة وانسخ ID المجموعة." : "Message your new bot, then open @userinfobot to get your Chat ID, or add the bot to your team group."}</li>
                <li>{lang === "ar" ? "الصق الـ Token والـ Chat ID هنا واضغط 'إرسال تجربة'." : "Paste the Token and Chat ID above and click 'Send Telegram Test'."}</li>
              </ol>
            </div>
          </div>

          {/* Section 3: Notification Channel Selection */}
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

          {/* Section 4: Warning Thresholds */}
          <div className="space-y-3 border-t pt-5">
            <h2 className="text-sm font-semibold text-cocoa">{t("thresholds")}</h2>
            {!isAdmin && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <ShieldAlert className="size-3.5 text-amber-600" />
                {t("adminOnly")}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
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
          </div>

          {/* Submit Button */}
          <div className="border-t pt-4 flex flex-wrap gap-2">
            <Button type="submit" disabled={saving} className="bg-brand text-white hover:bg-brand/90">
              {saving ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
