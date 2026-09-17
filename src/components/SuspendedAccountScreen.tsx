import { useState } from "react";
import { UserX, RefreshCw, LogOut, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function SuspendedAccountScreen() {
  const { lang } = useI18n();
  const { user, signOut } = useAuth();
  const [checking, setChecking] = useState(false);

  const handleRefresh = () => {
    setChecking(true);
    toast.info(lang === "ar" ? "جارٍ التحقق من حالة الحساب…" : "Checking account status…");
    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-2xl border border-destructive/30 bg-card p-6 text-center shadow-2xl space-y-5">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/15 text-destructive ring-8 ring-destructive/10">
          <UserX className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>{lang === "ar" ? "حساب موقوف مؤقتاً" : "Account Suspended"}</span>
          </div>

          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {lang === "ar" ? "تم إيقاف صلاحية هذا الحساب مؤقتاً" : "Your Account Has Been Suspended"}
          </h1>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {lang === "ar"
              ? "تم تجميد صلاحية الدخول لهذا الحساب مؤقتاً من قِبل إدارة النظام. لن تتمكن من الوصول للبيانات أو إجراء أي عمليات حتى تتم إعادة تنشيط حسابك من قِبل الآدمن الرئيسي."
              : "Access for this account has been temporarily suspended by system administrators. Please contact the primary administrator to restore your access."}
          </p>
        </div>

        {user?.email && (
          <div className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{user.email}</span>
          </div>
        )}

        <div className="flex flex-col gap-2 pt-2">
          <Button
            variant="default"
            onClick={handleRefresh}
            disabled={checking}
            className="w-full gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
            {lang === "ar" ? "إعادة التحقق من التنشيط" : "Check Activation Status"}
          </Button>

          <Button
            variant="outline"
            onClick={() => void signOut().then(() => { window.location.href = "/auth"; })}
            className="w-full gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
            {lang === "ar" ? "تسجيل الخروج" : "Sign Out"}
          </Button>
        </div>
      </div>
    </div>
  );
}
