import { useState } from "react";
import { Lock, Key } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { settingsQueryKey } from "@/hooks/use-settings";

interface AppLockBannerProps {
  isLocked: boolean;
}

export function AppLockBanner({ isLocked }: AppLockBannerProps) {
  const { lang } = useI18n();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [unlocking, setUnlocking] = useState(false);

  if (!isLocked || !isAdmin) return null;

  const handleUnlock = async () => {
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
      toast.success(lang === "ar" ? "تم فتح التطبيق للجميع بنجاح" : "Application unlocked for all users");
    } catch (err) {
      console.error(err);
      toast.error(lang === "ar" ? "فشل فتح التطبيق" : "Failed to unlock");
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold shadow-md flex flex-wrap items-center justify-between gap-2 border-b border-amber-600">
      <div className="flex items-center gap-2">
        <div className="flex size-6 items-center justify-center rounded-full bg-slate-950 text-amber-400">
          <Lock className="size-3.5" />
        </div>
        <span>
          {lang === "ar"
            ? "تنبيه إداري: التطبيق مقفل حالياً لجميع المستخدمين (وضع الصيانة والجرد). أنت تعمل بصفة مسؤول."
            : "Admin Notice: Application is currently locked for all users. You are browsing in Admin bypass mode."}
        </span>
      </div>

      <Button
        type="button"
        size="sm"
        onClick={handleUnlock}
        disabled={unlocking}
        className="h-7 px-3 bg-slate-950 hover:bg-slate-900 text-white font-bold text-xs gap-1.5 shadow-sm rounded-lg"
      >
        <Key className="size-3 text-amber-400" />
        <span>{unlocking ? (lang === "ar" ? "جارٍ الفتح..." : "Unlocking...") : (lang === "ar" ? "إلغاء القفل الآن" : "Unlock Now")}</span>
      </Button>
    </div>
  );
}
