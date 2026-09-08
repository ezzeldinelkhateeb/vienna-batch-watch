import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ItemRow | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

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

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label={t("totalItems")} value={items.data?.length ?? 0} />
          {STATUS_ORDER.map((s) => (
            <StatCard
              key={s}
              label={t(STATUS_LABEL_KEY[s])}
              value={counts[s]}
              tint={STATUS_TINT[s]}
            />
          ))}
        </div>

        {thresholds && <StatusLegend thresholds={thresholds} />}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            placeholder={t("search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-xs"
          />
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
          <div className="flex gap-2 sm:ms-auto">
            <Button variant="outline" onClick={exportCsv}>
              <Download className="size-4" />
              {t("exportCsv")}
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

        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          {items.isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">{t("loading")}</p>
          ) : items.isError ? (
            <p className="p-6 text-sm text-destructive">{t("errGeneric")}</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {(items.data ?? []).length === 0 ? t("noItems") : t("noResults")}
            </p>
          ) : (
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-muted/60 text-start">
                <tr>
                  {[
                    "status",
                    "qcStatus",
                    "itemCode",
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
                  const url = item.photo_path
                    ? photoUrls.data?.[item.photo_path]
                    : undefined;
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
                    <td className="px-3 py-2">
                      {url ? (
                        <button
                          type="button"
                          aria-label={t("viewPhoto")}
                          onClick={() => setLightbox(url)}
                          className="size-10 overflow-hidden rounded-md border"
                        >
                          <img
                            src={url}
                            alt={item.name}
                            className="size-full object-cover"
                            loading="lazy"
                          />
                        </button>
                      ) : (
                        <div className="flex size-10 items-center justify-center rounded-md border bg-muted">
                          <ImageIcon className="size-4 text-muted-foreground" />
                        </div>
                      )}
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
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      <ItemFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editing}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: ["items"] })}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  tint,
}: {
  label: string;
  value: number;
  tint?: string;
}) {
  return (
    <div
      className="rounded-xl border bg-card p-3 shadow-sm"
      style={tint ? { backgroundColor: tint } : undefined}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold text-cocoa">{value}</p>
    </div>
  );
}
