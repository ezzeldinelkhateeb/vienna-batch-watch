import { useMemo, useState, useEffect, Fragment } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  ImageIcon,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Printer,
  QrCode,
  Trash2,
  Package as PackageIcon,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertOctagon,
  XCircle,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Archive,
  ArrowUpDown,
  RotateCcw,
  Boxes,
  MapPin,
  X,
} from "lucide-react";
import { buildAlertMessage, buildDirectWhatsAppUrl } from "@/lib/whatsapp.shared";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { signedPhotoUrls, extractAllPhotoPaths, parsePhotos } from "@/lib/photos";
import { countdownText } from "@/lib/format";
import { STATUS_ORDER, STATUS_TINT, daysUntil, statusFor, type Status } from "@/lib/status";
import { AppHeader } from "@/components/AppHeader";
import { StatusLegend } from "@/components/StatusLegend";
import { StatusPill, STATUS_LABEL_KEY, QcBadge, FefoBadge, type QcStatusType } from "@/components/StatusPill";
import { ItemFormDialog, type ItemRow } from "@/components/ItemFormDialog";
import { QuickQcModal } from "@/components/QuickQcModal";
import { BarcodeScannerDialog } from "@/components/BarcodeScannerDialog";
import { QcPrintReportDialog } from "@/components/QcPrintReportDialog";
import { BackupRestoreDialog } from "@/components/BackupRestoreDialog";
import { InventoryKpiOverview } from "@/components/InventoryKpiOverview";
import {
  ProductImageViewerDialog,
  type ProductImageDetails,
} from "@/components/ProductImageViewerDialog";
import { ProductImageThumbnail } from "@/components/ProductImageThumbnail";
import { WhatsAppShareDialog } from "@/components/WhatsAppShareDialog";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SortMode =
  | "alpha"
  | "grouped_materials"
  | "fefo"
  | "quantity_desc"
  | "quantity_asc"
  | "multi_batch";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Vienna Raw Material Expiry Tracker" },
      {
        name: "description",
        content:
          "Track expiry dates of every raw material batch with colour-coded urgency and WhatsApp alerts.",
      },
      { property: "og:title", content: "Inventory — Vienna Expiry Tracker" },
      {
        property: "og:description",
        content: "Colour-coded raw material expiry tracking for Vienna High Quality Chocolate.",
      },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const { t, lang } = useI18n();
  const { isAdmin, canEditItems, canDeleteItems } = useAuth();
  const queryClient = useQueryClient();
  const settings = useSettings();
  const thresholds = settings.data?.thresholds;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [qcFilter, setQcFilter] = useState<"all" | QcStatusType>("all");
  const [fefoOnly, setFefoOnly] = useState(false);
  const [multiBatchOnly, setMultiBatchOnly] = useState(false);
  const [storageFilter, setStorageFilter] = useState<string>("all");
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("vienna_sort_mode") as SortMode | null;
      if (saved) return saved;
    }
    return "alpha";
  });

  const [viewMode, setViewMode] = useState<"table" | "cards">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("vienna_view_mode");
      if (saved === "table" || saved === "cards") return saved;
      return window.innerWidth < 768 ? "cards" : "table";
    }
    return "table";
  });
  const [scannerOpen, setScannerOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ItemRow | null>(null);
  const [quickQcItem, setQuickQcItem] = useState<ItemRow | null>(null);
  const [activeImage, setActiveImage] = useState<ProductImageDetails | null>(null);
  const [whatsAppItem, setWhatsAppItem] = useState<ItemRow | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);

  const handleSetViewMode = (mode: "table" | "cards") => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("vienna_view_mode", mode);
    }
  };

  const handleSetSortMode = (mode: SortMode) => {
    setSortMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("vienna_sort_mode", mode);
    }
  };

  const items = useQuery({
    queryKey: ["items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .order("expiry_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("saved"));
      void queryClient.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("errGeneric")),
  });

  const photoUrls = useQuery({
    queryKey: ["item-photo-urls", (items.data ?? []).map((i) => i.photo_path).join(",")],
    enabled: (items.data ?? []).some((i) => i.photo_path),
    queryFn: () =>
      signedPhotoUrls(extractAllPhotoPaths((items.data ?? []).map((i) => i.photo_path))),
  });

  // Calculate FEFO #1 priority for approved batches (earliest expiry for each material name)
  const fefoPriorityMap = useMemo(() => {
    const map = new Map<string, boolean>();
    const groups = new Map<string, ItemRow[]>();

    for (const item of items.data ?? []) {
      if (item.qc_status === "approved" && daysUntil(item.expiry_date) >= 0) {
        const key = item.name.trim().toLowerCase();
        const list = groups.get(key) ?? [];
        list.push(item);
        groups.set(key, list);
      }
    }

    for (const [, list] of groups) {
      list.sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());
      if (list[0]) {
        map.set(list[0].id, true);
      }
    }
    return map;
  }, [items.data]);

  // Groups of materials by name
  const materialGroupsMap = useMemo(() => {
    const map = new Map<string, ItemRow[]>();
    for (const item of items.data ?? []) {
      const key = item.name.trim().toLowerCase();
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [items.data]);

  // Storage locations list
  const storageLocations = useMemo(() => {
    const set = new Set<string>();
    for (const item of items.data ?? []) {
      if (item.storage_location?.trim()) {
        set.add(item.storage_location.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ar"));
  }, [items.data]);

  const qcCounts = useMemo(() => {
    let quarantine = 0;
    let approved = 0;
    let rejected = 0;
    let fefo = 0;
    for (const item of items.data ?? []) {
      const st = item.qc_status ?? "quarantine";
      if (st === "quarantine") quarantine++;
      else if (st === "approved") approved++;
      else if (st === "rejected") rejected++;

      if (fefoPriorityMap.get(item.id)) fefo++;
    }
    return { quarantine, approved, rejected, fefo };
  }, [items.data, fefoPriorityMap]);

  // Comprehensive KPIs for stock & inventory
  const kpis = useMemo(() => {
    const all = items.data ?? [];
    const totalBatches = all.length;
    const uniqueMaterials = new Set(all.map((i) => i.name.trim().toLowerCase())).size;

    let multiBatchCount = 0;
    for (const [, list] of materialGroupsMap) {
      if (list.length > 1) multiBatchCount++;
    }

    const unitSums = new Map<string, number>();
    let criticalExpired = 0;
    let approvedReady = 0;
    let quarantineCount = 0;

    for (const it of all) {
      if (it.quantity != null && !isNaN(it.quantity)) {
        const u = it.unit?.trim() || (lang === "ar" ? "وحدة" : "unit");
        unitSums.set(u, (unitSums.get(u) ?? 0) + it.quantity);
      }
      const days = daysUntil(it.expiry_date);
      const st = statusFor(days, thresholds);
      if (st === "critical" || st === "expired") criticalExpired++;
      if (it.qc_status === "approved") approvedReady++;
      if ((it.qc_status ?? "quarantine") === "quarantine") quarantineCount++;
    }

    const totalStockDisplay =
      Array.from(unitSums.entries())
        .slice(0, 2)
        .map(([u, q]) => `${q.toLocaleString()} ${u}`)
        .join(" • ") || "—";

    return {
      totalBatches,
      uniqueMaterials,
      multiBatchCount,
      totalStockDisplay,
      criticalExpired,
      approvedReady,
      quarantineCount,
    };
  }, [items.data, materialGroupsMap, thresholds, lang]);

  const hasActiveFilters =
    search.trim() !== "" ||
    statusFilter !== "all" ||
    qcFilter !== "all" ||
    fefoOnly ||
    multiBatchOnly ||
    storageFilter !== "all";

  const resetAllFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setQcFilter("all");
    setFefoOnly(false);
    setMultiBatchOnly(false);
    setStorageFilter("all");
  };

  const rows = useMemo(() => {
    const list = (items.data ?? []).map((item) => {
      const days = daysUntil(item.expiry_date);
      const isFefoFirst = !!fefoPriorityMap.get(item.id);
      const materialBatchCount = materialGroupsMap.get(item.name.trim().toLowerCase())?.length ?? 1;
      return { item, days, status: statusFor(days, thresholds), isFefoFirst, materialBatchCount };
    });

    const q = search.trim().toLowerCase();

    // 1. Filter
    const filtered = list.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (qcFilter !== "all" && (r.item.qc_status ?? "quarantine") !== qcFilter) return false;
      if (fefoOnly && !r.isFefoFirst) return false;
      if (multiBatchOnly && r.materialBatchCount <= 1) return false;
      if (storageFilter !== "all" && (r.item.storage_location ?? "").trim() !== storageFilter) return false;
      if (q !== "") {
        const match =
          (r.item.item_code ?? "").toLowerCase().includes(q) ||
          (r.item.batch_number ?? "").toLowerCase().includes(q) ||
          r.item.name.toLowerCase().includes(q) ||
          (r.item.supplier ?? "").toLowerCase().includes(q) ||
          (r.item.storage_location ?? "").toLowerCase().includes(q) ||
          (r.item.notes ?? "").toLowerCase().includes(q) ||
          (r.item.qc_notes ?? "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });

    // 2. Sort
    filtered.sort((a, b) => {
      if (sortMode === "alpha" || sortMode === "grouped_materials") {
        const nameComp = a.item.name.localeCompare(b.item.name, "ar", {
          sensitivity: "base",
          numeric: true,
        });
        if (nameComp !== 0) return nameComp;
        return new Date(a.item.expiry_date).getTime() - new Date(b.item.expiry_date).getTime();
      }

      if (sortMode === "fefo") {
        return new Date(a.item.expiry_date).getTime() - new Date(b.item.expiry_date).getTime();
      }

      if (sortMode === "quantity_desc") {
        return (b.item.quantity ?? 0) - (a.item.quantity ?? 0);
      }

      if (sortMode === "quantity_asc") {
        return (a.item.quantity ?? 0) - (b.item.quantity ?? 0);
      }

      if (sortMode === "multi_batch") {
        if (a.materialBatchCount !== b.materialBatchCount) {
          return b.materialBatchCount - a.materialBatchCount;
        }
        const nameComp = a.item.name.localeCompare(b.item.name, "ar", {
          sensitivity: "base",
          numeric: true,
        });
        if (nameComp !== 0) return nameComp;
        return new Date(a.item.expiry_date).getTime() - new Date(b.item.expiry_date).getTime();
      }

      return 0;
    });

    return filtered;
  }, [
    items.data,
    search,
    statusFilter,
    qcFilter,
    fefoOnly,
    multiBatchOnly,
    storageFilter,
    sortMode,
    fefoPriorityMap,
    materialGroupsMap,
    thresholds,
  ]);

  const counts = useMemo(() => {
    const base: Record<Status, number> = {
      normal: 0,
      early: 0,
      medium: 0,
      critical: 0,
      expired: 0,
    };
    for (const item of items.data ?? []) {
      base[statusFor(daysUntil(item.expiry_date), thresholds)] += 1;
    }
    return base;
  }, [items.data, thresholds]);

  const exportCsv = () => {
    const header = [
      t("itemCode"),
      t("batchNumber"),
      t("name"),
      t("supplier"),
      t("qcStatus"),
      t("storageLocation"),
      t("productionDate"),
      t("expiryDate"),
      t("quantity"),
      t("unit"),
      t("status"),
      t("remaining"),
      t("notes"),
      t("qcNotes"),
    ];
    const lines = rows.map((r) =>
      [
        r.item.item_code ?? "",
        r.item.batch_number ?? "",
        r.item.name,
        r.item.supplier ?? "",
        t((r.item.qc_status ?? "quarantine") as never),
        r.item.storage_location ?? "",
        r.item.production_date ?? "",
        r.item.expiry_date,
        r.item.quantity ?? "",
        r.item.unit ?? "",
        t(STATUS_LABEL_KEY[r.status]),
        countdownText(r.days, t),
        (r.item.notes ?? "").replace(/\n/g, " "),
        (r.item.qc_notes ?? "").replace(/\n/g, " "),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = `\uFEFF${[header.join(","), ...lines].join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `vienna-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const shareItemOnWhatsApp = (item: ItemRow) => {
    setWhatsAppItem(item);
  };

  const hasUrgent = counts.expired > 0 || counts.critical > 0;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6 pb-24 md:pb-10">
        {/* Urgent Expiry Alert Banner */}
        {hasUrgent && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-950 dark:text-red-200 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm">
                <AlertTriangle className="size-5" />
              </div>
              <div>
                <p className="font-bold text-sm text-red-950 dark:text-red-100">
                  {t("urgentExpiryBanner", {
                    expired: counts.expired,
                    critical: counts.critical,
                  })}
                </p>
                <p className="text-xs text-red-800/80 dark:text-red-200/80">
                  {lang === "ar"
                    ? "يُرجى تطبيق إجراءات الحجر الفوري وقاعدة الصرف (FEFO: الأقرب انتهاءً أولاً) لمنع تلف المواد الخام."
                    : "Please enforce immediate quarantine and FEFO rules to prevent raw material loss."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="bg-white hover:bg-white/90 text-red-700 border-red-300 text-xs font-semibold shrink-0 shadow-sm"
                onClick={() => setStatusFilter(counts.expired > 0 ? "expired" : "critical")}
              >
                {t("viewUrgentItems")}
              </Button>
            </div>
          </div>
        )}

        {/* Top Stock & Inventory KPI Overview */}
        <InventoryKpiOverview
          uniqueMaterials={kpis.uniqueMaterials}
          totalBatches={kpis.totalBatches}
          totalStockDisplay={kpis.totalStockDisplay}
          criticalExpired={kpis.criticalExpired}
          multiBatchCount={kpis.multiBatchCount}
          approvedReady={kpis.approvedReady}
          hasActiveFilters={hasActiveFilters}
          isUrgentActive={statusFilter === "critical" || statusFilter === "expired"}
          isMultiBatchActive={multiBatchOnly}
          isApprovedActive={qcFilter === "approved"}
          onFilterReset={resetAllFilters}
          onFilterUrgent={() => setStatusFilter(counts.expired > 0 ? "expired" : "critical")}
          onFilterMultiBatch={() => setMultiBatchOnly((prev) => !prev)}
          onFilterApproved={() => setQcFilter(qcFilter === "approved" ? "all" : "approved")}
        />

        {/* Expiry Status Metric Cards */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard
            label={t("totalItems")}
            value={items.data?.length ?? 0}
            active={statusFilter === "all" && qcFilter === "all" && !multiBatchOnly && storageFilter === "all"}
            onClick={resetAllFilters}
          />
          {STATUS_ORDER.map((s) => (
            <StatCard
              key={s}
              label={t(STATUS_LABEL_KEY[s])}
              value={counts[s]}
              tint={STATUS_TINT[s]}
              active={statusFilter === s}
              onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
            />
          ))}
        </div>

        {thresholds && <StatusLegend thresholds={thresholds} />}

        {/* Quick Filter Pills for Instant Mobile & Fast Filtering */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={resetAllFilters}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all ${
              !hasActiveFilters
                ? "bg-brand text-brand-foreground shadow-sm ring-1 ring-brand"
                : "bg-card border border-border/80 text-muted-foreground hover:bg-muted"
            }`}
          >
            {t("quickFilterAll")} ({items.data?.length ?? 0})
          </button>
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all flex items-center gap-1.5 ${
                statusFilter === s
                  ? "bg-cocoa text-cream shadow-sm ring-2 ring-brand"
                  : "bg-card border border-border/80 text-muted-foreground hover:bg-muted"
              }`}
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: STATUS_TINT[s] }} />
              <span>{t(STATUS_LABEL_KEY[s])}</span>
              <span className="opacity-70 font-mono text-[11px]">({counts[s]})</span>
            </button>
          ))}

          <div className="h-4 w-px bg-border/80 shrink-0 mx-1" />

          <button
            type="button"
            onClick={() => setMultiBatchOnly(!multiBatchOnly)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold transition-all flex items-center gap-1 ${
              multiBatchOnly
                ? "bg-purple-600 text-white shadow-xs"
                : "bg-purple-100/70 text-purple-900 hover:bg-purple-100 dark:bg-purple-950/50 dark:text-purple-300"
            }`}
          >
            <Boxes className="size-3" />
            <span>{t("filterMultiBatchOnly")}</span>
            <span className="opacity-80 font-mono text-[10px]">({kpis.multiBatchCount})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFefoOnly(!fefoOnly);
              if (!fefoOnly) setQcFilter("approved");
            }}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold transition-all flex items-center gap-1 ${
              fefoOnly
                ? "bg-amber-500 text-amber-950 ring-2 ring-amber-400 shadow-sm"
                : "bg-amber-100/70 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300"
            }`}
          >
            <span>⭐</span>
            <span>{t("filterFefoGuide")}</span>
            <span className="opacity-80 font-mono text-[10px]">({qcCounts.fefo})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setQcFilter(qcFilter === "quarantine" ? "all" : "quarantine");
              setFefoOnly(false);
            }}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold transition-all flex items-center gap-1 ${
              qcFilter === "quarantine" && !fefoOnly
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-amber-100/70 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300"
            }`}
          >
            <span>🔒</span>
            <span>{t("filterAwaitingQc")}</span>
            <span className="opacity-80 font-mono text-[10px]">({qcCounts.quarantine})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setQcFilter(qcFilter === "approved" ? "all" : "approved");
              setFefoOnly(false);
            }}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold transition-all flex items-center gap-1 ${
              qcFilter === "approved" && !fefoOnly
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-emerald-100/70 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300"
            }`}
          >
            <span>✅</span>
            <span>{t("filterReleased")}</span>
            <span className="opacity-80 font-mono text-[10px]">({qcCounts.approved})</span>
          </button>

          {qcCounts.rejected > 0 && (
            <button
              type="button"
              onClick={() => {
                setQcFilter(qcFilter === "rejected" ? "all" : "rejected");
                setFefoOnly(false);
              }}
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold transition-all flex items-center gap-1 ${
                qcFilter === "rejected" && !fefoOnly
                  ? "bg-rose-600 text-white shadow-xs"
                  : "bg-rose-100/70 text-rose-900 hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300"
              }`}
            >
              <span>❌</span>
              <span>{t("filterRejected")}</span>
              <span className="opacity-80 font-mono text-[10px]">({qcCounts.rejected})</span>
            </button>
          )}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-1 ms-auto"
            >
              <X className="size-3" />
              <span>{t("resetFilters")}</span>
            </button>
          )}
        </div>

        {/* Enhanced Toolbar: Search, Sort Mode, Storage Location, Views & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            {/* Search with Barcode Scanner */}
            <div className="flex gap-1.5 w-full sm:w-64">
              <Input
                placeholder={t("search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title={t("scanBarcode")}
                onClick={() => setScannerOpen(true)}
              >
                <QrCode className="size-4 text-brand" />
              </Button>
            </div>

            {/* Sort & Grouping Mode Selector */}
            <Select value={sortMode} onValueChange={(v) => handleSetSortMode(v as SortMode)}>
              <SelectTrigger className="w-full sm:w-52 text-xs font-medium">
                <div className="flex items-center gap-1.5 truncate">
                  <ArrowUpDown className="size-3.5 text-brand shrink-0" />
                  <SelectValue placeholder={t("sortMode")} />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alpha">🔤 {t("sortAlpha")}</SelectItem>
                <SelectItem value="grouped_materials">📦 {t("sortGrouped")}</SelectItem>
                <SelectItem value="fefo">⏳ {t("sortFefo")}</SelectItem>
                <SelectItem value="quantity_desc">📈 {t("sortQtyDesc")}</SelectItem>
                <SelectItem value="quantity_asc">📉 {t("sortQtyAsc")}</SelectItem>
                <SelectItem value="multi_batch">🔢 {t("sortMultiBatch")}</SelectItem>
              </SelectContent>
            </Select>

            {/* Storage Location Filter (if available) */}
            {storageLocations.length > 0 && (
              <Select value={storageFilter} onValueChange={setStorageFilter}>
                <SelectTrigger className="w-full sm:w-44 text-xs">
                  <div className="flex items-center gap-1.5 truncate">
                    <MapPin className="size-3.5 text-muted-foreground shrink-0" />
                    <SelectValue placeholder={t("filterStorageLocation")} />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allStorageLocations")}</SelectItem>
                  {storageLocations.map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      📍 {loc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | Status)}>
              <SelectTrigger className="w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allStatuses")}</SelectItem>
                {STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(STATUS_LABEL_KEY[s])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* QC Status Filter */}
            <Select value={qcFilter} onValueChange={(v) => setQcFilter(v as "all" | QcStatusType)}>
              <SelectTrigger className="w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allQcStatuses")}</SelectItem>
                <SelectItem value="quarantine">🔒 {t("quarantine")}</SelectItem>
                <SelectItem value="approved">✅ {t("approved")}</SelectItem>
                <SelectItem value="rejected">❌ {t("rejected")}</SelectItem>
                <SelectItem value="conditional">⚠️ {t("conditional")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Action Buttons & View Modes */}
          <div className="flex flex-wrap items-center gap-2 ms-auto">
            {/* View Mode Switcher */}
            <div className="flex items-center rounded-lg border bg-muted/40 p-0.5">
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="icon"
                className="size-8"
                title={t("viewTable")}
                onClick={() => handleSetViewMode("table")}
              >
                <List className="size-4" />
              </Button>
              <Button
                variant={viewMode === "cards" ? "secondary" : "ghost"}
                size="icon"
                className="size-8"
                title={t("viewCards")}
                onClick={() => handleSetViewMode("cards")}
              >
                <LayoutGrid className="size-4" />
              </Button>
            </div>

            <Button variant="outline" size="sm" onClick={() => setPrintOpen(true)} className="h-8 gap-1.5 text-xs">
              <Printer className="size-3.5" />
              <span className="hidden lg:inline">{t("printQcReport")}</span>
            </Button>

            <Button variant="outline" size="sm" onClick={exportCsv} className="h-8 gap-1.5 text-xs">
              <Download className="size-3.5" />
              <span className="hidden sm:inline">{t("exportCsv")}</span>
            </Button>

            <Button variant="outline" size="sm" onClick={() => setBackupOpen(true)} className="h-8 gap-1.5 text-xs">
              <Archive className="size-3.5" />
              <span className="hidden sm:inline">{t("backupRestoreModalBtn")}</span>
            </Button>

            {canEditItems && (
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs bg-brand hover:bg-brand/90 font-bold"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="size-3.5" />
                <span>{t("addItem")}</span>
              </Button>
            )}
          </div>
        </div>

        {items.isLoading ? (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
            {t("loading")}
          </div>
        ) : items.isError ? (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-destructive shadow-sm">
            {t("errGeneric")}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
            {(items.data ?? []).length === 0 ? t("noItems") : t("noResults")}
          </div>
        ) : viewMode === "cards" ? (
          /* Cards View (Mobile & Tablet Friendly) */
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(({ item, days, status, isFefoFirst }, index) => {
              const parsedPhotos = parsePhotos(item.photo_path);
              const primaryPath = parsedPhotos[0]?.path;
              const url = primaryPath ? photoUrls.data?.[primaryPath] : undefined;
              const photoList = parsedPhotos
                .map((p) => ({ url: photoUrls.data?.[p.path] || "", caption: p.caption }))
                .filter((p) => Boolean(p.url));

              const prevRow = index > 0 ? rows[index - 1] : null;
              const currentMaterialKey = item.name.trim().toLowerCase();
              const prevMaterialKey = prevRow ? prevRow.item.name.trim().toLowerCase() : null;
              const isFirstOfGroup =
                sortMode === "grouped_materials" && (index === 0 || currentMaterialKey !== prevMaterialKey);
              const groupStats = isFirstOfGroup ? materialGroupsMap.get(currentMaterialKey) : null;

              return (
                <Fragment key={item.id}>
                  {isFirstOfGroup && groupStats && (
                    <div className="col-span-full mt-4 first:mt-0 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/60 border border-border/80 px-4 py-2.5 text-foreground shadow-xs">
                      <div className="flex items-center gap-2">
                        <div className="flex size-7 items-center justify-center rounded-lg bg-brand/15 text-brand">
                          <Boxes className="size-4" />
                        </div>
                        <div>
                          <span className="font-bold text-sm text-cocoa dark:text-cream">{item.name}</span>
                          <span className="ms-2 rounded-full bg-brand/15 text-brand px-2 py-0.5 text-[11px] font-semibold">
                            {t("similarBatchesCount", { count: groupStats.batches.length })}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {t("totalGroupQuantity", { qty: `${groupStats.totalQty} ${groupStats.unit || ""}`.trim() })}
                      </div>
                    </div>
                  )}

                  <div
                    className="relative flex flex-col justify-between overflow-hidden rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md"
                    style={{ borderTop: `4px solid var(--brand)` }}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
                            <span className="font-semibold text-muted-foreground">
                              {item.item_code || t("notSet")}
                            </span>
                            {item.batch_number && (
                              <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[11px] font-medium text-brand">
                                #{item.batch_number}
                              </span>
                            )}
                          </div>
                          <h2 className="text-base font-semibold text-cocoa leading-tight">
                            {item.name}
                          </h2>
                          <p className="text-xs text-muted-foreground">{item.supplier || "—"}</p>
                        </div>
                        <ProductImageThumbnail
                          url={url}
                          name={item.name}
                          itemCode={item.item_code}
                          batchNumber={item.batch_number}
                          photoCount={parsedPhotos.length}
                          size="md"
                          onClick={() => {
                            if (url || photoList.length > 0) {
                              setActiveImage({
                                id: item.id,
                                photos: photoList,
                                url,
                                name: item.name,
                                itemCode: item.item_code,
                                batchNumber: item.batch_number,
                                supplier: item.supplier,
                                expiryDate: item.expiry_date,
                                countdown: countdownText(days, t),
                                qcStatus: item.qc_status,
                                photoPathRaw: item.photo_path,
                              });
                            }
                          }}
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <StatusPill status={status} />
                        <QcBadge status={item.qc_status} />
                        {isFefoFirst && <FefoBadge />}
                      </div>

                      <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-2 text-xs">
                        <div>
                          <span className="text-muted-foreground block">{t("expiryDate")}</span>
                          <span className="font-medium font-mono text-foreground">
                            {item.expiry_date}
                          </span>
                          <span className="block text-[10px] text-muted-foreground">
                            {countdownText(days, t)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">{t("quantity")}</span>
                          <span className="font-medium font-mono text-foreground">
                            {item.quantity != null ? `${item.quantity} ${item.unit ?? ""}` : "—"}
                          </span>
                          {item.storage_location && (
                            <span className="block text-[10px] text-muted-foreground truncate">
                              📍 {item.storage_location}
                            </span>
                          )}
                        </div>
                      </div>

                      {(item.qc_notes || item.notes) && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {item.qc_notes || item.notes}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-1.5 border-t pt-2">
                      <div className="flex items-center gap-1">
                        {canEditItems && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-xs border-brand/40 bg-brand/5 text-cocoa hover:bg-brand/10 font-semibold shadow-xs"
                            onClick={() => setQuickQcItem(item)}
                          >
                            <ShieldCheck className="size-3.5 text-brand" />
                            <span>{t("inspectQc")}</span>
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-xs text-[#25D366] hover:text-[#128C7E] hover:bg-[#25D366]/10"
                          title={t("shareViaWhatsApp")}
                          onClick={() => shareItemOnWhatsApp(item)}
                        >
                          <MessageCircle className="size-3.5" />
                          <span className="hidden sm:inline">{t("shareViaWhatsApp")}</span>
                        </Button>
                      </div>

                      <div className="flex items-center gap-1">
                        {canEditItems && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1 text-xs"
                            onClick={() => {
                              setEditing(item);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="size-3.5" />
                            <span>{t("edit")}</span>
                          </Button>
                        )}
                        {canDeleteItems && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1 text-xs text-destructive hover:text-destructive"
                            disabled={remove.isPending}
                            onClick={() => {
                              if (window.confirm(t("deleteConfirm"))) remove.mutate(item.id);
                            }}
                          >
                            <Trash2 className="size-3.5" />
                            <span>{t("delete")}</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>
        ) : (
          /* Table View */
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-muted/60 text-start">
                <tr>
                  {[
                    "status",
                    "qcStatus",
                    "itemCode",
                    "batchNumber",
                    "photo",
                    "name",
                    "supplier",
                    "storageLocation",
                    "quantity",
                    "productionDate",
                    "expiryDate",
                    "remaining",
                    "notes",
                    "actions",
                  ].map((k) => (
                    <th key={k} className="px-3 py-2 text-start font-semibold text-cocoa">
                      {t(k as never)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ item, days, status, isFefoFirst }, index) => {
                  const parsedPhotos = parsePhotos(item.photo_path);
                  const primaryPath = parsedPhotos[0]?.path;
                  const url = primaryPath ? photoUrls.data?.[primaryPath] : undefined;
                  const photoList = parsedPhotos
                    .map((p) => ({ url: photoUrls.data?.[p.path] || "", caption: p.caption }))
                    .filter((p) => Boolean(p.url));

                  const prevRow = index > 0 ? rows[index - 1] : null;
                  const currentMaterialKey = item.name.trim().toLowerCase();
                  const prevMaterialKey = prevRow ? prevRow.item.name.trim().toLowerCase() : null;
                  const isFirstOfGroup =
                    sortMode === "grouped_materials" && (index === 0 || currentMaterialKey !== prevMaterialKey);
                  const groupStats = isFirstOfGroup ? materialGroupsMap.get(currentMaterialKey) : null;

                  return (
                    <Fragment key={item.id}>
                      {isFirstOfGroup && groupStats && (
                        <tr key={`group-table-${currentMaterialKey}`} className="bg-muted/70 font-semibold border-t-2 border-brand/30">
                          <td colSpan={14} className="px-3 py-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                              <div className="flex items-center gap-2">
                                <Boxes className="size-4 text-brand" />
                                <span className="font-bold text-sm text-cocoa dark:text-cream">{item.name}</span>
                                <span className="rounded-full bg-brand/15 text-brand px-2 py-0.5 text-[11px] font-semibold">
                                  {t("similarBatchesCount", { count: groupStats.batches.length })}
                                </span>
                              </div>
                              <div className="text-muted-foreground font-mono">
                                {t("totalGroupQuantity", { qty: `${groupStats.totalQty} ${groupStats.unit || ""}`.trim() })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

                      <tr
                        className="border-t"
                        style={{ backgroundColor: STATUS_TINT[status] }}
                      >
                        <td className="px-3 py-2">
                          <StatusPill status={status} />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <QcBadge status={item.qc_status} />
                            {isFefoFirst && <FefoBadge />}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {item.item_code || t("notSet")}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {item.batch_number ? (
                            <span className="rounded bg-brand/10 px-1.5 py-0.5 font-medium text-brand">
                              {item.batch_number}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <ProductImageThumbnail
                            url={url}
                            name={item.name}
                            itemCode={item.item_code}
                            batchNumber={item.batch_number}
                            photoCount={parsedPhotos.length}
                            size="sm"
                            onClick={() => {
                              if (url || photoList.length > 0) {
                                setActiveImage({
                                  id: item.id,
                                  photos: photoList,
                                  url,
                                  name: item.name,
                                  itemCode: item.item_code,
                                  batchNumber: item.batch_number,
                                  supplier: item.supplier,
                                  expiryDate: item.expiry_date,
                                  countdown: countdownText(days, t),
                                  qcStatus: item.qc_status,
                                  photoPathRaw: item.photo_path,
                                });
                              }
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 font-medium">{item.name}</td>
                        <td className="px-3 py-2">{item.supplier || "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {item.storage_location || "—"}
                        </td>

                        <td className="px-3 py-2">
                          {item.quantity != null ? `${item.quantity} ${item.unit ?? ""}`.trim() : "—"}
                        </td>
                        <td className="px-3 py-2">{item.production_date || "—"}</td>
                        <td className="px-3 py-2">{item.expiry_date}</td>
                        <td className="px-3 py-2">{countdownText(days, t)}</td>
                        <td className="max-w-[16rem] px-3 py-2 text-muted-foreground">
                          {item.notes || "—"}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            {canEditItems && (
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={t("inspectQc")}
                                title={t("inspectQc")}
                                className="text-brand hover:text-brand hover:bg-brand/10"
                                onClick={() => setQuickQcItem(item)}
                              >
                                <ShieldCheck className="size-4" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={t("shareViaWhatsApp")}
                              title={t("shareViaWhatsApp")}
                              className="text-[#25D366] hover:text-[#128C7E] hover:bg-[#25D366]/10"
                              onClick={() => shareItemOnWhatsApp(item)}
                            >
                              <MessageCircle className="size-4" />
                            </Button>
                            {canEditItems && (
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={t("edit")}
                                onClick={() => {
                                  setEditing(item);
                                  setDialogOpen(true);
                                }}
                              >
                                <Pencil className="size-4" />
                              </Button>
                            )}
                            {canDeleteItems && (
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={t("delete")}
                                disabled={remove.isPending}
                                title={t("delete")}
                                onClick={() => {
                                  if (window.confirm(t("deleteConfirm"))) remove.mutate(item.id);
                                }}
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={(code) => setSearch(code)}
      />

      <QcPrintReportDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        items={rows.map((r) => r.item)}
        thresholds={thresholds}
      />

      <BackupRestoreDialog
        open={backupOpen}
        onOpenChange={setBackupOpen}
      />

      <WhatsAppShareDialog
        open={Boolean(whatsAppItem)}
        onOpenChange={(open) => !open && setWhatsAppItem(null)}
        item={whatsAppItem}
        thresholds={thresholds}
        defaultPhone={settings.data?.whatsapp_phone}
      />

      <ItemFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editing}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: ["items"] })}
      />

      <QuickQcModal
        open={!!quickQcItem}
        onOpenChange={(open) => !open && setQuickQcItem(null)}
        item={quickQcItem}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: ["items"] })}
      />

      <ProductImageViewerDialog
        open={!!activeImage}
        onOpenChange={(open) => !open && setActiveImage(null)}
        item={activeImage}
      />

      <MobileBottomNav
        onAddItem={() => {
          setEditing(null);
          setDialogOpen(true);
        }}
        onScan={() => setScannerOpen(true)}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  tint,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tint?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex flex-col justify-between rounded-xl border p-3 text-start transition-all duration-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 focus:outline-none ${
        active
          ? "border-brand ring-2 ring-brand/40 bg-card shadow-sm"
          : "border-border/80 bg-card hover:border-brand/50"
      }`}
      style={tint && !active ? { backgroundColor: tint } : undefined}
    >
      <div className="flex items-center justify-between gap-1 w-full">
        <p className="text-xs text-muted-foreground font-medium truncate">{label}</p>
        {active && <span className="size-2 rounded-full bg-brand animate-pulse shrink-0" />}
      </div>
      <p className="mt-1 text-2xl font-semibold text-cocoa leading-tight">{value}</p>
    </button>
  );
}
