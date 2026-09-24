import { useState, useEffect } from "react";
import {
  Archive,
  ShoppingCart,
  Truck,
  Gift,
  PackageMinus,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useRegisterBackModal } from "@/lib/modal-stack";
import { type ItemRow } from "@/components/ItemFormDialog";
import {
  type ArchiveReason,
  executeStockExitAndArchive,
} from "@/lib/archive";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ItemRow | null;
  onCompleted: () => void;
}

export function StockExitArchiveDialog({
  open,
  onOpenChange,
  item,
  onCompleted,
}: Props) {
  useRegisterBackModal(open, () => onOpenChange(false), "stock-exit-archive-modal");
  const { t, lang } = useI18n();
  const { user } = useAuth();

  const [reason, setReason] = useState<ArchiveReason>("sold");
  const [exitQty, setExitQty] = useState<string>("");
  const [targetOrCustomer, setTargetOrCustomer] = useState<string>("");
  const [priceOrInvoice, setPriceOrInvoice] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [forceArchive, setForceArchive] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const currentQty = Number(item?.quantity) || 0;
  const numExitQty = parseFloat(exitQty) || 0;
  const remainingQty = Math.max(0, parseFloat((currentQty - numExitQty).toFixed(4)));

  const isInvalidQty = numExitQty < 0 || numExitQty > currentQty;
  const willDeplete = numExitQty >= currentQty || remainingQty === 0;

  // Reset state when opening dialog
  useEffect(() => {
    if (open && item) {
      const isZero = (Number(item.quantity) || 0) <= 0;
      setReason(isZero ? "depleted" : "sold");
      setExitQty(isZero ? "0" : (item.quantity?.toString() || "0"));
      setTargetOrCustomer("");
      setPriceOrInvoice("");
      setNotes("");
      setForceArchive(isZero);
    }
  }, [open, item]);

  const handleQuickPercent = (percent: number) => {
    const calc = (currentQty * percent) / 100;
    setExitQty(parseFloat(calc.toFixed(3)).toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item || isInvalidQty) return;

    // If reason is depleted/manual with 0 current quantity, exitQty can be 0
    if (numExitQty === 0 && currentQty > 0 && !forceArchive && reason !== "depleted") {
      toast.error(lang === "ar" ? "يرجى تحديد الكمية المراد إخراجها" : "Please specify quantity to exit");
      return;
    }

    setLoading(true);
    try {
      const res = await executeStockExitAndArchive({
        item,
        exitQty: numExitQty,
        reason,
        targetOrCustomer: targetOrCustomer.trim(),
        priceOrInvoice: priceOrInvoice.trim(),
        notes: notes.trim(),
        forceArchive: forceArchive || willDeplete || reason === "depleted",
        currentUser: user,
      });

      if (!res.success) {
        throw new Error(res.error || t("errGeneric"));
      }

      navigator.vibrate?.([30, 40, 30]);

      if (res.wasArchived) {
        toast.success(
          lang === "ar"
            ? `تم إخراج الكمية ونقل الصنف "${item.name}" إلى الأرشيف بنجاح 📦`
            : `Item "${item.name}" moved to Archive successfully 📦`
        );
      } else {
        toast.success(
          lang === "ar"
            ? `تم إخراج ${numExitQty} ${item.unit || "كجم"} وتحديث رصيد المخزن بنجاح`
            : `Successfully recorded exit of ${numExitQty} ${item.unit || "kg"}`
        );
      }

      onCompleted();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Stock exit error:", err);
      toast.error(err?.message || t("errGeneric"));
    } finally {
      setLoading(false);
    }
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden bg-background flex flex-col max-h-[92dvh] sm:max-h-[90vh]">
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-amber-800 via-amber-700 to-amber-900 p-4 sm:p-5 ltr:pe-10 rtl:ps-10 text-white shrink-0 shadow-sm">
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="sm:hidden text-white/90 hover:text-white hover:bg-white/15 h-8 px-2 text-xs gap-1 -ms-1"
            >
              <ArrowRight className="size-4 rtl:rotate-0 ltr:rotate-180" />
              <span>{lang === "ar" ? "رجوع" : "Back"}</span>
            </Button>
            <div className="flex size-9 sm:size-10 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur-sm border border-white/20 shadow-xs">
              <Archive className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base sm:text-lg font-bold text-white leading-tight">
                {t("stockExitArchiveTitle")}
              </DialogTitle>
              <DialogDescription className="text-white/80 text-[11px] sm:text-xs mt-0.5 truncate">
                {item.name} {item.batch_number ? `(#${item.batch_number})` : ""}
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
          {/* Current Stock Banner */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-foreground">
            <div>
              <span className="text-[11px] text-muted-foreground block">{t("currentStockBalance")}</span>
              <span className="text-base font-bold text-amber-700 dark:text-amber-400 font-mono">
                {currentQty} {item.unit || "كجم"}
              </span>
            </div>
            <div className="text-end">
              <span className="text-[11px] text-muted-foreground block">
                {lang === "ar" ? "رقم التشغيلة" : "Batch #"}
              </span>
              <span className="font-mono font-medium text-xs text-foreground">
                {item.batch_number || "—"}
              </span>
            </div>
          </div>

          {/* Operation / Reason Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">
              {lang === "ar" ? "نوع العملية / سبب الإخراج:" : "Exit Type / Reason:"}
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {/* 1. Sale */}
              <button
                type="button"
                onClick={() => {
                  setReason("sold");
                  if (currentQty > 0 && (!exitQty || exitQty === "0")) {
                    setExitQty(currentQty.toString());
                  }
                }}
                className={`p-2.5 rounded-xl border text-start flex items-center gap-2.5 transition-all ${
                  reason === "sold"
                    ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-100 font-semibold ring-1 ring-emerald-500 shadow-xs"
                    : "border-border hover:bg-muted/50 text-foreground"
                }`}
              >
                <div className={`p-2 rounded-lg ${reason === "sold" ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"}`}>
                  <ShoppingCart className="size-4" />
                </div>
                <div>
                  <div className="text-xs font-bold">{t("saleToCustomer")}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight">
                    {lang === "ar" ? "بيع لعميل خارجي أو متجر" : "Customer / Market sale"}
                  </div>
                </div>
              </button>

              {/* 2. Transfer */}
              <button
                type="button"
                onClick={() => {
                  setReason("transfer");
                  if (currentQty > 0 && (!exitQty || exitQty === "0")) {
                    setExitQty(currentQty.toString());
                  }
                }}
                className={`p-2.5 rounded-xl border text-start flex items-center gap-2.5 transition-all ${
                  reason === "transfer"
                    ? "bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-900 dark:text-blue-100 font-semibold ring-1 ring-blue-500 shadow-xs"
                    : "border-border hover:bg-muted/50 text-foreground"
                }`}
              >
                <div className={`p-2 rounded-lg ${reason === "transfer" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"}`}>
                  <Truck className="size-4" />
                </div>
                <div>
                  <div className="text-xs font-bold">{t("transferWarehouse")}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight">
                    {lang === "ar" ? "تحويل لمخزن أو فرع آخر" : "To branch/warehouse"}
                  </div>
                </div>
              </button>

              {/* 3. Distribution */}
              <button
                type="button"
                onClick={() => {
                  setReason("distribution");
                  if (currentQty > 0 && (!exitQty || exitQty === "0")) {
                    setExitQty(currentQty.toString());
                  }
                }}
                className={`p-2.5 rounded-xl border text-start flex items-center gap-2.5 transition-all ${
                  reason === "distribution"
                    ? "bg-purple-50 dark:bg-purple-950/40 border-purple-500 text-purple-900 dark:text-purple-100 font-semibold ring-1 ring-purple-500 shadow-xs"
                    : "border-border hover:bg-muted/50 text-foreground"
                }`}
              >
                <div className={`p-2 rounded-lg ${reason === "distribution" ? "bg-purple-600 text-white" : "bg-muted text-muted-foreground"}`}>
                  <Gift className="size-4" />
                </div>
                <div>
                  <div className="text-xs font-bold">{t("distributionSamples")}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight">
                    {lang === "ar" ? "توزيع عينات، هدايا، إهلاك" : "Samples, gifts, write-off"}
                  </div>
                </div>
              </button>

              {/* 4. Depleted / Direct Archive */}
              <button
                type="button"
                onClick={() => {
                  setReason("depleted");
                  setExitQty(currentQty.toString());
                  setForceArchive(true);
                }}
                className={`p-2.5 rounded-xl border text-start flex items-center gap-2.5 transition-all ${
                  reason === "depleted"
                    ? "bg-amber-50 dark:bg-amber-950/40 border-amber-500 text-amber-900 dark:text-amber-100 font-semibold ring-1 ring-amber-500 shadow-xs"
                    : "border-border hover:bg-muted/50 text-foreground"
                }`}
              >
                <div className={`p-2 rounded-lg ${reason === "depleted" ? "bg-amber-600 text-white" : "bg-muted text-muted-foreground"}`}>
                  <PackageMinus className="size-4" />
                </div>
                <div>
                  <div className="text-xs font-bold">{t("depletedZeroBalance")}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight">
                    {lang === "ar" ? "انتهاء المخزون وأرشفة الصنف" : "Finished / Archive now"}
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Quantity to Exit */}
          {currentQty > 0 && (
            <div className="space-y-2 p-3.5 rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between">
                <Label htmlFor="exitQty" className="text-xs font-semibold text-foreground">
                  {t("exitQuantity")} ({item.unit || "كجم"}):
                </Label>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickPercent(100)}
                    className="h-6 px-2 text-[10px] font-bold text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                  >
                    100% {lang === "ar" ? "بالكامل" : "All"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickPercent(50)}
                    className="h-6 px-2 text-[10px]"
                  >
                    50%
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickPercent(25)}
                    className="h-6 px-2 text-[10px]"
                  >
                    25%
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Input
                  id="exitQty"
                  type="number"
                  step="any"
                  min="0"
                  max={currentQty}
                  value={exitQty}
                  onChange={(e) => setExitQty(e.target.value)}
                  placeholder="0.00"
                  className="font-mono text-base font-bold h-10"
                />
              </div>

              {/* Remaining calculation banner */}
              <div className="flex items-center justify-between pt-1 text-[11px]">
                <span className="text-muted-foreground">{t("remainingBalanceAfter")}:</span>
                <span
                  className={`font-mono font-bold ${
                    remainingQty === 0
                      ? "text-destructive"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {remainingQty} {item.unit || "كجم"}
                </span>
              </div>
            </div>
          )}

          {/* Conditional Detail Fields */}
          {reason === "sold" && (
            <div className="space-y-3 p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
              <div className="space-y-1">
                <Label htmlFor="customerName" className="text-xs font-semibold text-foreground">
                  {t("customerName")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="customerName"
                  value={targetOrCustomer}
                  onChange={(e) => setTargetOrCustomer(e.target.value)}
                  placeholder={lang === "ar" ? "مثال: سوبر ماركت الأمانة، كافيه فيينا..." : "e.g. Vienna Cafe..."}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="priceOrInvoice" className="text-xs font-semibold text-foreground">
                  {t("invoiceOrPrice")} ({lang === "ar" ? "اختياري" : "Optional"})
                </Label>
                <Input
                  id="priceOrInvoice"
                  value={priceOrInvoice}
                  onChange={(e) => setPriceOrInvoice(e.target.value)}
                  placeholder={lang === "ar" ? "مثال: فاتورة #1048 أو إجمالي 2500 ج" : "e.g. Inv #1048 / 2500 EGP"}
                  className="h-9 text-xs"
                />
              </div>
            </div>
          )}

          {reason === "transfer" && (
            <div className="space-y-3 p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5">
              <div className="space-y-1">
                <Label htmlFor="destWarehouse" className="text-xs font-semibold text-foreground">
                  {t("destinationWarehouse")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="destWarehouse"
                  value={targetOrCustomer}
                  onChange={(e) => setTargetOrCustomer(e.target.value)}
                  placeholder={lang === "ar" ? "مثال: مخزن فرع العبور، مخزن التبريد 2..." : "e.g. Cold Warehouse #2..."}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="driverName" className="text-xs font-semibold text-foreground">
                  {t("recipientPerson")} ({lang === "ar" ? "اختياري" : "Optional"})
                </Label>
                <Input
                  id="driverName"
                  value={priceOrInvoice}
                  onChange={(e) => setPriceOrInvoice(e.target.value)}
                  placeholder={lang === "ar" ? "اسم السائق أو فني الاستلام" : "Driver / Receiver name"}
                  className="h-9 text-xs"
                />
              </div>
            </div>
          )}

          {reason === "distribution" && (
            <div className="space-y-3 p-3.5 rounded-xl border border-purple-500/20 bg-purple-500/5">
              <div className="space-y-1">
                <Label htmlFor="distRecipient" className="text-xs font-semibold text-foreground">
                  {lang === "ar" ? "جهة التوزيع / الغرض:" : "Recipient / Purpose:"}
                </Label>
                <Input
                  id="distRecipient"
                  value={targetOrCustomer}
                  onChange={(e) => setTargetOrCustomer(e.target.value)}
                  placeholder={lang === "ar" ? "مثال: عينات تسويق، هدايا معرض، إتلاف بسبب تلف..." : "e.g. Marketing samples..."}
                  className="h-9 text-xs"
                />
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1">
            <Label htmlFor="notes" className="text-xs font-semibold text-foreground">
              {t("archiveNotes")} ({lang === "ar" ? "اختياري" : "Optional"})
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={lang === "ar" ? "أي ملاحظات إضافية بخصوص هذه الحركة..." : "Additional movement notes..."}
              rows={2}
              className="text-xs resize-none"
            />
          </div>

          {/* Smart Archiving Alert & Controls */}
          {willDeplete ? (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-900 dark:text-amber-200">
              <Sparkles className="size-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                <span className="font-bold block">
                  {lang === "ar" ? "نقل تلقائي إلى شاشة الأرشيف:" : "Automatic Move to Archive:"}
                </span>
                <span>
                  {lang === "ar"
                    ? "سينفد رصيد الصنف بالكامل (0)؛ سيتم نقله تلقائياً إلى قائمة الأرشيف لحفظ كافة سجلاته وتقاريره دون حذفه."
                    : "Stock balance reaches 0; item will automatically move to the Archive to preserve history without deletion."}
                </span>
              </div>
            </div>
          ) : (
            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-border bg-muted/40 cursor-pointer hover:bg-muted/70 transition-colors">
              <input
                type="checkbox"
                checked={forceArchive}
                onChange={(e) => setForceArchive(e.target.checked)}
                className="mt-0.5 size-4 rounded text-brand focus:ring-brand border-border"
              />
              <div className="text-[11px] leading-relaxed">
                <span className="font-semibold text-foreground block">
                  {lang === "ar"
                    ? "نقل الصنف إلى الأرشيف الآن (إخفاؤه من المخزون النشط)"
                    : "Move item to Archive now (hide from active inventory)"}
                </span>
                <span className="text-muted-foreground">
                  {lang === "ar"
                    ? "يمكنك نقل الصنف للأرشيف مع الاحتفاظ بالرصيد المتبقي وسجل الحركات والرجوع إليه لاحقاً."
                    : "Keep remaining stock while archiving the item card from the active list."}
                </span>
              </div>
            </label>
          )}
        </form>

        {/* Footer */}
        <DialogFooter className="p-3 sm:p-4 border-t border-border bg-muted/20 flex flex-row items-center justify-end gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="text-xs h-9 px-4"
          >
            {t("cancel")}
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={loading || isInvalidQty}
            className="text-xs font-bold h-9 px-5 bg-amber-700 hover:bg-amber-800 text-white gap-1.5 shadow-sm"
          >
            {loading ? (
              <span>{lang === "ar" ? "جاري الحفظ..." : "Saving..."}</span>
            ) : (
              <>
                <CheckCircle2 className="size-4" />
                <span>
                  {willDeplete || forceArchive
                    ? (lang === "ar" ? "تأكيد الإخراج والأرشفة" : "Confirm Exit & Archive")
                    : (lang === "ar" ? "تأكيد حركة الإخراج" : "Confirm Stock Exit")}
                </span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
