import { useState, useEffect } from "react";
import { Check, ShieldCheck, AlertTriangle, XCircle, Clock, Sparkles, Building2, FileText, MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { type ItemRow, type QcStatus } from "@/components/ItemFormDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ItemRow | null;
  onSaved: () => void;
}

const STORAGE_PRESETS = [
  "ثلاجة الشوكولاتة 18°C (Chocolate Cool Store)",
  "مخزن الدقيق والنواشف 72% (Flour Warehouse)",
  "صومعة السكر والنشا (Sugar Silo)",
  "مستودع المنكهات والدهون النباتية (Fats & Flavors)",
  "غرفة مواد التعبئة والتغليف (Packaging Store)",
  "منطقة الحجر المؤقت (Quarantine Bay)",
];

export function QuickQcModal({ open, onOpenChange, item, onSaved }: Props) {
  const { t, lang } = useI18n();
  const [qcStatus, setQcStatus] = useState<QcStatus>("quarantine");
  const [storageLocation, setStorageLocation] = useState("");
  const [coaNumber, setCoaNumber] = useState("");
  const [qcNotes, setQcNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Confectionery Checklist toggles state
  const [checks, setChecks] = useState({
    sensory: false,
    moisture: false,
    fatFfa: false,
    packaging: false,
    microbio: false,
    coa: false,
  });

  useEffect(() => {
    if (item) {
      setQcStatus(item.qc_status ?? "quarantine");
      setStorageLocation(item.storage_location ?? "");
      setCoaNumber(item.coa_number ?? "");
      setQcNotes(item.qc_notes ?? "");

      // Pre-check if current notes contain checklist signatures
      const notes = item.qc_notes ?? "";
      setChecks({
        sensory: notes.includes("[✓ Sensory]") || notes.includes("[✓ حسي]"),
        moisture: notes.includes("[✓ Moisture]") || notes.includes("[✓ رطوبة]"),
        fatFfa: notes.includes("[✓ Fat/FFA]") || notes.includes("[✓ دهون]"),
        packaging: notes.includes("[✓ Packaging]") || notes.includes("[✓ تغليف]"),
        microbio: notes.includes("[✓ Microbio]") || notes.includes("[✓ ميكروبيولوجي]"),
        coa: notes.includes("[✓ COA]") || !!item.coa_number,
      });
    }
  }, [item]);

  const toggleCheck = (key: keyof typeof checks, tag: string) => {
    setChecks((prev) => {
      const next = !prev[key];
      const updated = { ...prev, [key]: next };

      // Update qcNotes text to reflect checklist
      let currentNotes = qcNotes;
      if (next) {
        if (!currentNotes.includes(tag)) {
          currentNotes = currentNotes ? `${currentNotes}\n${tag}` : tag;
        }
      } else {
        currentNotes = currentNotes
          .replace(tag, "")
          .replace(/\n\n+/g, "\n")
          .trim();
      }
      setQcNotes(currentNotes);
      return updated;
    });
  };

  const handleSave = async (overrideStatus?: QcStatus) => {
    if (!item) return;
    setSaving(true);
    const finalStatus = overrideStatus ?? qcStatus;

    try {
      const { error } = await supabase
        .from("items")
        .update({
          qc_status: finalStatus,
          storage_location: storageLocation.trim() || null,
          coa_number: coaNumber.trim() || null,
          qc_notes: qcNotes.trim() || null,
        })
        .eq("id", item.id);

      if (error) throw error;

      toast.success(t("qcDecisionUpdated"));
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errGeneric"));
    } finally {
      setSaving(false);
    }
  };

  const handleQuickApproveAll = () => {
    // Release immediately to production with all quality parameters confirmed
    setQcStatus("approved");
    const verifiedNotes = [
      qcNotes.replace(/\[✓.*?\]/g, "").trim(),
      "[✓ حسي / Sensory: مطابق]",
      "[✓ رطوبة / Moisture: مطابقة لمواصفة فينا]",
      "[✓ دهن وحموضة / Fat & FFA: سليم خالي من التزنخ]",
      "[✓ تغليف وخلو شوائب / Packaging & Foreign Matter: سليم 100%]",
      "[✓ شهادة تحليل / COA: تم الاعتماد]",
    ]
      .filter(Boolean)
      .join("\n");

    setQcNotes(verifiedNotes);
    setChecks({
      sensory: true,
      moisture: true,
      fatFfa: true,
      packaging: true,
      microbio: true,
      coa: true,
    });

    void handleSave("approved");
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="border-b pb-3 text-start">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand">
            <Building2 className="size-4" />
            <span>{t("viennaFactoryTitle")}</span>
          </div>
          <DialogTitle className="text-xl font-serif font-bold text-cocoa">
            {t("quickQcTitle")}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{t("quickQcSubtitle")}</p>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Item Identification Card */}
          <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-mono text-xs font-semibold text-brand">
                  {item.item_code ? `[${item.item_code}]` : ""} #{item.batch_number || "NO-BATCH"}
                </span>
                <h3 className="text-base font-bold text-cocoa leading-snug">{item.name}</h3>
                <p className="text-xs text-muted-foreground">{item.supplier || "—"}</p>
              </div>
              <div className="text-start sm:text-end text-xs">
                <span className="text-muted-foreground block">{t("expiryDate")}</span>
                <span className="font-mono font-bold text-foreground">{item.expiry_date}</span>
                {item.quantity != null && (
                  <span className="block text-[11px] font-semibold text-cocoa">
                    {item.quantity} {item.unit ?? ""}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Decision Big Touch Selector */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-cocoa uppercase tracking-wide">
              {t("qcInspectorDecision")}
            </Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {/* Approved */}
              <button
                type="button"
                onClick={() => setQcStatus("approved")}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                  qcStatus === "approved"
                    ? "border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500 shadow-sm dark:bg-emerald-950/40 dark:text-emerald-200"
                    : "border-border/80 bg-card hover:border-emerald-300 hover:bg-emerald-50/50"
                }`}
              >
                <div className="flex size-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                  <Check className="size-4" />
                </div>
                <span className="text-xs font-bold">{t("approved")}</span>
                <span className="text-[10px] text-muted-foreground">{t("filterReleased")}</span>
              </button>

              {/* Quarantine */}
              <button
                type="button"
                onClick={() => setQcStatus("quarantine")}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                  qcStatus === "quarantine"
                    ? "border-amber-600 bg-amber-50 text-amber-900 ring-2 ring-amber-500 shadow-sm dark:bg-amber-950/40 dark:text-amber-200"
                    : "border-border/80 bg-card hover:border-amber-300 hover:bg-amber-50/50"
                }`}
              >
                <div className="flex size-8 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
                  <Clock className="size-4" />
                </div>
                <span className="text-xs font-bold">{t("quarantine")}</span>
                <span className="text-[10px] text-muted-foreground">{t("filterAwaitingQc")}</span>
              </button>

              {/* Conditional */}
              <button
                type="button"
                onClick={() => setQcStatus("conditional")}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                  qcStatus === "conditional"
                    ? "border-purple-600 bg-purple-50 text-purple-900 ring-2 ring-purple-500 shadow-sm dark:bg-purple-950/40 dark:text-purple-200"
                    : "border-border/80 bg-card hover:border-purple-300 hover:bg-purple-50/50"
                }`}
              >
                <div className="flex size-8 items-center justify-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300">
                  <AlertTriangle className="size-4" />
                </div>
                <span className="text-xs font-bold">{t("conditional")}</span>
                <span className="text-[10px] text-muted-foreground">صرف مشروط للخلط</span>
              </button>

              {/* Rejected */}
              <button
                type="button"
                onClick={() => setQcStatus("rejected")}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                  qcStatus === "rejected"
                    ? "border-rose-600 bg-rose-50 text-rose-900 ring-2 ring-rose-500 shadow-sm dark:bg-rose-950/40 dark:text-rose-200"
                    : "border-border/80 bg-card hover:border-rose-300 hover:bg-rose-50/50"
                }`}
              >
                <div className="flex size-8 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300">
                  <XCircle className="size-4" />
                </div>
                <span className="text-xs font-bold">{t("rejected")}</span>
                <span className="text-[10px] text-muted-foreground">{t("filterRejected")}</span>
              </button>
            </div>
          </div>

          {/* Confectionery Quality Checklist (Vienna Factory Standards) */}
          <div className="space-y-2.5 rounded-xl border bg-card p-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cocoa flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-emerald-600" />
                {t("appliedChecklist")}
              </span>
              <span className="text-[11px] text-muted-foreground">معايير فحص مصنع فينا</span>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => toggleCheck("sensory", "[✓ حسي / Sensory: مطابق]")}
                className={`flex items-center gap-2.5 rounded-lg border p-2 text-start text-xs font-medium transition-all ${
                  checks.sensory
                    ? "border-emerald-500 bg-emerald-50/70 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-200"
                    : "border-border/70 hover:bg-muted/50"
                }`}
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                    checks.sensory ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/50"
                  }`}
                >
                  {checks.sensory && <Check className="size-3" />}
                </span>
                <span>{t("checkSensory")}</span>
              </button>

              <button
                type="button"
                onClick={() => toggleCheck("moisture", "[✓ رطوبة / Moisture: مطابقة لمواصفة فينا]")}
                className={`flex items-center gap-2.5 rounded-lg border p-2 text-start text-xs font-medium transition-all ${
                  checks.moisture
                    ? "border-emerald-500 bg-emerald-50/70 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-200"
                    : "border-border/70 hover:bg-muted/50"
                }`}
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                    checks.moisture ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/50"
                  }`}
                >
                  {checks.moisture && <Check className="size-3" />}
                </span>
                <span>{t("checkMoisture")}</span>
              </button>

              <button
                type="button"
                onClick={() => toggleCheck("fatFfa", "[✓ دهن وحموضة / Fat & FFA: سليم خالي من التزنخ]")}
                className={`flex items-center gap-2.5 rounded-lg border p-2 text-start text-xs font-medium transition-all ${
                  checks.fatFfa
                    ? "border-emerald-500 bg-emerald-50/70 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-200"
                    : "border-border/70 hover:bg-muted/50"
                }`}
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                    checks.fatFfa ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/50"
                  }`}
                >
                  {checks.fatFfa && <Check className="size-3" />}
                </span>
                <span>{t("checkFatFfa")}</span>
              </button>

              <button
                type="button"
                onClick={() => toggleCheck("packaging", "[✓ تغليف وخلو شوائب / Packaging: سليم 100%]")}
                className={`flex items-center gap-2.5 rounded-lg border p-2 text-start text-xs font-medium transition-all ${
                  checks.packaging
                    ? "border-emerald-500 bg-emerald-50/70 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-200"
                    : "border-border/70 hover:bg-muted/50"
                }`}
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                    checks.packaging ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/50"
                  }`}
                >
                  {checks.packaging && <Check className="size-3" />}
                </span>
                <span>{t("checkPackaging")}</span>
              </button>

              <button
                type="button"
                onClick={() => toggleCheck("microbio", "[✓ ميكروبيولوجي / Microbio: سلامة تامة]")}
                className={`flex items-center gap-2.5 rounded-lg border p-2 text-start text-xs font-medium transition-all ${
                  checks.microbio
                    ? "border-emerald-500 bg-emerald-50/70 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-200"
                    : "border-border/70 hover:bg-muted/50"
                }`}
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                    checks.microbio ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/50"
                  }`}
                >
                  {checks.microbio && <Check className="size-3" />}
                </span>
                <span>{t("checkMicrobio")}</span>
              </button>

              <button
                type="button"
                onClick={() => toggleCheck("coa", "[✓ شهادة تحليل / COA: معتمدة]")}
                className={`flex items-center gap-2.5 rounded-lg border p-2 text-start text-xs font-medium transition-all ${
                  checks.coa
                    ? "border-emerald-500 bg-emerald-50/70 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-200"
                    : "border-border/70 hover:bg-muted/50"
                }`}
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                    checks.coa ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/50"
                  }`}
                >
                  {checks.coa && <Check className="size-3" />}
                </span>
                <span>{t("checkCoa")}</span>
              </button>
            </div>
          </div>

          {/* Storage Location & Presets */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-cocoa flex items-center gap-1.5">
                <MapPin className="size-3.5 text-brand" />
                {t("storageLocation")}
              </Label>
              <span className="text-[11px] text-muted-foreground">اختر موقع التخزين في المصنع</span>
            </div>
            <Input
              value={storageLocation}
              onChange={(e) => setStorageLocation(e.target.value)}
              placeholder={t("recommendedStorage")}
              className="font-medium"
            />
            {/* Quick Storage Chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {STORAGE_PRESETS.map((preset) => {
                const isSelected = storageLocation.includes(preset.split(" ")[0]);
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setStorageLocation(preset)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      isSelected
                        ? "bg-brand text-brand-foreground shadow-xs"
                        : "bg-muted/70 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {preset.split(" (")[0]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* COA Number & QC Notes */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label className="text-xs font-semibold text-cocoa flex items-center gap-1.5">
                <FileText className="size-3.5 text-brand" />
                {t("coaNumber")}
              </Label>
              <Input
                value={coaNumber}
                onChange={(e) => setCoaNumber(e.target.value)}
                placeholder="COA-2026-..."
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-semibold text-cocoa">{t("qcNotes")}</Label>
              <Textarea
                value={qcNotes}
                onChange={(e) => setQcNotes(e.target.value)}
                placeholder="ملاحظات مهندس الجودة، نتائج الفحص المخبري، توصيات الاستخدام..."
                className="min-h-[70px] text-xs"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 border-t pt-4">
          <Button
            type="button"
            variant="default"
            className="w-full sm:w-auto bg-emerald-600 text-white hover:bg-emerald-700 gap-1.5 font-bold shadow-sm"
            onClick={handleQuickApproveAll}
            disabled={saving}
          >
            <Sparkles className="size-4" />
            <span>{t("quickRelease")}</span>
          </Button>

          <div className="flex w-full sm:w-auto items-center gap-2 sm:ms-auto">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="flex-1 sm:flex-none"
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => handleSave()}
              disabled={saving}
              className="flex-1 sm:flex-none bg-brand hover:bg-brand/90"
            >
              {saving ? t("loading") : t("save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
