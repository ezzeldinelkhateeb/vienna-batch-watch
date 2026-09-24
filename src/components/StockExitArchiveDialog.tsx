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
  onCompleted?: () => void;
  onArchived?: () => void;
}

export function StockExitArchiveDialog({
  open,
  onOpenChange,
  item,
  onCompleted,
  onArchived,
}: Props) {
  useRegisterBackModal(open, () => onOpenChange(false), "stock-exit-archive-modal");
  const { t, lang } = useI18n();
  const { user } = useAuth();

  const [reason, setReason] = useState<ArchiveReason>("depleted");
  const [exitQty, setExitQty] = useState<string>("");
  const [targetOrCustomer, setTargetOrCustomer] = useState<string>("");
  const [priceOrInvoice, setPriceOrInvoice] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [forceArchive, setForceArchive] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);

  const hasRecordedQty = item?.quantity != null && !isNaN(Number(item.quantity));
  const currentQty = hasRecordedQty ? Number(item?.quantity) : 0;
  const numExitQty = parseFloat(exitQty) || 0;
  const remainingQty = hasRecordedQty ? Math.max(0, parseFloat((currentQty - numExitQty).toFixed(4))) : 0;

  // Quantity is invalid only if strictly negative
  const isInvalidQty = numExitQty < 0;
  const willDeplete = !hasRecordedQty || numExitQty >= currentQty || remainingQty === 0;

  // Reset state when opening dialog
  useEffect(() => {
    if (open && item) {
      const hasQty = item.quantity != null && !isNaN(Number(item.quantity));
      setReason("depleted");
      setExitQty(hasQty && (Number(item.quantity) || 0) > 0 ? item.quantity!.toString() : "");
      setTargetOrCustomer("");
      setPriceOrInvoice("");
      setNotes("");
      setForceArchive(true); // Default to archiving!
    }
  }, [open, item]);

  const handleQuickPercent = (percent: number) => {
    if (!hasRecordedQty || currentQty <= 0) return;
    const calc = (currentQty * percent) / 100;
    setExitQty(parseFloat(calc.toFixed(3)).toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item || isInvalidQty) return;

    setLoading(true);
    try {
      const shouldArchive = forceArchive || willDeplete || reason === "depleted" || !hasRecordedQty;
      const res = await executeStockExitAndArchive({
        item,
        exitQty: numExitQty,
        reason,
        targetOrCustomer: targetOrCustomer.trim(),
        priceOrInvoice: priceOrInvoice.trim(),
        notes: notes.trim(),
        forceArchive: shouldArchive,
        currentUser: user,
      });

      if (!res.success) {
        throw new Error(res.error || t("errGeneric"));
      }

      navigator.vibrate?.([30, 40, 30]);

      if (res.wasArchived) {
        toast.success(
          lang === "ar"
            ? `تم نقل الصنف "${item.name}" إلى الأرشيف بنجاح 📦`
            : `Item "${item.name}" moved to Archive successfully 📦`
        );
      } else {
        toast.success(
          lang === "ar"
            ? `تم إخراج ${numExitQty} ${item.unit || "كجم"} وتحديث رصيد المخزن بنجاح`
            : `Successfully recorded exit of ${numExitQty} ${item.unit || "kg"}`
        );
      }

      // Invoke callbacks safely
      onArchived?.();
      onCompleted?.();
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
                {hasRecordedQty && currentQty > 0 ? `${currentQty} ${item.unit || "كجم"}` : (lang === "ar" ? "غير محدد / اختياري" : "Not specified")}
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
              {/* 1. Depleted / Direct Archive (Default & Most Common) */}
              <button
                type="button"
                onClick={() => {
                  setReason("depleted");
                  setForceArchive(true);
                }}
                className={`p-2.5 rounded-xl border text-start flex items-center gap-2.5 transition-all col-span-2 sm:col-span-1 ${
                  reason === "depleted"
                    ? "bg-amber-50 dark:bg-amber-950/40 border-amber-500 text-amber-900 dark:text-amber-100 font-semibold ring-1 ring-amber-500 shadow-xs"
                    : "border-border hover:bg-muted/50 text-foreground"
                }`}
              >
                <div className={`p-2 rounded-lg shrink-0 ${reason === "depleted" ? "bg-amber-600 text-white" : "bg-muted text-muted-foreground"}`}>
                  <Archive className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold">{t("depletedZeroBalance")}</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-800 dark:text-amber-300 px-1.5 py-0.2 rounded font-medium">
                      {lang === "ar" ? "افتراضي" : "Default"}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-tight truncate">
                    {lang === "ar" ? "أرشفة الصنف ونقله لقائمة الأرشيف" : "Move item to archive"}
                  </div>
                </div>
              </button>

              {/* 2. Sale */}
              <button
                type="button"
                onClick={() => {
                  setReason("sold");
                }}
                className={`p-2.5 rounded-xl border text-start flex items-center gap-2.5 transition-all ${
                  reason === "sold"
                    ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-100 font-semibold ring-1 ring-emerald-500 shadow-xs"
                    : "border-border hover:bg-muted/50 text-foreground"
                }`}
              >
                <div className={`p-2 rounded-lg shrink-0 ${reason === "sold" ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"}`}>
                  <ShoppingCart className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold">{t("saleToCustomer")}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight truncate">
                    {lang === "ar" ? "بيع لعميل (اختياري)" : "Sale to customer"}
                  </div>
                </div>
              </button>

              {/* 3. Transfer */}
              <button
                type="button"
                onClick={() => {
                  setReason("transfer");
                }}
                className={`p-2.5 rounded-xl border text-start flex items-center gap-2.5 transition-all ${
                  reason === "transfer"
                    ? "bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-900 dark:text-blue-100 font-semibold ring-1 ring-blue-500 shadow-xs"
                    : "border-border hover:bg-muted/50 text-foreground"
                }`}
              >
                <div className={`p-2 rounded-lg shrink-0 ${reason === "transfer" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"}`}>
                  <Truck className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold">{t("transferWarehouse")}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight truncate">
                    {lang === "ar" ? "تحويل لمخزن (اختياري)" : "Transfer to warehouse"}
                  </div>
                </div>
              </button>

              {/* 4. Distribution */}
              <button
                type="button"
                onClick={() => {
                  setReason("distribution");
                }}
                className={`p-2.5 rounded-xl border text-start flex items-center gap-2.5 transition-all ${
                  reason === "distribution"
                    ? "bg-purple-50 dark:bg-purple-950/40 border-purple-500 text-purple-900 dark:text-purple-100 font-semibold ring-1 ring-purple-500 shadow-xs"
                    : "border-border hover:bg-muted/50 text-foreground"
                }`}
              >
                <div className={`p-2 rounded-lg shrink-0 ${reason === "distribution" ? "bg-purple-600 text-white" : "bg-muted text-muted-foreground"}`}>
                  <Gift className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold">{t("distributionSamples")}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight truncate">
                    {lang === "ar" ? "عينات أو هدايا (اختياري)" : "Samples or gifts"}
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Depleted Archive Information Banner */}
          {reason === "depleted" && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-900 dark:text-amber-200">
              <Sparkles className="size-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                <span className="font-bold block">
                  {lang === "ar" ? "أرشفة الصنف المباشرة:" : "Direct Archive:"}
                </span>
                <span>
                  {lang === "ar"
                    ? "سيتم نقل الصنف مباشرة إلى شاشة الأرشيف وحفظ كامل سجلاته وصوره دون حذفه، ودون الحاجة لإدخال أي بيانات إضافية."
                    : "Item will move directly to the archive preserving all history, with no extra fields required."}
                </span>
              </div>
            </div>
          )}

          {/* Quantity to Exit (Optional) */}
          <div className="space-y-2 p-3.5 rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between">
              <Label htmlFor="exitQty" className="text-xs font-semibold text-foreground">
                {t("exitQuantity")} ({item.unit || "كجم"}):{" "}
                <span className="text-[11px] font-normal text-muted-foreground">({lang === "ar" ? "اختياري" : "Optional"})</span>
              </Label>
              {hasRecordedQty && currentQty > 0 && (
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickPercent(100)}
                    className="h-6 px-2 text-[10px] font-bold text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                  >
                    100% {lang === "ar" ? "الكل" : "All"}
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
              )}
            </div>

            <div className="flex gap-2">
              <Input
                id="exitQty"
                type="number"
                step="any"
                min="0"
                value={exitQty}
                onChange={(e) => setExitQty(e.target.value)}
                placeholder={hasRecordedQty && currentQty > 0 ? currentQty.toString() : (lang === "ar" ? "اتركه فارغاً للأرشفة المباشرة" : "Leave empty to archive")}
                className="font-mono text-base font-bold h-10"
              />
            </div>

            {hasRecordedQty && currentQty > 0 ? (
              <div className="flex items-center justify-between pt-1 text-[11px]">
                <span className="text-muted-foreground">{t("remainingBalanceAfter")}:</span>
                <span
                  className={`font-mono font-bold ${
                    remainingQty === 0 || forceArchive || reason === "depleted"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {forceArchive || reason === "depleted" ? 0 : remainingQty} {item.unit || "كجم"}
                  {(forceArchive || reason === "depleted") && (
                    <span className="ms-1.5 text-[10px] font-sans font-medium text-amber-600">
                      ({lang === "ar" ? "أرشفة المخزون" : "Archived"})
                    </span>
                  )}
                </span>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {lang === "ar"
                  ? "💡 الصنف مسجل بدون كمية محددة — يمكنك تركه فارغاً وسيتم نقله للأرشيف فوراً."
                  : "💡 No initial quantity recorded — you can leave this empty to archive directly."}
              </p>
            )}
          </div>

          {/* Conditional Detail Fields (All 100% Optional) */}
          {reason === "sold" && (
            <div className="space-y-3 p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
              <div className="space-y-1">
                <Label htmlFor="customerName" className="text-xs font-semibold text-foreground">
                  {t("customerName")} ({lang === "ar" ? "اختياري" : "Optional"})
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
                  {t("destinationWarehouse")} ({lang === "ar" ? "اختياري" : "Optional"})
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
                  {lang === "ar" ? "جهة التوزيع / الغرض (اختياري):" : "Recipient / Purpose (Optional):"}
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

          {/* Notes (Optional) */}
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
                    ? "سيتم نقل الصنف إلى قائمة الأرشيف لحفظ كافة سجلاته وتقاريره وصوره دون حذفه."
                    : "Item will move to Archive preserving full history and photos without deletion."}
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

          {/* Dialog Action Buttons inside form for Enter key support */}
          <DialogFooter className="p-0 pt-3 border-t border-border flex flex-row items-center justify-end gap-2">
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
              type="submit"
              size="sm"
              disabled={loading || isInvalidQty}
              className="text-xs font-bold h-9 px-5 bg-amber-700 hover:bg-amber-800 text-white gap-1.5 shadow-sm"
            >
              {loading ? (
                <span>{lang === "ar" ? "جاري الحفظ..." : "Saving..."}</span>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  <span>
                    {willDeplete || forceArchive || reason === "depleted" || !hasRecordedQty
                      ? (lang === "ar" ? "تأكيد ونقل للأرشيف 📦" : "Confirm & Move to Archive 📦")
                      : (lang === "ar" ? "تأكيد حركة الإخراج" : "Confirm Stock Exit")}
                  </span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
