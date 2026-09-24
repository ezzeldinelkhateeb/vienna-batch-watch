import { useMemo, useState, useEffect, Fragment } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
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
  Factory,
  History,
  Tag,
  ClipboardCheck,
  Camera,
  Zap,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { buildAlertMessage, buildDirectWhatsAppUrl } from "@/lib/whatsapp.shared";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { logActivity } from "@/lib/activity-logger";
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
import { BatchLabelPrintModal } from "@/components/BatchLabelPrintModal";
import {
  ProductImageViewerDialog,
  type ProductImageDetails,
} from "@/components/ProductImageViewerDialog";
import { ProductImageThumbnail } from "@/components/ProductImageThumbnail";
import { WhatsAppShareDialog } from "@/components/WhatsAppShareDialog";
import { DispenseProductionDialog } from "@/components/DispenseProductionDialog";
import { StockMovementHistoryDialog } from "@/components/StockMovementHistoryDialog";
import { StockExitArchiveDialog } from "@/components/StockExitArchiveDialog";
import { RestoreArchivedItemDialog } from "@/components/RestoreArchivedItemDialog";
import { isItemArchived, getArchiveMeta, formatArchiveDate, stripArchiveTag } from "@/lib/archive";
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

  const enableKpis = settings.data?.feature_flags.enable_kpis !== false;
  const enableDispense = settings.data?.feature_flags.enable_dispense !== false;
  const enableScanner = settings.data?.feature_flags.enable_barcode_scanner !== false;
  const canExport = isAdmin || settings.data?.feature_flags.allow_export_non_admin !== false;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status | "urgent">("all");
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
  const [dispenseItem, setDispenseItem] = useState<ItemRow | null>(null);
  const [movementsItem, setMovementsItem] = useState<ItemRow | null | "all">(null);
  const [printLabelItem, setPrintLabelItem] = useState<ItemRow | null>(null);
  const [inventoryTab, setInventoryTab] = useState<"active" | "archived">("active");
  const [archiveReasonFilter, setArchiveReasonFilter] = useState<"all" | "sold" | "transfer" | "distribution" | "depleted" | "manual">("all");
  const [exitArchiveItem, setExitArchiveItem] = useState<ItemRow | null>(null);
  const [restoreItem, setRestoreItem] = useState<ItemRow | null>(null);

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
    mutationFn: async (itemToDelete: ItemRow) => {
      const { error } = await supabase.from("items").delete().eq("id", itemToDelete.id);
      if (error) throw error;
      return itemToDelete;
    },
    onSuccess: (deletedItem) => {
      void logActivity({
        action_type: "item_delete",
        entity_id: deletedItem.id,
        entity_name: `${deletedItem.name} (${deletedItem.batch_number || "No Batch"})`,
        details: {
          quantity: deletedItem.quantity,
          unit: deletedItem.unit,
          expiry_date: deletedItem.expiry_date,
        },
      });
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

  // Split into Active Inventory and Archive
  const { activeItems, archivedItems, archiveStats } = useMemo(() => {
    const active: ItemRow[] = [];
    const archived: ItemRow[] = [];
    let sold = 0;
    let transfer = 0;
    let distribution = 0;
    let depleted = 0;
    let other = 0;

    for (const it of items.data ?? []) {
      if (isItemArchived(it)) {
        archived.push(it);
        const meta = getArchiveMeta(it, lang);
        if (meta.reason === "sold") sold++;
        else if (meta.reason === "transfer") transfer++;
        else if (meta.reason === "distribution") distribution++;
        else if (meta.reason === "depleted") depleted++;
        else other++;
      } else {
        active.push(it);
      }
    }
    return {
      activeItems: active,
      archivedItems: archived,
      archiveStats: { sold, transfer, distribution, depleted, other, total: archived.length },
    };
  }, [items.data, lang]);

  // Calculate FEFO #1 priority for approved batches (earliest expiry for each material name)
  const fefoPriorityMap = useMemo(() => {
    const map = new Map<string, boolean>();
    const groups = new Map<string, ItemRow[]>();

    for (const item of activeItems) {
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
  }, [activeItems]);

  // Groups of materials by name — returns { batches, totalQty, unit }
  const materialGroupsMap = useMemo(() => {
    const map = new Map<string, { batches: ItemRow[]; totalQty: number; unit: string }>();
    for (const item of activeItems) {
      const key = (item.name || "").trim().toLowerCase();
      if (!key) continue;
      const existing = map.get(key);
      if (existing) {
        existing.batches.push(item);
        if (item.quantity != null && !isNaN(Number(item.quantity))) {
          existing.totalQty += Number(item.quantity);
        }
      } else {
        map.set(key, {
          batches: [item],
          totalQty: item.quantity != null && !isNaN(Number(item.quantity)) ? Number(item.quantity) : 0,
          unit: item.unit ?? "",
        });
      }
    }
    return map;
  }, [activeItems]);

  // Storage locations list
  const storageLocations = useMemo(() => {
    const set = new Set<string>();
    for (const loc of settings.data?.storage_locations ?? []) {
      if (loc?.trim()) {
        set.add(loc.trim());
      }
    }
    for (const item of activeItems) {
      if (item.storage_location?.trim()) {
        set.add(item.storage_location.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ar"));
  }, [activeItems, settings.data?.storage_locations]);

  const qcCounts = useMemo(() => {
    let quarantine = 0;
    let approved = 0;
    let rejected = 0;
    let fefo = 0;
    for (const item of activeItems) {
      const st = item.qc_status ?? "quarantine";
      if (st === "quarantine") quarantine++;
      else if (st === "approved") approved++;
      else if (st === "rejected") rejected++;

      if (fefoPriorityMap.get(item.id)) fefo++;
    }
    return { quarantine, approved, rejected, fefo };
  }, [activeItems, fefoPriorityMap]);

  // Comprehensive KPIs for stock & inventory
  const kpis = useMemo(() => {
    const all = activeItems;
    const totalBatches = all.length;
    const uniqueMaterials = new Set(all.map((i) => (i.name || "").trim().toLowerCase()).filter(Boolean)).size;

    let multiBatchCount = 0;
    for (const [, group] of materialGroupsMap) {
      if ((group?.batches?.length ?? 0) > 1) multiBatchCount++;
    }

    let totalWeightKg = 0;
    let weightBatchesCount = 0;
    let unrecordedBatchesCount = 0;
    const otherUnitsMap = new Map<string, number>();

    let criticalExpired = 0;
    let approvedReady = 0;
    let quarantineCount = 0;

    for (const it of all) {
      const q = it.quantity != null ? Number(it.quantity) : null;
      if (q != null && !isNaN(q) && q > 0) {
        const rawUnit = (it.unit || "").trim().toLowerCase();
        if (
          !rawUnit ||
          rawUnit === "kg" ||
          rawUnit === "kilo" ||
          rawUnit === "kilos" ||
          rawUnit === "kilogram" ||
          rawUnit === "kilograms" ||
          rawUnit === "كجم" ||
          rawUnit === "كغ" ||
          rawUnit === "كيلو" ||
          rawUnit === "كيلوجرام" ||
          rawUnit === "كيلوغرام"
        ) {
          totalWeightKg += q;
          weightBatchesCount++;
        } else if (
          rawUnit === "g" ||
          rawUnit === "gm" ||
          rawUnit === "gram" ||
          rawUnit === "grams" ||
          rawUnit === "جم" ||
          rawUnit === "جرام" ||
          rawUnit === "غرام"
        ) {
          totalWeightKg += q / 1000;
          weightBatchesCount++;
        } else if (
          rawUnit === "ton" ||
          rawUnit === "tons" ||
          rawUnit === "طن" ||
          rawUnit === "أطنان"
        ) {
          totalWeightKg += q * 1000;
          weightBatchesCount++;
        } else {
          otherUnitsMap.set(it.unit!.trim(), (otherUnitsMap.get(it.unit!.trim()) ?? 0) + q);
        }
      } else {
        unrecordedBatchesCount++;
      }

      const days = daysUntil(it.expiry_date);
      const st = statusFor(days, thresholds);
      if (st === "critical" || st === "expired") criticalExpired++;
      if (it.qc_status === "approved") approvedReady++;
      if ((it.qc_status ?? "quarantine") === "quarantine") quarantineCount++;
    }

    const totalWeightTons = totalWeightKg / 1000;
    const otherUnits = Array.from(otherUnitsMap.entries()).map(([unit, quantity]) => ({
      unit,
      quantity,
    }));

    return {
      totalBatches,
      uniqueMaterials,
      multiBatchCount,
      criticalExpired,
      approvedReady,
      quarantineCount,
      totalWeightKg,
      totalWeightTons,
      weightBatchesCount,
      unrecordedBatchesCount,
      otherUnits,
    };
  }, [activeItems, materialGroupsMap, thresholds]);

  // Next FEFO priority batch ready for dispensing to production
  const nextFefoItem = useMemo(() => {
    const approved = activeItems.filter(
      (i) =>
        i.qc_status === "approved" &&
        daysUntil(i.expiry_date) >= 0 &&
        (i.quantity == null || Number(i.quantity) > 0)
    );
    if (approved.length === 0) return null;
    approved.sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());
    return approved[0] ?? null;
  }, [activeItems]);

  // Current month string for monthly audit progress
  const currentMonthStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }, []);

  const monthlyReviewsQuery = useQuery({
    queryKey: ["batch_monthly_reviews_summary", currentMonthStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batch_monthly_reviews")
        .select("item_id, is_reviewed")
        .eq("month_year", currentMonthStr)
        .eq("is_reviewed", true);
      if (error) {
        return [];
      }
      return data ?? [];
    },
  });

  const reviewedBatchesCount = monthlyReviewsQuery.data?.length ?? 0;
  const auditProgressPercent =
    kpis.totalBatches > 0 ? Math.round((reviewedBatchesCount / kpis.totalBatches) * 100) : 0;

  const photoVerifiedCount = useMemo(
    () => activeItems.filter((i) => parsePhotos(i.photo_path).length > 0).length,
    [activeItems]
  );

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

  const applyExclusiveFilter = (
    type: "status" | "qc" | "fefo" | "multiBatch",
    value?: Status | "urgent" | QcStatusType
  ) => {
    let isCurrentlyActive = false;
    if (type === "status") {
      isCurrentlyActive = statusFilter === value;
    } else if (type === "qc") {
      isCurrentlyActive = qcFilter === value && !fefoOnly;
    } else if (type === "fefo") {
      isCurrentlyActive = fefoOnly;
    } else if (type === "multiBatch") {
      isCurrentlyActive = multiBatchOnly;
    }

    // 1. Wipe out old filters completely first
    setSearch("");
    setStatusFilter("all");
    setQcFilter("all");
    setFefoOnly(false);
    setMultiBatchOnly(false);
    setStorageFilter("all");

    // 2. If it was already active, toggle off (stay reset to all)
    if (isCurrentlyActive) {
      return;
    }

    // 3. Apply ONLY the new filter
    if (type === "status" && value) {
      setStatusFilter(value as Status | "urgent");
    } else if (type === "qc" && value) {
      setQcFilter(value as QcStatusType);
    } else if (type === "fefo") {
      setFefoOnly(true);
      setQcFilter("approved");
    } else if (type === "multiBatch") {
      setMultiBatchOnly(true);
    }
  };

  const rows = useMemo(() => {
    const sourceList = inventoryTab === "active" ? activeItems : archivedItems;
    const list = sourceList.map((item) => {
      const days = daysUntil(item.expiry_date);
      const isFefoFirst = !!fefoPriorityMap.get(item.id);
      const materialBatchCount = materialGroupsMap.get((item.name || "").trim().toLowerCase())?.batches?.length ?? 1;
      return { item, days, status: statusFor(days, thresholds), isFefoFirst, materialBatchCount };
    });

    const q = search.trim().toLowerCase();

    // 1. Filter
    const filtered = list.filter((r) => {
      if (inventoryTab === "active") {
        if (statusFilter !== "all") {
          if (statusFilter === "urgent") {
            if (r.status !== "critical" && r.status !== "expired") return false;
          } else if (r.status !== statusFilter) {
            return false;
          }
        }
        if (qcFilter !== "all" && (r.item.qc_status ?? "quarantine") !== qcFilter) return false;
        if (fefoOnly && !r.isFefoFirst) return false;
        if (multiBatchOnly && r.materialBatchCount <= 1) return false;
        if (storageFilter !== "all" && (r.item.storage_location ?? "").trim() !== storageFilter) return false;
      } else {
        if (archiveReasonFilter !== "all") {
          const meta = getArchiveMeta(r.item, lang);
          if (meta.reason !== archiveReasonFilter) return false;
        }
      }
      if (q !== "") {
        const match =
          (r.item.item_code ?? "").toLowerCase().includes(q) ||
          (r.item.batch_number ?? "").toLowerCase().includes(q) ||
          r.item.name.toLowerCase().includes(q) ||
          (r.item.supplier ?? "").toLowerCase().includes(q) ||
          (r.item.storage_location ?? "").toLowerCase().includes(q) ||
          (r.item.notes ?? "").toLowerCase().includes(q) ||
          (r.item.qc_notes ?? "").toLowerCase().includes(q) ||
          (r.item.archived_reason ?? "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });

    // 2. Sort
    filtered.sort((a, b) => {
      if (inventoryTab === "archived") {
        const dateA = a.item.archived_at ? new Date(a.item.archived_at).getTime() : 0;
        const dateB = b.item.archived_at ? new Date(b.item.archived_at).getTime() : 0;
        if (dateB !== dateA) return dateB - dateA;
      }

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
    inventoryTab,
    archiveReasonFilter,
    activeItems,
    archivedItems,
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
    lang,
  ]);

  const counts = useMemo(() => {
    const base: Record<Status, number> = {
      normal: 0,
      early: 0,
      medium: 0,
      critical: 0,
      expired: 0,
    };
    for (const item of activeItems) {
      base[statusFor(daysUntil(item.expiry_date), thresholds)] += 1;
    }
    return base;
  }, [activeItems, thresholds]);

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
    a.download = `vienna-${inventoryTab === "archived" ? "archive-" : ""}inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const shareItemOnWhatsApp = (item: ItemRow) => {
    setWhatsAppItem(item);
  };

  useEffect(() => {
    const handleViennaAction = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail === "add-item") {
        setEditing(null);
        setDialogOpen(true);
      } else if (detail === "scan") {
        setScannerOpen(true);
      } else if (detail === "print-report") {
        setPrintOpen(true);
      } else if (detail === "backup") {
        setBackupOpen(true);
      } else if (detail === "export-csv") {
        exportCsv();
      } else if (detail === "view-archive") {
        setInventoryTab("archived");
      }
    };
    window.addEventListener("vienna:action", handleViennaAction);
    return () => window.removeEventListener("vienna:action", handleViennaAction);
  }, [rows]);

  const hasUrgent = counts.expired > 0 || counts.critical > 0;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6 pb-24 md:pb-10">
        {/* Navigation Tabs: Active Stock vs Archive */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-3">
          <div className="flex items-center gap-1.5 p-1 bg-muted/70 rounded-xl border border-border/60">
            <button
              type="button"
              onClick={() => {
                navigator.vibrate?.(10);
                setInventoryTab("active");
              }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                inventoryTab === "active"
                  ? "bg-card text-foreground shadow-xs border border-border/80"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <PackageIcon className="size-4 text-brand" />
              <span>{t("activeInventory")}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-medium bg-brand/10 text-brand">
                {activeItems.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                navigator.vibrate?.(10);
                setInventoryTab("archived");
              }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                inventoryTab === "archived"
                  ? "bg-card text-foreground shadow-xs border border-border/80"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Archive className="size-4 text-amber-600" />
              <span>{t("archivedInventory")}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-medium bg-amber-500/15 text-amber-700 dark:text-amber-400">
                {archivedItems.length}
              </span>
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            {inventoryTab === "active"
              ? (lang === "ar" ? "قائمة الخامات النشطة الحالية بالمصنع وتتبع الصلاحية" : "Active raw materials and expiry tracking")
              : t("archiveTabDesc")}
          </p>
        </div>

        {/* Archive Banner when on Archived tab */}
        {inventoryTab === "archived" && (
          <div className="rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-amber-600 text-white shadow-xs">
                  <Archive className="size-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    {lang === "ar" ? "أرشيف الأصناف والمنتهية" : "Archived & Depleted Batches"}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {lang === "ar"
                      ? "كافة الأصناف التي تم بيعها، أو نقلها، أو نفاد مخزونها محفوظة هنا بسجلاتها دون حذفها"
                      : "Finished, sold, or transferred batches stored with full history without data deletion"}
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setMovementsItem("all")}
                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground shrink-0"
              >
                <History className="size-3.5 text-brand" />
                <span>{t("stockMovements")}</span>
              </Button>
            </div>

            {/* Quick Archive Filter Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 text-xs">
              <button
                type="button"
                onClick={() => setArchiveReasonFilter("all")}
                className={`p-2.5 rounded-lg border flex items-center justify-between transition-all ${
                  archiveReasonFilter === "all"
                    ? "bg-amber-600 text-white border-amber-600 shadow-xs font-bold ring-1 ring-amber-600"
                    : "bg-card/80 border-border text-foreground hover:bg-muted"
                }`}
              >
                <span className="text-[11px]">{lang === "ar" ? "كل المؤرشف:" : "All Archived:"}</span>
                <span className="font-mono font-bold text-sm">{archiveStats.total}</span>
              </button>
              <button
                type="button"
                onClick={() => setArchiveReasonFilter("sold")}
                className={`p-2.5 rounded-lg border flex items-center justify-between transition-all ${
                  archiveReasonFilter === "sold"
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold ring-1 ring-emerald-600"
                    : "bg-card/80 border-border text-foreground hover:bg-muted"
                }`}
              >
                <span className="text-[11px] flex items-center gap-1">
                  <ShoppingCart className="size-3" />
                  <span>{lang === "ar" ? "تم البيع:" : "Sold:"}</span>
                </span>
                <span className="font-mono font-bold text-sm">{archiveStats.sold}</span>
              </button>
              <button
                type="button"
                onClick={() => setArchiveReasonFilter("transfer")}
                className={`p-2.5 rounded-lg border flex items-center justify-between transition-all ${
                  archiveReasonFilter === "transfer"
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs font-bold ring-1 ring-blue-600"
                    : "bg-card/80 border-border text-foreground hover:bg-muted"
                }`}
              >
                <span className="text-[11px] flex items-center gap-1">
                  <Truck className="size-3" />
                  <span>{lang === "ar" ? "تم النقل:" : "Transferred:"}</span>
                </span>
                <span className="font-mono font-bold text-sm">{archiveStats.transfer}</span>
              </button>
              <button
                type="button"
                onClick={() => setArchiveReasonFilter("depleted")}
                className={`p-2.5 rounded-lg border flex items-center justify-between transition-all ${
                  archiveReasonFilter === "depleted"
                    ? "bg-amber-600 text-white border-amber-600 shadow-xs font-bold ring-1 ring-amber-600"
                    : "bg-card/80 border-border text-foreground hover:bg-muted"
                }`}
              >
                <span className="text-[11px]">{lang === "ar" ? "نفاد المخزون:" : "Depleted:"}</span>
                <span className="font-mono font-bold text-sm">{archiveStats.depleted}</span>
              </button>
              <button
                type="button"
                onClick={() => setArchiveReasonFilter("distribution")}
                className={`p-2.5 rounded-lg border flex items-center justify-between transition-all ${
                  archiveReasonFilter === "distribution"
                    ? "bg-purple-600 text-white border-purple-600 shadow-xs font-bold ring-1 ring-purple-600"
                    : "bg-card/80 border-border text-foreground hover:bg-muted"
                }`}
              >
                <span className="text-[11px]">{lang === "ar" ? "توزيع وعينات:" : "Samples:"}</span>
                <span className="font-mono font-bold text-sm">{archiveStats.distribution}</span>
              </button>
            </div>
          </div>
        )}

        {/* Urgent Expiry Alert Banner (Active inventory only) */}
        {inventoryTab === "active" && hasUrgent && (
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
                onClick={() => applyExclusiveFilter("status", "urgent")}
              >
                {t("viewUrgentItems")}
              </Button>
            </div>
          </div>
        )}

        {/* Active Inventory Only: KPI Overview, Quality Bar, FEFO Banner, Status Legend & Filter Pills */}
        {inventoryTab === "active" && (
          <>
            {/* Top Stock & Inventory KPI Overview */}
            {enableKpis && (
          <InventoryKpiOverview
            uniqueMaterials={kpis.uniqueMaterials}
            totalBatches={kpis.totalBatches}
            criticalExpired={kpis.criticalExpired}
            multiBatchCount={kpis.multiBatchCount}
            approvedReady={kpis.approvedReady}
            quarantineCount={kpis.quarantineCount}
            expiredCount={counts.expired}
            hasActiveFilters={hasActiveFilters}
            isUrgentActive={statusFilter === "urgent" || statusFilter === "critical"}
            isExpiredActive={statusFilter === "expired"}
            isMultiBatchActive={multiBatchOnly}
            isApprovedActive={qcFilter === "approved" && !fefoOnly}
            isQuarantineActive={qcFilter === "quarantine" && !fefoOnly}
            onFilterReset={resetAllFilters}
            onFilterUrgent={() => applyExclusiveFilter("status", "urgent")}
            onFilterExpired={() => applyExclusiveFilter("status", "expired")}
            onFilterMultiBatch={() => applyExclusiveFilter("multiBatch")}
            onFilterApproved={() => applyExclusiveFilter("qc", "approved")}
            onFilterQuarantine={() => applyExclusiveFilter("qc", "quarantine")}
          />
        )}

        {/* Quality Statistics Bar & Next FEFO Action Banner */}
        <div className="space-y-3">
          {/* Quality Statistics Bar */}
          <div className="rounded-xl border border-border/80 bg-card/80 p-2.5 sm:p-3 shadow-2xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-border/60">
              {/* 1. Monthly Audit Progress */}
              <Link
                to="/monthly-audit"
                className="group flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                title="انقر للانتقال لشاشة الجرد والفحص الشهري"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand group-hover:bg-brand group-hover:text-white transition-colors">
                    <ClipboardCheck className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-foreground block truncate">
                      إنجاز الفحص الشهري
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono truncate block">
                      {reviewedBatchesCount.toLocaleString("en-US")} من {kpis.totalBatches.toLocaleString("en-US")} تشغيلة
                    </span>
                  </div>
                </div>
                <div className="text-left font-mono shrink-0">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-brand/10 text-brand">
                    {auditProgressPercent}%
                  </span>
                </div>
              </Link>

              {/* 2. Rejection / Waste Rate */}
              <button
                type="button"
                onClick={() => applyExclusiveFilter("qc", "rejected")}
                className={`flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors text-right pt-2 sm:pt-1.5 ${
                  qcFilter === "rejected" && !fefoOnly ? "ring-1 ring-destructive/40 bg-destructive/5" : ""
                }`}
                title="فلترة التشغيلات المرفوضة"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                    qcCounts.rejected === 0
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-destructive/10 text-destructive"
                  }`}>
                    <ShieldCheck className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-foreground block truncate">
                      حالة الهدر والمرفوض
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate block">
                      {qcCounts.rejected === 0 ? "صفر هدر بالمخزن" : "يوجد تشغيلات مستبعدة"}
                    </span>
                  </div>
                </div>
                <div className="text-left font-mono shrink-0">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    qcCounts.rejected === 0
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "bg-destructive/15 text-destructive"
                  }`}>
                    {qcCounts.rejected === 0 ? "0 مرفوض" : `${qcCounts.rejected.toLocaleString("en-US")} مرفوض`}
                  </span>
                </div>
              </button>

              {/* 3. Photo Documentation Audit */}
              <div className="flex items-center justify-between gap-3 px-2 py-1.5 pt-2 sm:pt-1.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                    <Camera className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-foreground block truncate">
                      التوثيق البصري للعينات
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono truncate block">
                      {photoVerifiedCount.toLocaleString("en-US")} من {kpis.totalBatches.toLocaleString("en-US")} موثق
                    </span>
                  </div>
                </div>
                <div className="text-left font-mono shrink-0">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300">
                    {kpis.totalBatches > 0 ? Math.round((photoVerifiedCount / kpis.totalBatches) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Next FEFO Priority Action Card */}
          {nextFefoItem && (
            <div className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-brand/5 to-emerald-500/10 p-3 sm:p-3.5 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/30">
                    <Zap className="size-4.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-900 dark:text-amber-200">
                        ⚡ أولوية الصرف القادمة (FEFO)
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        تشغيلة #{nextFefoItem.batch_number || nextFefoItem.item_code || "—"}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                      <span className="font-bold text-sm text-foreground truncate">
                        {nextFefoItem.name}
                      </span>
                      <span className="font-mono font-bold text-xs text-brand">
                        {nextFefoItem.quantity != null
                          ? `${Number(nextFefoItem.quantity).toLocaleString("en-US")} ${nextFefoItem.unit ?? ""}`.trim()
                          : "—"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        • ينتهي: <span className="font-mono text-foreground font-semibold">{nextFefoItem.expiry_date}</span> ({countdownText(daysUntil(nextFefoItem.expiry_date), t)})
                      </span>
                      {nextFefoItem.storage_location && (
                        <span className="text-xs text-muted-foreground truncate">
                          • 📍 {nextFefoItem.storage_location}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {canEditItems && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-xs border-brand/40 bg-card hover:bg-muted text-foreground font-semibold shadow-2xs h-8"
                      onClick={() => setQuickQcItem(nextFefoItem)}
                    >
                      <ShieldCheck className="size-3.5 text-brand" />
                      <span>فحص</span>
                    </Button>
                  )}
                  {canEditItems && enableDispense && (
                    <Button
                      size="sm"
                      className="gap-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-2xs h-8 px-3"
                      onClick={() => setDispenseItem(nextFefoItem)}
                    >
                      <Factory className="size-3.5" />
                      <span>صرف للإنتاج الآن</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Expiry Status Quick Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={resetAllFilters}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
              statusFilter === "all"
                ? "bg-brand text-brand-foreground shadow-xs ring-1 ring-brand"
                : "bg-card border border-border/80 text-muted-foreground hover:bg-muted"
            }`}
          >
            {t("quickFilterAll")} ({items.data?.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => applyExclusiveFilter("status", "normal")}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold transition-all flex items-center gap-1.5 ${
              statusFilter === "normal"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20"
            }`}
          >
            <span className="size-2 rounded-full bg-emerald-500" />
            <span>{t("statusNormal")}</span>
            <span className="opacity-80 font-mono text-[10px]">({counts.normal})</span>
          </button>
          <button
            type="button"
            onClick={() => applyExclusiveFilter("status", "early")}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold transition-all flex items-center gap-1.5 ${
              statusFilter === "early"
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 hover:bg-amber-500/20"
            }`}
          >
            <span className="size-2 rounded-full bg-amber-500" />
            <span>{t("statusEarly")}</span>
            <span className="opacity-80 font-mono text-[10px]">({counts.early})</span>
          </button>
          <button
            type="button"
            onClick={() => applyExclusiveFilter("status", "medium")}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold transition-all flex items-center gap-1.5 ${
              statusFilter === "medium"
                ? "bg-orange-600 text-white shadow-xs"
                : "bg-orange-500/10 text-orange-800 dark:text-orange-300 border border-orange-500/20 hover:bg-orange-500/20"
            }`}
          >
            <span className="size-2 rounded-full bg-orange-500" />
            <span>{t("statusMedium")}</span>
            <span className="opacity-80 font-mono text-[10px]">({counts.medium})</span>
          </button>
          <button
            type="button"
            onClick={() => applyExclusiveFilter("status", "critical")}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold transition-all flex items-center gap-1.5 ${
              statusFilter === "critical"
                ? "bg-rose-600 text-white shadow-xs"
                : "bg-rose-500/10 text-rose-800 dark:text-rose-300 border border-rose-500/20 hover:bg-rose-500/20"
            }`}
          >
            <span className="size-2 rounded-full bg-rose-500" />
            <span>{t("statusCritical")}</span>
            <span className="opacity-80 font-mono text-[10px]">({counts.critical})</span>
          </button>
          <button
            type="button"
            onClick={() => applyExclusiveFilter("status", "expired")}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold transition-all flex items-center gap-1.5 ${
              statusFilter === "expired"
                ? "bg-zinc-700 text-white shadow-xs"
                : "bg-zinc-500/10 text-zinc-800 dark:text-zinc-300 border border-zinc-500/20 hover:bg-zinc-500/20"
            }`}
          >
            <span className="size-2 rounded-full bg-zinc-500" />
            <span>{t("statusExpired")}</span>
            <span className="opacity-80 font-mono text-[10px]">({counts.expired})</span>
          </button>
        </div>

        {/* Color Legend Card (دليل الألوان) */}
        {thresholds && (
          <StatusLegend
            thresholds={thresholds}
            selectedStatus={statusFilter}
            onSelectStatus={(s) => applyExclusiveFilter("status", s)}
          />
        )}

        {/* Secondary Filters Bar: All, Multi-Batch, FEFO */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none pt-1">
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

          <button
            type="button"
            onClick={() => applyExclusiveFilter("multiBatch")}
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
            onClick={() => applyExclusiveFilter("fefo")}
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
            onClick={() => applyExclusiveFilter("qc", "quarantine")}
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
            onClick={() => applyExclusiveFilter("qc", "approved")}
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
              onClick={() => applyExclusiveFilter("qc", "rejected")}
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
          </>
        )}

        {/* Enhanced Toolbar: Sticky on Mobile for quick search & barcode scan */}
        <div className="sticky top-0 z-20 -mx-4 px-4 py-2.5 sm:static sm:mx-0 sm:px-0 sm:py-0 bg-background/95 backdrop-blur-md border-b sm:border-b-0 border-border/70 shadow-2xs sm:shadow-none flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            {/* Search with Barcode Scanner */}
            <div className="flex gap-1.5 w-full sm:w-64">
              <Input
                placeholder={t("search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 text-xs"
              />
              {enableScanner && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title={t("scanBarcode")}
                  onClick={() => setScannerOpen(true)}
                >
                  <QrCode className="size-4 text-brand" />
                </Button>
              )}
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

            {canExport && (
              <Button variant="outline" size="sm" onClick={exportCsv} className="h-8 gap-1.5 text-xs">
                <Download className="size-3.5" />
                <span className="hidden sm:inline">{t("exportCsv")}</span>
              </Button>
            )}

            <Button variant="outline" size="sm" onClick={() => setBackupOpen(true)} className="h-8 gap-1.5 text-xs">
              <Archive className="size-3.5" />
              <span className="hidden sm:inline">{t("backupRestoreModalBtn")}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setMovementsItem("all")}
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              title={t("stockMovements")}
            >
              <History className="size-3.5 text-brand" />
              <span className="hidden xl:inline">{t("stockMovements")}</span>
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
                            {t("similarBatchesCount", { count: groupStats?.batches?.length ?? 0 })}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {t("totalGroupQuantity", { qty: `${groupStats?.totalQty ?? 0} ${groupStats?.unit || ""}`.trim() })}
                      </div>
                    </div>
                  )}

                  <div
                    className="relative flex flex-col justify-between overflow-hidden rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md"
                    style={{ borderTop: `4px solid ${inventoryTab === "archived" ? "#d97706" : "var(--brand)"}` }}
                  >
                    <div className="space-y-3">
                      {/* Archive Reason Banner (Archived Tab) */}
                      {inventoryTab === "archived" && (() => {
                        const meta = getArchiveMeta(item, lang);
                        return (
                          <div className={`flex items-center justify-between gap-2 rounded-lg border p-2 text-xs font-semibold ${meta.reasonBadgeColor}`}>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Archive className="size-3.5 shrink-0" />
                              <span className="truncate">{meta.reasonLabel}</span>
                            </div>
                            {meta.date && (
                              <span className="text-[10px] font-mono opacity-80 shrink-0">
                                {formatArchiveDate(meta.date, lang)}
                              </span>
                            )}
                          </div>
                        );
                      })()}

                      {/* Depleted Stock Archive Prompt (Active Tab) */}
                      {inventoryTab === "active" && canEditItems && (item.quantity != null && Number(item.quantity) <= 0) && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.vibrate?.(10);
                            setExitArchiveItem(item);
                          }}
                          className="w-full flex items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200 hover:bg-amber-500/20 transition-colors text-start"
                        >
                          <div className="flex items-center gap-1.5 font-bold">
                            <Archive className="size-3.5 text-amber-600 shrink-0" />
                            <span>{lang === "ar" ? "المخزون نفد (0) — نقل للأرشيف" : "Out of stock (0) — Move to Archive"}</span>
                          </div>
                          <span className="text-[11px] underline font-semibold shrink-0">{lang === "ar" ? "أرشفة الآن" : "Archive"}</span>
                        </button>
                      )}

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

                      <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-2.5 text-xs">
                        <div>
                          <span className="text-[11px] text-muted-foreground block font-medium">
                            {t("productionDate")}
                          </span>
                          <span className="font-mono text-foreground font-semibold">
                            {item.production_date || "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-muted-foreground block font-medium">
                            {t("expiryDate")}
                          </span>
                          <span className="font-mono text-foreground font-semibold">
                            {item.expiry_date}
                          </span>
                          <span
                            className={`inline-block text-[11px] font-bold mt-1 px-1.5 py-0.5 rounded leading-tight ${
                              status === "expired"
                                ? "bg-red-500/15 text-red-700 dark:text-red-300 ring-1 ring-red-500/30"
                                : status === "critical"
                                  ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/30"
                                  : status === "medium"
                                    ? "bg-orange-500/15 text-orange-800 dark:text-orange-300 ring-1 ring-orange-500/30"
                                    : status === "early"
                                      ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 ring-1 ring-amber-500/30"
                                      : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-500/30"
                            }`}
                          >
                            {countdownText(days, t)}
                          </span>
                        </div>
                        <div className="pt-1.5 border-t border-border/50">
                          <span className="text-[11px] text-muted-foreground block font-medium">
                            {t("quantity")}
                          </span>
                          <span className="font-bold font-mono text-foreground text-sm">
                            {item.quantity != null ? `${Number(item.quantity).toLocaleString("en-US")} ${item.unit ?? ""}` : "—"}
                          </span>
                        </div>
                        <div className="pt-1.5 border-t border-border/50">
                          <span className="text-[11px] text-muted-foreground block font-medium">
                            {t("storageLocation")}
                          </span>
                          <span className="font-medium text-foreground truncate block text-xs" title={item.storage_location || ""}>
                            📍 {item.storage_location || "—"}
                          </span>
                        </div>
                      </div>

                      {(item.qc_notes || stripArchiveTag(item.notes)) && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {item.qc_notes || stripArchiveTag(item.notes)}
                        </p>
                      )}
                    </div>

                    <div className="mt-3.5 border-t border-border/80 pt-2.5 space-y-2">
                      {/* Row 1: Primary Operations */}
                      {inventoryTab === "active" ? (
                        <div className="grid grid-cols-2 gap-2">
                          {canEditItems && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full gap-1.5 text-xs border-brand/40 bg-brand/5 text-cocoa hover:bg-brand/10 font-bold shadow-2xs h-9"
                              onClick={() => {
                                navigator.vibrate?.(15);
                                setQuickQcItem(item);
                              }}
                            >
                              <ShieldCheck className="size-4 text-brand shrink-0" />
                              <span className="truncate">{t("inspectQc")}</span>
                            </Button>
                          )}

                          {canEditItems && enableDispense && (
                            <Button
                              size="sm"
                              variant="default"
                              className="w-full gap-1.5 text-xs bg-brand hover:bg-brand/90 text-white font-bold shadow-2xs h-9"
                              onClick={() => {
                                navigator.vibrate?.(15);
                                setDispenseItem(item);
                              }}
                              title={t("dispenseToProduction")}
                            >
                              <Factory className="size-4 shrink-0" />
                              <span className="truncate">{t("dispenseToProduction")}</span>
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {canEditItems && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full gap-1.5 text-xs border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 font-bold shadow-2xs h-9"
                              onClick={() => {
                                navigator.vibrate?.(15);
                                setRestoreItem(item);
                              }}
                              title={t("restoreItem")}
                            >
                              <RotateCcw className="size-4 shrink-0" />
                              <span className="truncate">{t("restoreItem")}</span>
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full gap-1.5 text-xs border-border bg-card text-foreground hover:bg-muted font-semibold shadow-2xs h-9"
                            onClick={() => {
                              navigator.vibrate?.(10);
                              setMovementsItem(item);
                            }}
                            title={t("movementHistory")}
                          >
                            <History className="size-4 text-brand shrink-0" />
                            <span className="truncate">{t("movementHistory")}</span>
                          </Button>
                        </div>
                      )}

                      {/* Row 2: Secondary Tools Ribbon - All buttons preserved with comfortable touch targets */}
                      <div className="flex items-center justify-between gap-1 overflow-x-auto py-0.5 scrollbar-none">
                        {/* Movements History (Active tab) */}
                        {inventoryTab === "active" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                            title={t("movementHistory")}
                            onClick={() => {
                              navigator.vibrate?.(10);
                              setMovementsItem(item);
                            }}
                          >
                            <History className="size-3.5 text-brand" />
                            <span className="inline">{t("movementHistory")}</span>
                          </Button>
                        )}

                        {/* Thermal Barcode Label */}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-[11px] gap-1 text-muted-foreground hover:text-brand hover:bg-brand/10 shrink-0"
                          title={lang === "ar" ? "طباعة ملصق الباركود 🏷️" : "Print Barcode Label 🏷️"}
                          onClick={() => {
                            navigator.vibrate?.(10);
                            setPrintLabelItem(item);
                          }}
                        >
                          <Tag className="size-3.5 text-amber-600" />
                          <span className="inline">{lang === "ar" ? "ملصق" : "Label"}</span>
                        </Button>

                        {/* WhatsApp Share */}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-[11px] gap-1 text-[#25D366] hover:text-[#128C7E] hover:bg-[#25D366]/10 shrink-0"
                          title={t("shareViaWhatsApp")}
                          onClick={() => {
                            navigator.vibrate?.(10);
                            shareItemOnWhatsApp(item);
                          }}
                        >
                          <MessageCircle className="size-3.5" />
                          <span className="inline">{lang === "ar" ? "واتساب" : "Share"}</span>
                        </Button>

                        {/* Archive / Exit Action Button (Active items) */}
                        {inventoryTab === "active" && canEditItems && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-[11px] gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 shrink-0"
                            title={lang === "ar" ? "نقل للأرشيف / بيع / توزيع / نفاد" : "Archive / Exit / Sell"}
                            onClick={() => {
                              navigator.vibrate?.(10);
                              setExitArchiveItem(item);
                            }}
                          >
                            <Archive className="size-3.5 text-amber-600" />
                            <span className="inline font-bold">{lang === "ar" ? "أرشفة" : "Archive"}</span>
                          </Button>
                        )}

                        {/* Edit */}
                        {canEditItems && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-[11px] gap-1 text-foreground hover:bg-muted shrink-0"
                            onClick={() => {
                              navigator.vibrate?.(10);
                              setEditing(item);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="size-3.5" />
                            <span>{t("edit")}</span>
                          </Button>
                        )}

                        {/* Delete */}
                        {canDeleteItems && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-[11px] gap-1 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                            disabled={remove.isPending}
                            onClick={() => {
                              if (window.confirm(t("deleteConfirm"))) {
                                navigator.vibrate?.(25);
                                remove.mutate(item);
                              }
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
          /* Table View with Mobile Scroll Guidance */
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <div className="sm:hidden px-3 py-1.5 text-[11px] font-medium text-muted-foreground bg-muted/40 border-b flex items-center justify-between">
              <span>↔️ {lang === "ar" ? "اسحب الجدول أفقياً لعرض كافة الأعمدة" : "Swipe horizontally to view all columns"}</span>
              <button
                type="button"
                onClick={() => handleSetViewMode("cards")}
                className="text-brand font-bold underline"
              >
                {lang === "ar" ? "عرض البطاقات" : "Cards View"}
              </button>
            </div>
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
                                  {t("similarBatchesCount", { count: groupStats?.batches?.length ?? 0 })}
                                </span>
                              </div>
                              <div className="text-muted-foreground font-mono">
                                {t("totalGroupQuantity", { qty: `${groupStats?.totalQty ?? 0} ${groupStats?.unit || ""}`.trim() })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

                      <tr
                        className="border-t"
                        style={{ backgroundColor: STATUS_TINT[status] }}
                      >
                        <td className="px-3 py-2 whitespace-nowrap">
                          {inventoryTab === "archived" ? (() => {
                            const meta = getArchiveMeta(item, lang);
                            return (
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${meta.reasonBadgeColor}`}>
                                <Archive className="size-3 shrink-0" />
                                <span>{meta.reasonLabel}</span>
                              </span>
                            );
                          })() : (
                            <StatusPill status={status} />
                          )}
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
                        <td className="px-3 py-2">
                          <span
                            className={`inline-block text-[11px] font-bold px-1.5 py-0.5 rounded leading-tight ${
                              status === "expired"
                                ? "bg-red-500/15 text-red-700 dark:text-red-300 ring-1 ring-red-500/30"
                                : status === "critical"
                                  ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/30"
                                  : status === "medium"
                                    ? "bg-orange-500/15 text-orange-800 dark:text-orange-300 ring-1 ring-orange-500/30"
                                    : status === "early"
                                      ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 ring-1 ring-amber-500/30"
                                      : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-500/30"
                            }`}
                          >
                            {countdownText(days, t)}
                          </span>
                        </td>
                        <td className="max-w-[16rem] px-3 py-2 text-xs">
                          {item.qc_notes ? (
                            <span className="text-cocoa font-medium block truncate" title={item.qc_notes}>
                              🔬 {item.qc_notes}
                            </span>
                          ) : stripArchiveTag(item.notes) ? (
                            <span className="text-muted-foreground truncate block" title={stripArchiveTag(item.notes) || ""}>
                              {stripArchiveTag(item.notes)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            {inventoryTab === "active" ? (
                              <>
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
                                {canEditItems && enableDispense && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label={t("dispenseToProduction")}
                                    title={t("dispenseToProduction")}
                                    className="text-brand hover:bg-brand/15 hover:text-brand"
                                    onClick={() => setDispenseItem(item)}
                                  >
                                    <Factory className="size-4" />
                                  </Button>
                                )}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label={t("movementHistory")}
                                  title={t("movementHistory")}
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={() => setMovementsItem(item)}
                                >
                                  <History className="size-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label={lang === "ar" ? "طباعة ملصق الباركود 🏷️" : "Print Label"}
                                  title={lang === "ar" ? "طباعة ملصق الباركود 🏷️" : "Print Barcode Label 🏷️"}
                                  className="text-muted-foreground hover:text-brand"
                                  onClick={() => setPrintLabelItem(item)}
                                >
                                  <Tag className="size-4" />
                                </Button>
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
                                    aria-label={lang === "ar" ? "نقل للأرشيف / بيع / توزيع" : "Archive"}
                                    title={lang === "ar" ? "نقل للأرشيف / بيع / توزيع / نفاد" : "Archive / Exit / Sell"}
                                    className="text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                                    onClick={() => setExitArchiveItem(item)}
                                  >
                                    <Archive className="size-4" />
                                  </Button>
                                )}
                              </>
                            ) : (
                              <>
                                {canEditItems && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label={t("restoreItem")}
                                    title={t("restoreItem")}
                                    className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                                    onClick={() => setRestoreItem(item)}
                                  >
                                    <RotateCcw className="size-4" />
                                  </Button>
                                )}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label={t("movementHistory")}
                                  title={t("movementHistory")}
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={() => setMovementsItem(item)}
                                >
                                  <History className="size-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label={lang === "ar" ? "طباعة ملصق الباركود 🏷️" : "Print Label"}
                                  title={lang === "ar" ? "طباعة ملصق الباركود 🏷️" : "Print Barcode Label 🏷️"}
                                  className="text-muted-foreground hover:text-brand"
                                  onClick={() => setPrintLabelItem(item)}
                                >
                                  <Tag className="size-4" />
                                </Button>
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
                              </>
                            )}

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
                                  if (window.confirm(t("deleteConfirm"))) remove.mutate(item);
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

      <DispenseProductionDialog
        open={Boolean(dispenseItem)}
        onOpenChange={(open) => !open && setDispenseItem(null)}
        item={dispenseItem}
        allItems={items.data ?? []}
        onDispensed={() => void queryClient.invalidateQueries({ queryKey: ["items"] })}
        onSelectAnotherItem={(newItem) => setDispenseItem(newItem)}
      />

      <StockMovementHistoryDialog
        open={Boolean(movementsItem)}
        onOpenChange={(open) => !open && setMovementsItem(null)}
        item={movementsItem === "all" ? null : movementsItem}
      />

      <BatchLabelPrintModal
        open={Boolean(printLabelItem)}
        onOpenChange={(open) => !open && setPrintLabelItem(null)}
        item={printLabelItem}
      />

      <StockExitArchiveDialog
        open={Boolean(exitArchiveItem)}
        onOpenChange={(open) => !open && setExitArchiveItem(null)}
        item={exitArchiveItem}
        onArchived={() => {
          void queryClient.invalidateQueries({ queryKey: ["items"] });
          void queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
        }}
        onCompleted={() => {
          void queryClient.invalidateQueries({ queryKey: ["items"] });
          void queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
        }}
      />

      <RestoreArchivedItemDialog
        open={Boolean(restoreItem)}
        onOpenChange={(open) => !open && setRestoreItem(null)}
        item={restoreItem}
        onRestored={() => {
          void queryClient.invalidateQueries({ queryKey: ["items"] });
          void queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
        }}
        onCompleted={() => {
          void queryClient.invalidateQueries({ queryKey: ["items"] });
          void queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
        }}
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
