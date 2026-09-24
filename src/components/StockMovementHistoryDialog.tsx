import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  History,
  Factory,
  Search,
  Calendar,
  User,
  PackageCheck,
  ArrowDownRight,
  RefreshCw,
  ShoppingCart,
  Truck,
  Gift,
  Archive,
  RotateCcw,
  Plus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useRegisterBackModal } from "@/lib/modal-stack";
import { type ItemRow } from "@/components/ItemFormDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface StockMovementRow {
  id: string;
  item_id: string;
  item_name: string;
  batch_number: string | null;
  movement_type: string;
  quantity_dispensed: number;
  unit: string | null;
  previous_quantity: number;
  remaining_quantity: number;
  production_line: string;
  recipient_name: string | null;
  notes: string | null;
  dispensed_by: string | null;
  dispensed_by_email: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: ItemRow | null | undefined;
}

export function StockMovementHistoryDialog({ open, onOpenChange, item }: Props) {
  useRegisterBackModal(open, () => onOpenChange(false), "stock-movement-history-modal");
  const { t, lang } = useI18n();
  const [search, setSearch] = useState("");

  const movementsQuery = useQuery({
    queryKey: ["stock_movements", item?.id || "all"],
    enabled: open,
    queryFn: async () => {
      let query = supabase
        .from("stock_movements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(150);

      if (item?.id) {
        query = query.eq("item_id", item.id);
      }

      const { data, error } = await query;
      if (error) {
        console.warn("Could not load stock movements:", error);
        return [];
      }
      return (data ?? []) as StockMovementRow[];
    },
  });

  const movements = movementsQuery.data ?? [];

  const filteredMovements = useMemo(() => {
    if (!search.trim()) return movements;
    const q = search.trim().toLowerCase();
    return movements.filter(
      (m) =>
        m.item_name.toLowerCase().includes(q) ||
        (m.batch_number && m.batch_number.toLowerCase().includes(q)) ||
        m.production_line.toLowerCase().includes(q) ||
        (m.recipient_name && m.recipient_name.toLowerCase().includes(q)) ||
        (m.notes && m.notes.toLowerCase().includes(q)),
    );
  }, [movements, search]);

  const totalDispensedQty = useMemo(() => {
    return filteredMovements.reduce((acc, m) => acc + (Number(m.quantity_dispensed) || 0), 0);
  }, [filteredMovements]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92dvh] sm:max-h-[90vh] flex flex-col p-0 overflow-hidden bg-background">
        {/* Header */}
        <div className="bg-gradient-to-r from-cocoa to-brand p-5 ltr:pe-10 rtl:ps-10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-lg font-bold text-white">
              <div className="flex size-9 items-center justify-center rounded-lg bg-white/15 text-white backdrop-blur-sm border border-white/20">
                <History className="size-5" />
              </div>
              <span>
                {item
                  ? `${t("movementHistory")} — ${item.name} ${item.batch_number ? `(#${item.batch_number})` : ""}`
                  : t("stockMovements")}
              </span>
            </DialogTitle>
            <DialogDescription className="text-white/80 text-xs mt-1">
              {lang === "ar"
                ? "سجل وتاريخ عمليات الصرف إلى خطوط الإنتاج، والمبيعات، والتحويلات، وحركات الأرشيف"
                : "Historical record of production dispatches, sales, transfers, and warehouse movements"}
            </DialogDescription>
          </DialogHeader>

          {/* Quick Summary Strip */}
          <div className="mt-3 flex items-center justify-between gap-3 text-xs bg-black/20 p-3 rounded-lg border border-white/15">
            <div>
              <span className="text-white/70 block">{lang === "ar" ? "عدد الحركات" : "Total Movements"}</span>
              <span className="font-bold text-white text-sm font-mono">{filteredMovements.length}</span>
            </div>
            <div>
              <span className="text-white/70 block">{lang === "ar" ? "إجمالي المنصرف / المخرج" : "Total Out"}</span>
              <span className="font-bold text-amber-300 text-sm font-mono">
                {parseFloat(totalDispensedQty.toFixed(2))} {item?.unit || (lang === "ar" ? "وحدة" : "units")}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void movementsQuery.refetch()}
              disabled={movementsQuery.isFetching}
              className="text-white hover:bg-white/15 h-8 gap-1 text-xs"
            >
              <RefreshCw className={`size-3.5 ${movementsQuery.isFetching ? "animate-spin" : ""}`} />
              <span>{lang === "ar" ? "تحديث" : "Refresh"}</span>
            </Button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="p-4 border-b border-border bg-muted/30">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder={lang === "ar" ? "بحث برقم التشغيلة، اسم الخط، المستلم، الملاحظات..." : "Search batch, line, recipient..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9 text-xs h-9"
            />
          </div>
        </div>

        {/* Timeline Log List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {movementsQuery.isLoading ? (
            <div className="py-12 text-center text-xs text-muted-foreground animate-pulse">
              {lang === "ar" ? "جاري تحميل سجل الحركات..." : "Loading movements log..."}
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              <PackageCheck className="size-8 mx-auto text-muted-foreground/40 mb-2" />
              <p>{lang === "ar" ? "لا توجد حركات مسجلة بعد." : "No movements recorded yet."}</p>
            </div>
          ) : (
            filteredMovements.map((movement) => {
              const isSale = movement.movement_type === "sale";
              const isTransfer = movement.movement_type === "transfer";
              const isDist = movement.movement_type === "distribution";
              const isArchive = movement.movement_type === "archive" || movement.movement_type === "depleted";
              const isRestore = movement.movement_type === "restore";

              let BadgeIcon = Factory;
              let badgeColor = "bg-muted text-muted-foreground border-border/50";
              let badgeLabel = movement.production_line;

              if (isSale) {
                BadgeIcon = ShoppingCart;
                badgeColor = "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
              } else if (isTransfer) {
                BadgeIcon = Truck;
                badgeColor = "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";
              } else if (isDist) {
                BadgeIcon = Gift;
                badgeColor = "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20";
              } else if (isArchive) {
                BadgeIcon = Archive;
                badgeColor = "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
              } else if (isRestore) {
                BadgeIcon = RotateCcw;
                badgeColor = "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20";
              }

              return (
                <div
                  key={movement.id}
                  className="rounded-lg border border-border/80 bg-card p-3.5 shadow-sm hover:shadow transition-shadow flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-foreground">
                        {movement.item_name}
                      </span>
                      {movement.batch_number && (
                        <span className="rounded bg-brand/10 text-brand px-2 py-0.5 text-[11px] font-mono font-medium">
                          #{movement.batch_number}
                        </span>
                      )}
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] flex items-center gap-1 font-medium border ${badgeColor}`}>
                        <BadgeIcon className="size-3" />
                        <span>{badgeLabel}</span>
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-[11px]">
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3" />
                        <span>{new Date(movement.created_at).toLocaleString("ar-EG")}</span>
                      </span>
                      {movement.recipient_name && (
                        <span className="flex items-center gap-1">
                          <User className="size-3" />
                          <span>{lang === "ar" ? "المستلم/الجهة:" : "Recipient:"} {movement.recipient_name}</span>
                        </span>
                      )}
                      {movement.dispensed_by_email && (
                        <span className="text-muted-foreground/70">
                          ({movement.dispensed_by_email})
                        </span>
                      )}
                    </div>

                    {movement.notes && (
                      <p className="rounded bg-muted/40 p-2 text-muted-foreground text-[11px] border border-border/40 mt-1">
                        {movement.notes}
                      </p>
                    )}
                  </div>

                  {/* Numbers Pill */}
                  <div className="shrink-0 flex sm:flex-col items-end justify-between sm:justify-center border-t sm:border-t-0 sm:border-r sm:pr-4 border-border/60 pt-2 sm:pt-0">
                    <div className={`flex items-center gap-1 font-bold text-sm ${isRestore ? "text-teal-600 dark:text-teal-400" : "text-brand"}`}>
                      {isRestore ? (
                        <>
                          <Plus className="size-4" />
                          <span>+{movement.remaining_quantity} {movement.unit || "كجم"}</span>
                        </>
                      ) : (
                        <>
                          <ArrowDownRight className="size-4" />
                          <span>
                            -{movement.quantity_dispensed} {movement.unit || "كجم"}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      <span>{lang === "ar" ? "المتبقي:" : "Rem:"} </span>
                      <span className="font-mono font-semibold text-foreground">
                        {movement.remaining_quantity} {movement.unit || "كجم"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
