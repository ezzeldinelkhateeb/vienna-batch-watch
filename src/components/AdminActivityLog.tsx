import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  History,
  Search,
  Filter,
  RefreshCw,
  PlusCircle,
  Pencil,
  Trash2,
  Factory,
  ShieldCheck,
  Lock,
  Settings,
  User,
  Clock,
  ArrowRight,
  Info,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ActivityLogRow {
  id: string;
  created_at: string;
  user_id: string | null;
  user_email: string | null;
  action_type: string;
  entity_id: string | null;
  entity_name: string | null;
  details: Record<string, any>;
  ip_address: string | null;
  user_agent: string | null;
}

const ACTION_METAS: Record<
  string,
  { label_ar: string; label_en: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  item_create: {
    label_ar: "إضافة صنف/تشغيلة",
    label_en: "Item Created",
    color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    icon: PlusCircle,
  },
  item_update: {
    label_ar: "تعديل صنف",
    label_en: "Item Updated",
    color: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
    icon: Pencil,
  },
  item_delete: {
    label_ar: "حذف صنف",
    label_en: "Item Deleted",
    color: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
    icon: Trash2,
  },
  stock_dispense: {
    label_ar: "صرف لخط الإنتاج",
    label_en: "Dispensed to Production",
    color: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
    icon: Factory,
  },
  qc_status_change: {
    label_ar: "فحص واعتماد جودة",
    label_en: "QC Inspection",
    color: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30",
    icon: ShieldCheck,
  },
  app_lock_toggle: {
    label_ar: "قفل/فتح التطبيق",
    label_en: "App Lock State",
    color: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    icon: Lock,
  },
  settings_update: {
    label_ar: "تعديل الإعدادات",
    label_en: "Settings Changed",
    color: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
    icon: Settings,
  },
};

export function AdminActivityLog() {
  const { lang } = useI18n();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const logsQuery = useQuery({
    queryKey: ["admin_activity_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(150);

      if (error) {
        console.warn("Could not fetch activity logs:", error);
        return [];
      }
      return (data ?? []) as ActivityLogRow[];
    },
    staleTime: 10 * 1000,
  });

  const filteredLogs = useMemo(() => {
    let list = logsQuery.data ?? [];
    if (filterType !== "all") {
      list = list.filter((item) => item.action_type === filterType);
    }
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter(
        (item) =>
          item.entity_name?.toLowerCase().includes(s) ||
          item.user_email?.toLowerCase().includes(s) ||
          item.action_type.toLowerCase().includes(s) ||
          JSON.stringify(item.details).toLowerCase().includes(s)
      );
    }
    return list;
  }, [logsQuery.data, filterType, search]);

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString(lang === "ar" ? "ar-EG" : "en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <History className="size-4 text-brand" />
            <h3 className="text-sm font-bold text-foreground">
              {lang === "ar" ? "سجل تدقيق الأنشطة والتعديلات (Activity Audit Log)" : "Admin Activity Audit Trail"}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {lang === "ar"
              ? "سجل رقابي مشفر يوثق بالدقيقة والثانية كل عمليات إضافة وصرف وتعديل الخامات، وحركات القفل والإعدادات."
              : "Comprehensive tamper-evident log tracking raw material additions, dispenses, QC checks, and settings."}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => logsQuery.refetch()}
          disabled={logsQuery.isFetching}
          className="h-8 gap-1.5 text-xs shrink-0"
        >
          <RefreshCw className={`size-3.5 ${logsQuery.isFetching ? "animate-spin" : ""}`} />
          <span>{lang === "ar" ? "تحديث السجل" : "Refresh"}</span>
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-none">
          <button
            type="button"
            onClick={() => setFilterType("all")}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
              filterType === "all"
                ? "bg-brand text-brand-foreground shadow-xs"
                : "bg-muted/70 text-muted-foreground hover:bg-muted"
            }`}
          >
            {lang === "ar" ? "كل الحركات" : "All Actions"} ({logsQuery.data?.length ?? 0})
          </button>
          {Object.entries(ACTION_METAS).map(([key, meta]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterType(key)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all flex items-center gap-1 ${
                filterType === key
                  ? "bg-brand text-brand-foreground shadow-xs"
                  : "bg-muted/70 text-muted-foreground hover:bg-muted"
              }`}
            >
              <meta.icon className="size-3" />
              <span>{lang === "ar" ? meta.label_ar : meta.label_en}</span>
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute start-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            placeholder={lang === "ar" ? "بحث بالمستخدم، الخامة، التفاصيل..." : "Search user, material..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 ps-8 text-xs"
          />
        </div>
      </div>

      {/* Activity Timeline List */}
      {logsQuery.isLoading ? (
        <div className="rounded-xl border border-border/80 bg-card p-8 text-center text-xs text-muted-foreground">
          {lang === "ar" ? "جاري تحميل سجل الأنشطة..." : "Loading activity log..."}
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-8 text-center">
          <History className="mx-auto size-8 text-muted-foreground/60 mb-2" />
          <p className="text-sm font-bold text-foreground">
            {lang === "ar" ? "لا توجد سجلات مطابقة" : "No activity recorded yet"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {lang === "ar"
              ? "يتم تسجيل كافة الحركات تلقائياً فور قيام أي مستخدم بعملية داخل النظام."
              : "All actions performed by users are logged here in real time."}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/60 rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden">
          {filteredLogs.map((log) => {
            const meta = ACTION_METAS[log.action_type] || {
              label_ar: log.action_type,
              label_en: log.action_type,
              color: "bg-muted text-foreground border-border",
              icon: Info,
            };
            const Icon = meta.icon;
            const isExpanded = expandedId === log.id;

            return (
              <div
                key={log.id}
                className="p-3 sm:p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground border">
                      <Icon className="size-4 text-brand" />
                    </div>

                    <div className="space-y-0.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold border ${meta.color}`}>
                          {lang === "ar" ? meta.label_ar : meta.label_en}
                        </span>
                        {log.entity_name && (
                          <span className="font-bold text-xs sm:text-sm text-foreground truncate">
                            {log.entity_name}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="size-3" />
                          <span className="font-medium text-foreground/80">{log.user_email || "System"}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          <span>{formatTime(log.created_at)}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {log.details && Object.keys(log.details).length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      className="h-7 text-[11px] text-brand self-end sm:self-center"
                    >
                      {isExpanded
                        ? lang === "ar" ? "إخفاء التفاصيل" : "Hide Details"
                        : lang === "ar" ? "عرض التفاصيل" : "View Details"}
                    </Button>
                  )}
                </div>

                {isExpanded && log.details && (
                  <div className="mt-3 p-2.5 rounded-lg bg-muted/60 border border-border/60 text-xs font-mono">
                    <pre className="overflow-x-auto whitespace-pre-wrap break-all text-[11px] text-slate-800 dark:text-slate-200">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
