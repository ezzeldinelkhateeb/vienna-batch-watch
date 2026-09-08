import { useMemo, useState, useEffect } from "react";
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
} from "lucide-react";
import { buildAlertMessage, buildDirectWhatsAppUrl } from "@/lib/whatsapp.shared";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { signedPhotoUrls } from "@/lib/photos";
import { countdownText } from "@/lib/format";
import {
  STATUS_ORDER,
  STATUS_TINT,
  daysUntil,
  statusFor,
  type Status,
} from "@/lib/status";
import { AppHeader } from "@/components/AppHeader";
import { StatusLegend } from "@/components/StatusLegend";
import { StatusPill, STATUS_LABEL_KEY, QcBadge, type QcStatusType } from "@/components/StatusPill";
import { ItemFormDialog, type ItemRow } from "@/components/ItemFormDialog";
import { BarcodeScannerDialog } from "@/components/BarcodeScannerDialog";
import { QcPrintReportDialog } from "@/components/QcPrintReportDialog";
import {
  ProductImageViewerDialog,
  type ProductImageDetails,
} from "@/components/ProductImageViewerDialog";
import { ProductImageThumbnail } from "@/components/ProductImageThumbnail";
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

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Vienna Expiry Tracker" },
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
  const { t } = useI18n();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const settings = useSettings();
  const thresholds = settings.data?.thresholds;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [qcFilter, setQcFilter] = useState<"all" | QcStatusType>("all");
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
  const [activeImage, setActiveImage] = useState<ProductImageDetails | null>(null);

  const handleSetViewMode = (mode: "table" | "cards") => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("vienna_view_mode", mode);
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
      signedPhotoUrls((items.data ?? []).map((i) => i.photo_path).filter(Boolean) as string[]),
  });

  const rows = useMemo(() => {
    const list = (items.data ?? []).map((item) => {
      const days = daysUntil(item.expiry_date);
      return { item, days, status: statusFor(days, thresholds) };
    });
    const q = search.trim().toLowerCase();
    return list.filter(
      (r) =>
        (statusFilter === "all" || r.status === statusFilter) &&
        (qcFilter === "all" || (r.item.qc_status ?? "quarantine") === qcFilter) &&
        (q === "" ||
          (r.item.item_code ?? "").toLowerCase().includes(q) ||
          (r.item.batch_number ?? "").toLowerCase().includes(q) ||
          r.item.name.toLowerCase().includes(q) ||
          (r.item.supplier ?? "").toLowerCase().includes(q) ||
          (r.item.storage_location ?? "").toLowerCase().includes(q)),
    );
  }, [items.data, search, statusFilter, qcFilter, thresholds]);

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

  const shareItemOnWhatsApp = (item: ItemRow, status: Status, days: number) => {
    const text = buildAlertMessage(item, status, days);
    const targetPhone = settings.data?.whatsapp_phone;
    const url = buildDirectWhatsAppUrl(targetPhone, text);
    window.open(url, "_blank");
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

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard
            label={t("totalItems")}
            value={items.data?.length ?? 0}
            active={statusFilter === "all" && qcFilter === "all"}
            onClick={() => {
              setStatusFilter("all");
              setQcFilter("all");
            }}
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
            onClick={() => {
              setStatusFilter("all");
              setQcFilter("all");
            }}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all ${
              statusFilter === "all" && qcFilter === "all"
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
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex gap-2 w-full sm:max-w-xs">
            <Input
              placeholder={t("search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
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

          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as "all" | Status)}
          >
            <SelectTrigger className="sm:w-48">
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

          <Select
            value={qcFilter}
            onValueChange={(v) => setQcFilter(v as "all" | QcStatusType)}
          >
            <SelectTrigger className="sm:w-44">
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

          <div className="flex flex-wrap items-center gap-2 sm:ms-auto">
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

            <Button variant="outline" onClick={() => setPrintOpen(true)}>
              <Printer className="size-4" />
              <span className="hidden lg:inline">{t("printQcReport")}</span>
            </Button>

            <Button variant="outline" onClick={exportCsv}>
              <Download className="size-4" />
              <span className="hidden sm:inline">{t("exportCsv")}</span>
            </Button>

            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="size-4" />
              {t("addItem")}
            </Button>
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
            {rows.map(({ item, days, status }) => {
              const url = item.photo_path ? photoUrls.data?.[item.photo_path] : undefined;
              return (
                <div
                  key={item.id}
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
                        <h2 className="text-base font-semibold text-cocoa leading-tight">{item.name}</h2>
                        <p className="text-xs text-muted-foreground">{item.supplier || "—"}</p>
                      </div>
                      <ProductImageThumbnail
                        url={url}
                        name={item.name}
                        itemCode={item.item_code}
                        batchNumber={item.batch_number}
                        size="md"
                        onClick={() => {
                          if (url) {
                            setActiveImage({
                              url,
                              name: item.name,
                              itemCode: item.item_code,
                              batchNumber: item.batch_number,
                              supplier: item.supplier,
                              expiryDate: item.expiry_date,
                              countdown: countdownText(days, t),
                              qcStatus: item.qc_status,
                            });
                          }
                        }}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <StatusPill status={status} />
                      <QcBadge status={item.qc_status} />
                    </div>

                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-2 text-xs">
                      <div>
                        <span className="text-muted-foreground block">{t("expiryDate")}</span>
                        <span className="font-medium font-mono text-foreground">{item.expiry_date}</span>
                        <span className="block text-[10px] text-muted-foreground">{countdownText(days, t)}</span>
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

                  <div className="mt-4 flex items-center justify-between gap-1 border-t pt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1 text-xs text-[#25D366] hover:text-[#128C7E] hover:bg-[#25D366]/10"
                      title={t("shareViaWhatsApp")}
                      onClick={() => shareItemOnWhatsApp(item, status, days)}
                    >
                      <MessageCircle className="size-3.5" />
                      <span>{t("shareViaWhatsApp")}</span>
                    </Button>

                    <div className="flex items-center gap-1">
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
                        {t("edit")}
                      </Button>
                      {isAdmin && (
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
                          {t("delete")}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
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
                {rows.map(({ item, days, status }) => {
                  const url = item.photo_path ? photoUrls.data?.[item.photo_path] : undefined;
                  return (
                    <tr
                      key={item.id}
                      className="border-t"
                      style={{ backgroundColor: STATUS_TINT[status] }}
                    >
                      <td className="px-3 py-2">
                        <StatusPill status={status} />
                      </td>
                      <td className="px-3 py-2">
                        <QcBadge status={item.qc_status} />
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
                          size="sm"
                          onClick={() => {
                            if (url) {
                              setActiveImage({
                                url,
                                name: item.name,
                                itemCode: item.item_code,
                                batchNumber: item.batch_number,
                                supplier: item.supplier,
                                expiryDate: item.expiry_date,
                                countdown: countdownText(days, t),
                                qcStatus: item.qc_status,
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
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={t("shareViaWhatsApp")}
                            title={t("shareViaWhatsApp")}
                            className="text-[#25D366] hover:text-[#128C7E] hover:bg-[#25D366]/10"
                            onClick={() => shareItemOnWhatsApp(item, status, days)}
                          >
                            <MessageCircle className="size-4" />
                          </Button>
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
                          {isAdmin && (
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

      <ItemFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editing}
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
