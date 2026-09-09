import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/inventory" });
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
        <div className="rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-md">
          <div className="text-center sm:text-start mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-cocoa">{t("loginTitle")}</h1>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{t("loginSubtitle")}</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("email")}</Label>
              <div className="relative">
                <Mail className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="name@vienna.com"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="ps-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">{t("password")}</Label>
              <div className="relative">
                <Lock className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="ps-9 pe-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded-md transition-colors"
                  title={t("togglePassword")}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-brand hover:bg-brand/90 text-white shadow-sm mt-2"
              disabled={busy}
            >
              {busy ? t("loading") : t("signIn")}
            </Button>
          </form>

          <div className="mt-6 rounded-lg border border-border/60 bg-muted/30 p-3 text-center text-xs text-muted-foreground">
            {lang === "ar"
              ? "🔒 تسجيل الموظفين والحسابات الجديدة يتم حصرياً عبر مدير النظام (Admin) من داخل التطبيق."
              : "🔒 Employee and new account registration is managed exclusively by the System Administrator (Admin)."}
          </div>
        </div>
      </main>
    </div>
  );
}
