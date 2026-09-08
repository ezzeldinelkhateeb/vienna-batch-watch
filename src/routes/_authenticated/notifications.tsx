import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { AppHeader } from "@/components/AppHeader";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications log — Vienna Expiry Tracker" },
      {
        name: "description",
        content: "History of WhatsApp expiry alerts sent for Vienna raw materials.",
      },
      { property: "og:title", content: "Notifications log — Vienna Expiry Tracker" },
      { property: "og:description", content: "History of WhatsApp expiry alerts sent." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { t } = useI18n();

  const logs = useQuery({
    queryKey: ["notification_log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <h1 className="mb-4 text-lg font-semibold text-cocoa">{t("notificationsLog")}</h1>
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          {logs.isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">{t("loading")}</p>
          ) : logs.isError ? (
            <p className="p-6 text-sm text-destructive">{t("errGeneric")}</p>
          ) : (logs.data ?? []).length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">{t("noLogs")}</p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/60">
                <tr>
                  {["sentAt", "item", "status", "message", "result"].map((k) => (
                    <th key={k} className="px-3 py-2 text-start font-semibold text-cocoa">
                      {t(k as never)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(logs.data ?? []).map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-medium">{row.item_name}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="max-w-[22rem] px-3 py-2 text-muted-foreground">
                      {row.message || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className={row.success ? "text-status-green" : "text-destructive"}>
                        {row.success ? t("success") : `${t("failed")}: ${row.error ?? ""}`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
