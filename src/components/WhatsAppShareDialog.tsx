import { useState, useMemo } from "react";
import {
  MessageCircle,
  Share2,
  Copy,
  Check,
  Download,
  Phone,
  Users,
  Image as ImageIcon,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ItemRow } from "@/components/ItemFormDialog";
import { buildAlertMessage, buildDirectWhatsAppUrl } from "@/lib/whatsapp.shared";
import { generateItemReportCardBlob } from "@/lib/report-card";
import { daysUntil, statusFor, type Thresholds } from "@/lib/status";
import { parsePhotos, signedPhotoUrl } from "@/lib/photos";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: ItemRow | null;
  customText?: string | undefined;
  thresholds?: Thresholds | undefined;
  defaultPhone?: string | null | undefined;
}

export function WhatsAppShareDialog({
  open,
  onOpenChange,
  item,
  customText,
  thresholds,
  defaultPhone,
}: Props) {
  const [recipientMode, setRecipientMode] = useState<"open" | "saved" | "custom">("open");
  const [customPhone, setCustomPhone] = useState("");
  const [includePhotoLink, setIncludePhotoLink] = useState(true);
  const [copiedText, setCopiedText] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [generating, setGenerating] = useState(false);

  const days = item ? daysUntil(item.expiry_date) : 0;
  const status = item ? statusFor(days, thresholds) : "normal";

  const photos = useMemo(() => {
    return item?.photo_path ? parsePhotos(item.photo_path) : [];
  }, [item?.photo_path]);

  // Construct message text
  const messageText = useMemo(() => {
    if (customText) return customText;
    if (!item) return "";
    return buildAlertMessage(item, status, days);
  }, [customText, item, status, days]);

  // Determine target phone according to mode
  const resolvedPhone = useMemo(() => {
    if (recipientMode === "open") return null; // No phone = WhatsApp contact/group picker
    if (recipientMode === "saved") return defaultPhone || null;
    return customPhone.trim() || null;
  }, [recipientMode, defaultPhone, customPhone]);

  const handleOpenWhatsApp = () => {
    const url = buildDirectWhatsAppUrl(resolvedPhone, messageText);
    window.open(url, "_blank");
    onOpenChange(false);
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setCopiedText(true);
      toast.success("تم نسخ نص التقرير للحافظة ✅");
      setTimeout(() => setCopiedText(false), 2000);
    } catch {
      toast.error("تعذر نسخ النص");
    }
  };

  const handleCopyImageToClipboard = async () => {
    if (!item) return;
    setGenerating(true);
    try {
      const blob = await generateItemReportCardBlob(item, thresholds);
      if (!blob) throw new Error("تعذر إنشاء صورة التقرير");

      if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        setCopiedImage(true);
        toast.success("تم نسخ صورة التقرير! يمكنك الآن ضغط Ctrl+V للصقها في واتساب ✅", {
          duration: 6000,
        });
        setTimeout(() => setCopiedImage(false), 3000);
      } else {
        toast.info("المتصفح لا يدعم نسخ الصور مباشرة، يمكنك الضغط على 'تحميل الصورة'.");
      }
    } catch (err: any) {
      toast.error(err?.message || "فشل نسخ الصورة");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!item) return;
    setGenerating(true);
    try {
      const blob = await generateItemReportCardBlob(item, thresholds);
      if (!blob) throw new Error("تعذر إنشاء صورة التقرير");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `qc-report-${item.item_code || item.name}-${item.expiry_date}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("تم تحميل صورة التقرير بنجاح ✅");
    } catch (err: any) {
      toast.error(err?.message || "فشل إنشاء الصورة");
    } finally {
      setGenerating(false);
    }
  };

  const handleNativeShareWithImage = async () => {
    if (!item) return;
    setGenerating(true);
    try {
      const blob = await generateItemReportCardBlob(item, thresholds);
      if (!blob) throw new Error("تعذر إنشاء الصورة");

      const file = new File([blob], `qc-${item.name}.png`, { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `تقرير جودة: ${item.name}`,
          text: messageText,
          files: [file],
        });
        toast.success("تمت المشاركة بنجاح ✅");
        onOpenChange(false);
      } else {
        // Fallback to text share or direct URL
        if (navigator.share) {
          await navigator.share({
            title: `تقرير جودة: ${item.name}`,
            text: messageText,
          });
          onOpenChange(false);
        } else {
          handleOpenWhatsApp();
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        handleOpenWhatsApp();
      }
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto p-5 sm:p-6 text-foreground">
        <DialogHeader className="border-b pb-3">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg font-bold text-cocoa">
            <div className="flex size-8 items-center justify-center rounded-lg bg-[#25D366]/15 text-[#25D366]">
              <MessageCircle className="size-5" />
            </div>
            <span>مشاركة التقرير عبر واتساب</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Target Recipient Selection */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">
              1. اختر طريقة الإرسال أو المستلم:
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setRecipientMode("open")}
                className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-2.5 text-center text-xs font-medium transition-all ${
                  recipientMode === "open"
                    ? "border-[#25D366] bg-[#25D366]/10 text-cocoa font-bold ring-1 ring-[#25D366]"
                    : "border-border/80 hover:bg-muted/50 text-muted-foreground"
                }`}
              >
                <Users className="size-4 text-[#25D366]" />
                <span>مشاركة حرة</span>
                <span className="text-[10px] text-muted-foreground">(اختيار أي شخص/جروب)</span>
              </button>

              <button
                type="button"
                onClick={() => setRecipientMode("saved")}
                disabled={!defaultPhone}
                className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-2.5 text-center text-xs font-medium transition-all ${
                  recipientMode === "saved"
                    ? "border-[#25D366] bg-[#25D366]/10 text-cocoa font-bold ring-1 ring-[#25D366]"
                    : "border-border/80 hover:bg-muted/50 text-muted-foreground disabled:opacity-40"
                }`}
              >
                <Phone className="size-4 text-brand" />
                <span>الرقم المحفوظ</span>
                <span className="text-[10px] text-muted-foreground" dir="ltr">
                  {defaultPhone || "غير مسجل"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setRecipientMode("custom")}
                className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-2.5 text-center text-xs font-medium transition-all ${
                  recipientMode === "custom"
                    ? "border-[#25D366] bg-[#25D366]/10 text-cocoa font-bold ring-1 ring-[#25D366]"
                    : "border-border/80 hover:bg-muted/50 text-muted-foreground"
                }`}
              >
                <MessageCircle className="size-4 text-blue-500" />
                <span>رقم مخصص</span>
                <span className="text-[10px] text-muted-foreground">(إدخال رقم يدوي)</span>
              </button>
            </div>

            {recipientMode === "custom" && (
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="customPhoneInput" className="text-xs">
                  رقم المستلم (بالصيغة الدولية):
                </Label>
                <Input
                  id="customPhoneInput"
                  dir="ltr"
                  placeholder="+2010xxxxxxxx"
                  value={customPhone}
                  onChange={(e) => setCustomPhone(e.target.value)}
                  className="text-xs"
                />
              </div>
            )}
          </div>

          {/* Report Visual & Image Sharing Section */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-cocoa">
                <ImageIcon className="size-4 text-amber-600" />
                <span>إرفاق ومشاركة صورة التقرير:</span>
              </div>
              <span className="text-[10px] text-amber-700 dark:text-amber-300 font-medium">
                بطاقة مصممة بجودة عالية
              </span>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              يمكنك مشاركة التقرير مع صورة البطاقة الفنية مباشرة على الموبايل، أو نسخ الصورة للصقها بضغطة واحدة (Ctrl+V) في واتساب ويب:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleNativeShareWithImage}
                disabled={generating}
                className="gap-1.5 text-xs h-9 bg-card border-amber-500/40 text-cocoa font-semibold shadow-xs hover:bg-amber-500/10"
              >
                <Share2 className="size-3.5 text-brand" />
                <span>مشاركة بالصورة (موبايل)</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyImageToClipboard}
                disabled={generating}
                className="gap-1.5 text-xs h-9 bg-card border-border text-cocoa font-semibold shadow-xs hover:bg-muted"
              >
                {copiedImage ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                <span>{copiedImage ? "تم نسخ الصورة!" : "نسخ الصورة (للواتساب)"}</span>
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDownloadImage}
                disabled={generating}
                className="gap-1.5 text-xs h-9 text-muted-foreground hover:text-foreground"
              >
                <Download className="size-3.5" />
                <span>تحميل الصورة PNG</span>
              </Button>
            </div>
          </div>

          {/* Message Text Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-muted-foreground">
                معاينة نص التقرير:
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={handleCopyText}
                className="h-6 gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                {copiedText ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                <span>{copiedText ? "تم النسخ" : "نسخ النص فقط"}</span>
              </Button>
            </div>
            <div className="max-h-40 overflow-y-auto rounded-lg border bg-muted/40 p-3 text-xs font-mono text-cocoa whitespace-pre-wrap select-all leading-relaxed">
              {messageText}
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 border-t pt-3 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            إلغاء
          </Button>

          <Button
            type="button"
            onClick={handleOpenWhatsApp}
            className="gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white shadow-sm font-bold text-xs sm:text-sm px-5"
          >
            <MessageCircle className="size-4" />
            <span>
              {recipientMode === "open"
                ? "فتح واتساب (واختيار أي محادثة أو جروب)"
                : recipientMode === "saved"
                  ? "إرسال للرقم المحفوظ"
                  : "إرسال للرقم المحدد"}
            </span>
            <ExternalLink className="size-3.5 opacity-70" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
