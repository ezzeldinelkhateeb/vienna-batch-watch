import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Vienna Expiry Tracker" },
      {
        name: "description",
        content:
          "Team sign in for Vienna High Quality Chocolate's raw material expiry tracking system.",
      },
      { property: "og:title", content: "Sign in — Vienna Expiry Tracker" },
      {
        property: "og:description",
        content: "Team sign in for Vienna's raw material expiry tracking system.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/inventory" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/inventory" });
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          toast.success(lang === "ar" ? "تم إنشاء الحساب وتسجيل الدخول بنجاح!" : "Account created and signed in!");
          navigate({ to: "/inventory" });
        } else {
          toast.info(t("checkEmail"), { duration: 6000 });
          setMode("signin");
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errGeneric"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader showNav={false} />
      <main className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex rounded-lg bg-muted p-1 text-sm mb-6">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
                mode === "signin"
                  ? "bg-card text-cocoa shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("signIn")}
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
                mode === "signup"
                  ? "bg-card text-cocoa shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("signUp")}
            </button>
          </div>

          <h1 className="text-xl font-semibold text-cocoa">
            {mode === "signin" ? t("loginTitle") : t("signUp")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? t("loginSubtitle")
              : lang === "ar"
              ? "أنشئ حسابك. الحساب الأول المسجل في النظام يحصل تلقائيًا على صلاحيات مدير النظام (Admin)."
              : "Register your account. The first registered user automatically gains full Admin privileges."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                type="email"
                required
                placeholder="name@vienna.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("password")}</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? t("loading") : mode === "signin" ? t("signIn") : t("signUp")}
            </Button>
          </form>

          {mode === "signup" ? (
            <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
              {lang === "ar"
                ? "💡 ملاحظة: أول حساب يتم تسجيله في قاعدة البيانات يُصبح تلقائياً مسؤول النظام (Admin) ويستطيع التحكم الكامل في الصلاحيات والمخزون."
                : "💡 Note: The very first account registered in the database is automatically granted Admin privileges."}
            </div>
          ) : (
            <div className="mt-6 text-center text-xs text-muted-foreground">
              {t("noAccount")}{" "}
              <button
                type="button"
                onClick={() => setMode("signup")}
                className="font-medium text-cocoa underline underline-offset-4"
              >
                {t("signUp")}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
