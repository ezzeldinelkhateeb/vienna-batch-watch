import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useSettings, settingsQueryKey } from "@/hooks/use-settings";
import { sendTestWhatsApp } from "@/lib/whatsapp.functions";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { TeamManagement } from "@/components/TeamManagement";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Vienna Expiry Tracker" },
      {
        name: "description",
        content: "Configure WhatsApp alerts and warning thresholds for expiry tracking.",
      },
      { property: "og:title", content: "Settings — Vienna Expiry Tracker" },
      {
        name: "property",
        content: "WhatsApp alert credentials and warning thresholds.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useI18n();
  const { session, isAdmin } = useAuth();
  const settings = useSettings();
  const queryClient = useQueryClient();
  const sendTest = useServerFn(sendTestWhatsApp);

  const [phone, setPhone] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [early, setEarly] = useState("90");
  const [medium, setMedium] = useState("60");
  const [critical, setCritical] = useState("30");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setPhone(settings.data.whatsapp_phone ?? "");
    setApiKey(settings.data.callmebot_apikey ?? "");
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

  const test = async () => {
    if (!phone.trim() || !apiKey.trim()) {
      toast.error(t("errMissingWhatsapp"));
      return;
    }
    setTesting(true);
    try {
      const result = await sendTest();
      if (result.success) toast.success(t("testSent"));
      else toast.error(result.error ?? t("errGeneric"));
    } catch {
      toast.error(t("errGeneric"));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6 sm:px-6">
        {isAdmin && <TeamManagement currentUserId={session?.user?.id} />}

        <form onSubmit={save} className="space-y-5 rounded-xl border bg-card p-5 shadow-sm">
          <div>
            <h1 className="text-lg font-semibold text-cocoa">{t("whatsappSettings")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("callmebotHint")}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">{t("phone")}</Label>
            <Input
              id="phone"
              dir="ltr"
              placeholder="+201234567890"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="apikey">{t("apiKey")}</Label>
            <Input
              id="apikey"
              dir="ltr"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          <div className="space-y-3 border-t pt-4">
            <h2 className="text-sm font-semibold text-cocoa">{t("thresholds")}</h2>
            {!isAdmin && <p className="text-xs text-muted-foreground">{t("adminOnly")}</p>}
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

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? t("saving") : t("save")}
            </Button>
            <Button type="button" variant="outline" onClick={test} disabled={testing}>
              {testing ? t("sending") : t("sendTest")}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
