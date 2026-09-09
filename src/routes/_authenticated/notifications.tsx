import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Copy,
  Check,
  Eye,
  MessageCircle,
  PlayCircle,
  RefreshCw,
  Search,
  Send,
  XCircle,
  Bell,
  Clock,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { triggerExpiryCheckNow } from "@/lib/whatsapp.functions";
import { AppHeader } from "@/components/AppHeader";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications log — Vienna Expiry Tracker" },
      {
        name: "description",
        content: "History of WhatsApp and Telegram expiry alerts sent for Vienna raw materials.",
      },
      { property: "og:title", content: "Notifications log — Vienna Expiry Tracker" },
      { property: "og:description", content: "History of WhatsApp and Telegram alerts sent." },
    ],
  }),
  component: NotificationsPage,
});

interface NotificationRow {
  id: string;
  created_at: string;
  item_name: string;
  status: string;
  message: string | null;
  success: boolean;
  error?: string | null;
  channel?: string | null;
}

function formatRelativeTime(dateStr: string, lang: string): string {
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHrs = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (lang === "ar") {
      if (diffSec < 60) return "الآن";
      if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
      if (diffHrs < 24) return `منذ ${diffHrs} ساعة`;
      return `منذ ${diffDays} يوم`;
    } else {
      if (diffSec < 60) return "just now";
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHrs < 24) return `${diffHrs}h ago`;
      return `${diffDays}d ago`;
    }
  } catch {
    return dateStr;
  }
}

