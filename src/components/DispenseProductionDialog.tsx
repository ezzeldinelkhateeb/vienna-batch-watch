import { useState, useEffect, useMemo } from "react";
import { Factory, AlertTriangle, ArrowRight, CheckCircle2, Flame, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useSettings, DEFAULT_PRODUCTION_LINES } from "@/hooks/use-settings";
import { logActivity } from "@/lib/activity-logger";
import { useRegisterBackModal } from "@/lib/modal-stack";
import { daysUntil } from "@/lib/status";
import { countdownText } from "@/lib/format";
import { type ItemRow } from "@/components/ItemFormDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ItemRow | null;
  allItems?: ItemRow[] | undefined;
  onDispensed: () => void;
  onSelectAnotherItem?: (anotherItem: ItemRow) => void;
}

export function DispenseProductionDialog({
  open,
  onOpenChange,
  item,
  allItems = [],
  onDispensed,
  onSelectAnotherItem,
}: Props) {
  useRegisterBackModal(open, () => onOpenChange(false), "dispense-production-modal");
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const settings = useSettings();

  const productionLines = settings.data?.production_lines ?? DEFAULT_PRODUCTION_LINES;

  const [selectedLine, setSelectedLine] = useState(productionLines[0] || "");
  const [customLine, setCustomLine] = useState("");
  const [dispenseQty, setDispenseQty] = useState<string>("");
  const [recipient, setRecipient] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const currentQty = Number(item?.quantity) || 0;
  const numDispenseQty = parseFloat(dispenseQty) || 0;
  const remainingQty = Math.max(0, parseFloat((currentQty - numDispenseQty).toFixed(4)));
  const isInvalidQty = numDispenseQty <= 0 || numDispenseQty > currentQty;

  // Reset form when dialog opens or item changes
  useEffect(() => {
    if (open) {
      setDispenseQty("");
      setNotes("");
      setRecipient("");
      setSelectedLine(productionLines[0] || "");
      setCustomLine("");
    }
  }, [open, item?.id, productionLines]);

  // Intelligent FEFO check: is there another batch of the same material that expires sooner?
  const earlierBatch = useMemo(() => {
    if (!item) return null;
    const sameMaterials = allItems.filter(
      (b) =>
        b.name &&
        item.name &&
        b.name.trim().toLowerCase() === item.name.trim().toLowerCase() &&
        b.id !== item.id &&
        (b.qc_status ?? "quarantine") === "approved" &&
        daysUntil(b.expiry_date) >= 0 &&
        (Number(b.quantity) || 0) > 0,
    );

    if (sameMaterials.length === 0) return null;

    sameMaterials.sort(
      (a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime(),
    );

    const earliest = sameMaterials[0];
    if (
      earliest &&
      new Date(earliest.expiry_date).getTime() < new Date(item.expiry_date).getTime()
    ) {
      return earliest;
    }
    return null;
  }, [item, allItems]);

  const handleQuickPercent = (percent: number) => {
    const calculated = (currentQty * percent) / 100;
    // Format to max 3 decimal places
    setDispenseQty(parseFloat(calculated.toFixed(3)).toString());
  };

  const handleDispenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item || isInvalidQty) return;

    setLoading(true);
    try {
      const activeLine = customLine.trim() || selectedLine;

      // 1. Update items table with remaining quantity
      const { error: updateErr } = await supabase
        .from("items")
        .update({ quantity: remainingQty })
        .eq("id", item.id);

      if (updateErr) throw updateErr;

      // 2. Insert record into stock_movements
      const { error: movementErr } = await supabase.from("stock_movements").insert({
        item_id: item.id,
        item_name: item.name,
        batch_number: item.batch_number || null,
        movement_type: "production_dispense",
        quantity_dispensed: numDispenseQty,
        unit: item.unit || "كجم",
        previous_quantity: currentQty,
        remaining_quantity: remainingQty,
        production_line: activeLine,
        recipient_name: recipient.trim() || null,
        notes: notes.trim() || null,
        dispensed_by: user?.id || null,
        dispensed_by_email: user?.email || null,
      });

      if (movementErr) {
        console.warn("Stock movement recorded with warning:", movementErr);
      }

      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([30, 50, 30]);
      }

      toast.success(
        lang === "ar"
          ? `تم صرف ${numDispenseQty} ${item.unit || "كجم"} لـ ${activeLine} بنجاح`
          : `Dispensed ${numDispenseQty} ${item.unit || "kg"} to ${activeLine} successfully`,
      );

      void logActivity({
        action_type: "stock_dispense",
        entity_id: item.id,
        entity_name: `${item.name} (${item.batch_number || "No Batch"})`,
        details: {
          dispensed_qty: numDispenseQty,
          remaining_qty: remainingQty,
          unit: item.unit || "كجم",
          production_line: activeLine,
          recipient: recipient.trim() || null,
          notes: notes.trim() || null,
        },
      });

      onDispensed();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Dispense error:", err);
      toast.error(err?.message || t("errGeneric"));
    } finally {
      setLoading(false);
    }
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden bg-background">
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-cocoa to-brand p-5 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-lg sm:text-xl font-bold text-white">
              <div className="flex size-9 items-center justify-center rounded-lg bg-white/15 text-white backdrop-blur-sm border border-white/20">
                <Factory className="size-5" />
              </div>
              <span>{t("dispenseToProduction")}</span>
            </DialogTitle>
            <DialogDescription className="text-white/80 text-xs mt-1">
              {t("dispenseSubtitle")}
            </DialogDescription>
          </DialogHeader>

          {/* Current Batch Information Pill */}
          <div className="mt-4 rounded-lg bg-black/20 p-3 backdrop-blur-sm border border-white/15 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div>
              <span className="text-white/70 block">{lang === "ar" ? "المادة الخام" : "Material"}</span>
              <span className="font-bold text-sm text-white">{item.name}</span>
            </div>
            {item.batch_number && (
              <div>
                <span className="text-white/70 block">{lang === "ar" ? "رقم التشغيلة" : "Batch #"}</span>
                <span className="font-mono font-semibold text-amber-200">#{item.batch_number}</span>
              </div>
            )}
            <div>
              <span className="text-white/70 block">{t("currentStockBalance")}</span>
              <span className="font-bold text-white font-mono text-sm">
                {currentQty} {item.unit || "كجم"}
              </span>
            </div>
            <div>
              <span className="text-white/70 block">{t("expiryDate")}</span>
              <span className="font-semibold text-white">
                {item.expiry_date} ({countdownText(daysUntil(item.expiry_date), t)})
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleDispenseSubmit} className="p-5 space-y-4">
          {/* FEFO Recommendation Alert if an earlier batch exists */}
          {earlierBatch && (
            <div className="rounded-lg border border-amber-300/60 bg-amber-50/90 dark:bg-amber-950/40 p-3.5 text-xs text-amber-900 dark:text-amber-200 shadow-sm animate-in fade-in-50">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="size-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <p className="font-bold text-sm">{t("fefoWarningTitle")}</p>
                  <p className="text-amber-800 dark:text-amber-300">
                    {t("fefoWarningDesc", {
                      batch: earlierBatch.batch_number || earlierBatch.id.slice(0, 6),
                      days: daysUntil(earlierBatch.expiry_date),
                    })}
                  </p>
                  {onSelectAnotherItem && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onSelectAnotherItem(earlierBatch)}
                      className="mt-2 text-xs border-amber-400 bg-amber-100 hover:bg-amber-200 text-amber-950 font-semibold gap-1.5 h-8"
                    >
                      <Sparkles className="size-3.5 text-amber-700" />
                      <span>{t("switchToFefoBatch")} (#{earlierBatch.batch_number})</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Production Line Selection */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Factory className="size-3.5 text-brand" />
              <span>{t("productionLine")}</span>
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {productionLines.map((line) => {
                const isSelected = selectedLine === line && !customLine;
                return (
                  <button
                    key={line}
                    type="button"
                    onClick={() => {
                      setSelectedLine(line);
                      setCustomLine("");
                    }}
                    className={`text-right text-xs px-3 py-2 rounded-md border transition-all ${
                      isSelected
                        ? "bg-brand/10 border-brand text-brand font-semibold ring-1 ring-brand/30"
                        : "border-border hover:bg-muted/60 text-muted-foreground"
                    }`}
                  >
                    {line}
                  </button>
                );
              })}
            </div>
            <Input
              placeholder={lang === "ar" ? "أو اكتب خط إنتاج مخصص هنا..." : "Or type custom line..."}
              value={customLine}
              onChange={(e) => setCustomLine(e.target.value)}
              className="text-xs h-8 mt-1"
            />
          </div>

          {/* Quantity to Dispense & Quick Percentages */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="dispense-qty" className="text-xs font-semibold text-foreground">
                {t("quantityToDispense")} ({item.unit || "كجم"})
              </Label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickPercent(25)}
                  className="h-6 px-2 text-[11px] rounded"
                >
                  25%
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickPercent(50)}
                  className="h-6 px-2 text-[11px] rounded"
                >
                  50%
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickPercent(100)}
                  className="h-6 px-2 text-[11px] rounded font-bold border-brand text-brand hover:bg-brand/10"
                >
                  {t("dispenseAll")}
                </Button>
              </div>
            </div>

            <Input
              id="dispense-qty"
              type="number"
              step="any"
              min="0.001"
              max={currentQty}
              placeholder={`0.00 (${lang === "ar" ? "الرصيد المتاح" : "Max"}: ${currentQty})`}
              value={dispenseQty}
              onChange={(e) => setDispenseQty(e.target.value)}
              className="font-mono text-base font-bold text-cocoa"
              required
            />

            {/* Remaining balance preview */}
            <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-xs">
              <span className="text-muted-foreground">{t("remainingBalanceAfter")}:</span>
              <span
                className={`font-mono font-bold text-sm ${
                  remainingQty === 0
                    ? "text-amber-600 font-extrabold"
                    : isInvalidQty
                    ? "text-destructive"
                    : "text-emerald-700"
                }`}
              >
                {remainingQty} {item.unit || "كجم"}
                {remainingQty === 0 && (
                  <span className="text-[11px] mr-1 text-amber-700 font-normal">
                    ({lang === "ar" ? "سيتم تصفير الرصيد" : "Zero balance"})
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Recipient / Technician Name */}
          <div className="space-y-1.5">
            <Label htmlFor="recipient-name" className="text-xs font-semibold text-foreground">
              {t("recipientTechnician")}
            </Label>
            <Input
              id="recipient-name"
              placeholder={lang === "ar" ? "اسم الفني أو المشغل المستلم (اختياري)" : "Operator name (optional)"}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="text-xs h-9"
            />
          </div>

          {/* Dispense Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="dispense-notes" className="text-xs font-semibold text-foreground">
              {t("notes")} ({lang === "ar" ? "رقم أمر الشغل، أمر التصنيع، ملاحظات" : "Job order #, notes"})
            </Label>
            <Textarea
              id="dispense-notes"
              rows={2}
              placeholder={lang === "ar" ? "مثال: تشغيل أمر إنتاج رقم #WO-804..." : "e.g. Work order #WO-804..."}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs"
            />
          </div>

          {/* Footer Actions */}
          <DialogFooter className="pt-3 border-t border-border flex flex-row items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="text-xs"
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={loading || isInvalidQty}
              className="bg-brand hover:bg-brand/90 text-white font-semibold text-xs gap-1.5 min-w-[130px]"
            >
              {loading ? (
                <span>{t("saving")}</span>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  <span>{lang === "ar" ? "تأكيد الصرف للإنتاج" : "Confirm Dispense"}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
