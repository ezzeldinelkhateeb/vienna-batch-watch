import { useState, useEffect } from "react";
import { RotateCcw, CheckCircle2, AlertCircle, ArrowRight, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useRegisterBackModal } from "@/lib/modal-stack";
import { type ItemRow } from "@/components/ItemFormDialog";
import { restoreArchivedItem, getArchiveMeta } from "@/lib/archive";
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ItemRow | null;
  onCompleted: () => void;
}

export function RestoreArchivedItemDialog({
  open,
  onOpenChange,
  item,
  onCompleted,
}: Props) {
  useRegisterBackModal(open, () => onOpenChange(false), "restore-archive-modal");
  const { t, lang } = useI18n();
  const { user } = useAuth();

  const [quantity, setQuantity] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (open && item) {
      setQuantity(item.quantity != null ? item.quantity.toString() : "0");
    }
  }, [open, item]);

  if (!item) return null;

  const archiveMeta = getArchiveMeta(item, lang);
  const numQty = parseFloat(quantity);
  const isValidQty = !isNaN(numQty) && numQty >= 0;

  const handleRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidQty) return;

    setLoading(true);
    try {
      const res = await restoreArchivedItem({
        item,
        newQuantity: numQty,
        currentUser: user,
      });

      if (!res.success) {
        throw new Error(res.error || t("errGeneric"));
      }

      navigator.vibrate?.([30, 40, 30]);
      toast.success(
        lang === "ar"
          ? `تمت استعادة "${item.name}" إلى قائمة المخزون النشط بنجاح ✨`
          : `Item "${item.name}" restored to active inventory ✨`
      );

      onCompleted();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Restore item error:", err);
      toast.error(err?.message || t("errGeneric"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-background flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-800 to-teal-700 p-4 sm:p-5 ltr:pe-10 rtl:ps-10 text-white shrink-0">
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
            <div className="flex size-9 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur-sm border border-white/20">
              <RotateCcw className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold text-white leading-tight">
                {t("restoreFromArchive")}
              </DialogTitle>
              <DialogDescription className="text-white/80 text-[11px] sm:text-xs mt-0.5">
                {item.name} {item.batch_number ? `(#${item.batch_number})` : ""}
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleRestore} className="p-4 sm:p-5 space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-muted/60 border border-border space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">{lang === "ar" ? "حالة الأرشفة:" : "Archive Status:"}</span>
              <span className={`px-2 py-0.5 rounded-md font-medium text-[10px] border ${archiveMeta.reasonBadgeColor}`}>
                {archiveMeta.reasonLabel}
              </span>
            </div>
            {archiveMeta.date && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">{lang === "ar" ? "تاريخ الأرشفة:" : "Archived Date:"}</span>
                <span className="font-mono text-foreground">
                  {new Date(archiveMeta.date).toLocaleDateString("ar-EG")}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="restore-quantity" className="text-xs font-semibold text-foreground">
              {lang === "ar" ? `الرصيد المتاح عند الاستعادة (${item.unit || "كجم"}):` : `Available Balance on Restore (${item.unit || "kg"}):`}
            </Label>
            <Input
              id="restore-quantity"
              type="number"
              step="any"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="font-mono text-base font-bold h-10"
              required
            />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {lang === "ar"
                ? "💡 سيعود هذا الصنف إلى قائمة المخزون النشط فوراً، مع إمكانية صرفه للإنتاج ومتابعة صلاحيته مجدداً."
                : "💡 This item will immediately reappear in the active inventory list with full tracking."}
            </p>
          </div>

          <DialogFooter className="p-0 pt-2 flex flex-row items-center justify-end gap-2">
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
              disabled={loading || !isValidQty}
              className="text-xs font-bold h-9 px-5 bg-teal-700 hover:bg-teal-800 text-white gap-1.5 shadow-sm"
            >
              {loading ? (
                <span>{lang === "ar" ? "جاري الاستعادة..." : "Restoring..."}</span>
              ) : (
                <>
                  <RotateCcw className="size-3.5" />
                  <span>{lang === "ar" ? "تأكيد الاستعادة للمخزون" : "Confirm Restore"}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