function NotificationsPage() {
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const runCheck = useServerFn(triggerExpiryCheckNow);

  const [channelFilter, setChannelFilter] = useState<"all" | "whatsapp" | "telegram">("all");
  const [resultFilter, setResultFilter] = useState<"all" | "success" | "failed">("all");
  const [search, setSearch] = useState("");
  const [triggering, setTriggering] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<NotificationRow | null>(null);
  const [copied, setCopied] = useState(false);

  const logs = useQuery({
    queryKey: ["notification_log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });

  const allLogs = logs.data ?? [];

  // Summary counts
  const totalCount = allLogs.length;
  const successCount = allLogs.filter((r) => r.success).length;
  const failedCount = allLogs.filter((r) => !r.success).length;

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allLogs.filter((row) => {
      const matchesChannel =
        channelFilter === "all" || (row.channel ?? "whatsapp").toLowerCase() === channelFilter;
      const matchesResult =
        resultFilter === "all" || (resultFilter === "success" ? row.success : !row.success);
      const matchesSearch =
        q === "" ||
        row.item_name.toLowerCase().includes(q) ||
        (row.message ?? "").toLowerCase().includes(q) ||
        (row.error ?? "").toLowerCase().includes(q) ||
        row.status.toLowerCase().includes(q);

      return matchesChannel && matchesResult && matchesSearch;
    });
  }, [allLogs, channelFilter, resultFilter, search]);

  const handleManualCheck = async () => {
    setTriggering(true);
    try {
      const res = await runCheck();
      if (res.success) {
        toast.success(
          t("checkCompleted", {
            checked: res.checked,
            sent: res.totalSent ?? 0,
            wa: res.sentWhatsApp ?? 0,
            tg: res.sentTelegram ?? 0,
          }),
          { duration: 6000 },
        );
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

  const handleCopyMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(t("copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("errGeneric"));
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 space-y-5 pb-24 md:pb-10">
        {/* Top Header & Fast Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <Bell className="size-4" />
              </div>
              <h1 className="text-xl font-bold text-cocoa">{t("notificationsLog")}</h1>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {lang === "ar"
                ? "سجل إرسال تنبيهات واتساب وتيليجرام للمواد الخام الموشكة على الانتهاء."
                : "Live history of automated WhatsApp and Telegram raw material alerts."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void queryClient.invalidateQueries({ queryKey: ["notification_log"] })}
              disabled={logs.isFetching}
              className="gap-1.5 text-xs h-9"
              title={t("refresh")}
            >
              <RefreshCw className={`size-3.5 ${logs.isFetching ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{t("refresh")}</span>
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleManualCheck}
              disabled={triggering}
              className="gap-1.5 bg-brand text-white hover:bg-brand/90 text-xs shadow-sm h-9"
            >
              <PlayCircle className="size-3.5" />
              {triggering ? t("triggeringCheck") : t("triggerCheckNow")}
            </Button>
          </div>
        </div>

        {/* Interactive Stats Cards */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          <button
            type="button"
            onClick={() => setResultFilter("all")}
            className={`rounded-xl border p-3 text-start transition-all shadow-xs hover:shadow-md ${
              resultFilter === "all"
                ? "border-brand ring-2 ring-brand/30 bg-card"
                : "border-border/80 bg-card hover:border-brand/40"
            }`}
          >
            <p className="text-[11px] sm:text-xs text-muted-foreground font-medium truncate">
              {t("notificationsStatsTotal")}
            </p>
            <p className="mt-1 text-xl sm:text-2xl font-bold text-cocoa">{totalCount}</p>
          </button>

          <button
            type="button"
            onClick={() => setResultFilter(resultFilter === "success" ? "all" : "success")}
            className={`rounded-xl border p-3 text-start transition-all shadow-xs hover:shadow-md ${
              resultFilter === "success"
                ? "border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-500/5"
                : "border-border/80 bg-card hover:border-emerald-500/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] sm:text-xs text-muted-foreground font-medium truncate">
                {t("notificationsStatsSuccess")}
              </p>
              <span className="size-2 rounded-full bg-emerald-500" />
            </div>
            <p className="mt-1 text-xl sm:text-2xl font-bold text-emerald-600">{successCount}</p>
          </button>

          <button
            type="button"
            onClick={() => setResultFilter(resultFilter === "failed" ? "all" : "failed")}
            className={`rounded-xl border p-3 text-start transition-all shadow-xs hover:shadow-md ${
              resultFilter === "failed"
                ? "border-destructive ring-2 ring-destructive/30 bg-destructive/5"
                : "border-border/80 bg-card hover:border-destructive/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] sm:text-xs text-muted-foreground font-medium truncate">
                {t("notificationsStatsFailed")}
              </p>
              <span className="size-2 rounded-full bg-destructive" />
            </div>
            <p className="mt-1 text-xl sm:text-2xl font-bold text-destructive">{failedCount}</p>
          </button>
        </div>

        {/* Search & Filters Toolbar */}
        <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder={t("notificationsSearch")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ps-9 text-xs sm:text-sm h-9"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Channel Filter */}
            <Select
              value={channelFilter}
              onValueChange={(v) => setChannelFilter(v as "all" | "whatsapp" | "telegram")}
            >
              <SelectTrigger className="w-36 h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allChannels")}</SelectItem>
                <SelectItem value="whatsapp">🟢 {t("channelBadgeWhatsapp")}</SelectItem>
                <SelectItem value="telegram">🔵 {t("channelBadgeTelegram")}</SelectItem>
              </SelectContent>
            </Select>

            {/* Result Filter */}
            <Select
              value={resultFilter}
              onValueChange={(v) => setResultFilter(v as "all" | "success" | "failed")}
            >
              <SelectTrigger className="w-32 h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allResults")}</SelectItem>
                <SelectItem value="success">✅ {t("success")}</SelectItem>
                <SelectItem value="failed">❌ {t("failed")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Content View: Mobile Cards (< 768px) and Desktop Table (>= 768px) */}
        {logs.isLoading ? (
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground shadow-sm">
            <RefreshCw className="mx-auto mb-2 size-5 animate-spin text-brand" />
            {t("loading")}
          </div>
        ) : logs.isError ? (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-destructive shadow-sm">
            {t("errGeneric")}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground shadow-sm">
            <Bell className="mx-auto mb-2 size-8 text-muted-foreground/40" />
            <p className="font-medium text-foreground">{t("noLogs")}</p>
            <p className="mt-1 text-xs">{t("noResults")}</p>
          </div>
        ) : (
          <>
            {/* MOBILE CARDS VIEW (Clean, touch-friendly, native app feel) */}
            <div className="grid grid-cols-1 gap-3 md:hidden">
              {filteredLogs.map((row) => {
                const channel = (row.channel ?? "whatsapp").toLowerCase();
                const isTelegram = channel === "telegram";
                return (
                  <div
                    key={row.id}
                    onClick={() => setSelectedAlert(row)}
                    className="relative flex flex-col justify-between rounded-xl border bg-card p-3.5 shadow-xs transition-all active:scale-[0.99] border-border/80 hover:border-brand/50"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 border-b pb-2 mb-2">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                              isTelegram
                                ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20"
                                : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                            }`}
                          >
                            {isTelegram ? (
                              <Send className="size-3 text-[#229ED9]" />
                            ) : (
                              <MessageCircle className="size-3 text-[#25D366]" />
                            )}
                            {isTelegram ? t("channelBadgeTelegram") : t("channelBadgeWhatsapp")}
                          </span>

                          <span className="text-[11px] font-mono rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                            {row.status}
                          </span>
                        </div>

                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock className="size-3" />
                          {formatRelativeTime(row.created_at, lang)}
                        </span>
                      </div>

                      <h3 className="font-semibold text-cocoa text-sm">{row.item_name}</h3>

                      {row.message && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2 bg-muted/40 p-2 rounded-md font-mono">
                          {row.message}
                        </p>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between pt-1 text-xs">
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          row.success ? "text-emerald-600" : "text-destructive"
                        }`}
                      >
                        {row.success ? (
                          <>
                            <CheckCircle2 className="size-3.5" />
                            {t("success")}
                          </>
                        ) : (
                          <>
                            <XCircle className="size-3.5" />
                            <span className="truncate max-w-[14rem]">
                              {row.error ? row.error.slice(0, 35) : t("failed")}
                            </span>
                          </>
                        )}
                      </span>

                      <span className="text-[11px] text-brand font-medium flex items-center gap-1">
                        <Eye className="size-3" />
                        {t("viewAlertDetails")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DESKTOP TABLE VIEW (Full data, sticky header, hover rows) */}
            <div className="hidden md:block overflow-x-auto rounded-xl border bg-card shadow-sm">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-xs text-start">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold text-cocoa">{t("sentAt")}</th>
                    <th className="px-4 py-3 text-start font-semibold text-cocoa">
                      {t("channel")}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold text-cocoa">{t("item")}</th>
                    <th className="px-4 py-3 text-start font-semibold text-cocoa">{t("status")}</th>
                    <th className="px-4 py-3 text-start font-semibold text-cocoa">
                      {t("message")}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold text-cocoa">{t("result")}</th>
                    <th className="px-4 py-3 text-start font-semibold text-cocoa">
                      {t("actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredLogs.map((row) => {
                    const channel = (row.channel ?? "whatsapp").toLowerCase();
                    const isTelegram = channel === "telegram";
                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedAlert(row)}
                        className="hover:bg-muted/30 transition-colors cursor-pointer group"
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                          <div>{new Date(row.created_at).toLocaleDateString()}</div>
                          <div className="text-[10px] text-muted-foreground/70">
                            {new Date(row.created_at).toLocaleTimeString()} (
                            {formatRelativeTime(row.created_at, lang)})
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                              isTelegram
                                ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20"
                                : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                            }`}
                          >
                            {isTelegram ? (
                              <Send className="size-3 text-[#229ED9]" />
                            ) : (
                              <MessageCircle className="size-3 text-[#25D366]" />
                            )}
                            {isTelegram ? t("channelBadgeTelegram") : t("channelBadgeWhatsapp")}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-cocoa">{row.item_name}</td>
                        <td className="px-4 py-3 text-xs font-mono">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                            {row.status}
                          </span>
                        </td>
                        <td className="max-w-[22rem] px-4 py-3 text-xs text-muted-foreground truncate font-mono">
                          {row.message || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-semibold ${
                              row.success ? "text-emerald-600" : "text-destructive"
                            }`}
                          >
                            {row.success ? (
                              <>
                                <CheckCircle2 className="size-3.5" />
                                {t("success")}
                              </>
                            ) : (
                              <>
                                <XCircle className="size-3.5" />
                                <span title={row.error ?? ""}>
                                  {t("failed")}: {row.error ? row.error.slice(0, 30) : ""}
                                </span>
                              </>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-brand group-hover:bg-brand/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAlert(row);
                            }}
                          >
                            <Eye className="size-3.5 me-1" />
                            {t("viewAlertDetails")}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {/* Alert Message Details Dialog */}
      <Dialog open={!!selectedAlert} onOpenChange={(open) => !open && setSelectedAlert(null)}>
        <DialogContent className="max-w-lg p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-cocoa">
              <Bell className="size-5 text-brand" />
              {t("notificationDetails")}
            </DialogTitle>
          </DialogHeader>

          {selectedAlert && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-3 text-xs">
                <div>
                  <span className="text-muted-foreground block">{t("item")}</span>
                  <span className="font-semibold text-cocoa">{selectedAlert.item_name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">{t("channel")}</span>
                  <span className="font-semibold">
                    {(selectedAlert.channel ?? "whatsapp").toUpperCase()}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">{t("sentAt")}</span>
                  <span>{new Date(selectedAlert.created_at).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">{t("result")}</span>
                  <span
                    className={`font-semibold ${
                      selectedAlert.success ? "text-emerald-600" : "text-destructive"
                    }`}
                  >
                    {selectedAlert.success ? t("success") : t("failed")}
                  </span>
                </div>
              </div>

              {selectedAlert.error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  <span className="font-semibold block mb-1">{t("failed")}:</span>
                  <p className="font-mono">{selectedAlert.error}</p>
                </div>
              )}

              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground font-medium block">
                  {t("message")}
                </span>
                <div className="relative rounded-lg border bg-muted/30 p-3 text-xs font-mono leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap select-all">
                  {selectedAlert.message || "—"}
                </div>
              </div>

              <DialogFooter className="gap-2 sm:justify-between">
                {selectedAlert.message && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => handleCopyMessage(selectedAlert.message ?? "")}
                  >
                    {copied ? (
                      <Check className="size-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    {copied ? t("copied") : t("copyMessage")}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedAlert(null)}
                >
                  {t("close")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <MobileBottomNav />
    </div>
  );
}
