import { useEffect, useRef, useState } from "react";
import { QrCode, X, Plus, Trash2, Camera, Star, Images, RotateCw, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useRegisterBackModal } from "@/lib/modal-stack";
import {
  isSupportedImage,
  rotateImageBlob,
  deleteItemPhoto,
  uploadItemPhoto,
  signedPhotoUrls,
  parsePhotos,
  serializePhotos,
} from "@/lib/photos";
import { logActivity } from "@/lib/activity-logger";
import { BarcodeScannerDialog } from "@/components/BarcodeScannerDialog";
import { ProductImageViewerDialog } from "@/components/ProductImageViewerDialog";
import { CameraCaptureModal } from "@/components/CameraCaptureModal";
import { FlexibleDateInput } from "@/components/FlexibleDateInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type QcStatus = "quarantine" | "approved" | "rejected" | "conditional";

export interface ItemRow {
  id: string;
  item_code: string | null;
  batch_number?: string | null | undefined;
  name: string;
  supplier: string | null;
  production_date: string | null;
  expiry_date: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  photo_path: string | null;
  last_notified_status: string | null;
  qc_status?: QcStatus | null | undefined;
  storage_location?: string | null | undefined;
  qc_notes?: string | null | undefined;
  coa_number?: string | null | undefined;
}

interface FormState {
  item_code: string;
  batch_number: string;
  name: string;
  supplier: string;
  production_date: string;
  expiry_date: string;
  quantity: string;
  unit: string;
  notes: string;
  qc_status: QcStatus;
  storage_location: string;
  qc_notes: string;
  coa_number: string;
}

const empty: FormState = {
  item_code: "",
  batch_number: "",
  name: "",
  supplier: "",
  production_date: "",
  expiry_date: "",
  quantity: "",
  unit: "",
  notes: "",
  qc_status: "quarantine",
  storage_location: "",
  qc_notes: "",
  coa_number: "",
};

interface FormPhotoItem {
  id: string;
  path?: string | undefined;
  file?: File | undefined;
  previewUrl: string;
  caption: string;
}

export function ItemFormDialog({
  open,
  onOpenChange,
  item,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: ItemRow | null;
  onSaved: () => void;
}) {
  const { t, lang } = useI18n();
  const [form, setForm] = useState<FormState>(empty);
  const [busy, setBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  // Multi-photo state & Camera modals
  const fileInput = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<FormPhotoItem[]>([]);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  // Register dialogs in back stack (LIFO order: nested sub-modals close before parent form)
  useRegisterBackModal(open, () => onOpenChange(false), "item-form-main");
  useRegisterBackModal(scannerOpen, () => setScannerOpen(false), "item-form-scanner");
  useRegisterBackModal(viewerOpen, () => setViewerOpen(false), "item-form-viewer");
  useRegisterBackModal(cameraModalOpen, () => setCameraModalOpen(false), "item-form-camera");

  useEffect(() => {
    if (!open) return;
    setCodeError(null);
    setForm(
      item
        ? {
            item_code: item.item_code ?? "",
            batch_number: item.batch_number ?? "",
            name: item.name,
            supplier: item.supplier ?? "",
            production_date: item.production_date ?? "",
            expiry_date: item.expiry_date,
            quantity: item.quantity != null ? String(item.quantity) : "",
            unit: item.unit ?? "",
            notes: item.notes ?? "",
            qc_status: item.qc_status ?? "quarantine",
            storage_location: item.storage_location ?? "",
            qc_notes: item.qc_notes ?? "",
            coa_number: item.coa_number ?? "",
          }
        : empty,
    );

    // Load photos
    if (item?.photo_path) {
      const parsed = parsePhotos(item.photo_path);
      if (parsed.length > 0) {
        void signedPhotoUrls(parsed.map((p) => p.path)).then((urlMap) => {
          setPhotos(
            parsed.map((p) => ({
              id: p.id,
              path: p.path,
              previewUrl: urlMap[p.path] || "",
              caption: p.caption || "",
            })),
          );
        });
      } else {
        setPhotos([]);
      }
    } else {
      setPhotos([]);
    }
  }, [open, item]);

  const set = (key: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const addPhotoFile = (file: File) => {
    const newItem: FormPhotoItem = {
      id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      caption: "",
    };
    setPhotos((prev) => [...prev, newItem]);
  };

  const pickFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newItems: FormPhotoItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;
      if (!isSupportedImage(file)) {
        toast.error(t("errPhotoType"));
        continue;
      }
      newItems.push({
        id: `new-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        caption: "",
      });
    }
    setPhotos((prev) => [...prev, ...newItems]);
    if (fileInput.current) fileInput.current.value = "";
  };

  const handleRotatePhoto = async (id: string) => {
    const target = photos.find((p) => p.id === id);
    if (!target) return;

    try {
      let sourceBlob: Blob;
      if (target.file) {
        sourceBlob = target.file;
      } else {
        const res = await fetch(target.previewUrl);
        sourceBlob = await res.blob();
      }

      const rotatedBlob = await rotateImageBlob(sourceBlob, 90);
      const newFile = new File([rotatedBlob], `rotated-${Date.now()}.jpg`, { type: "image/jpeg" });
      const newUrl = URL.createObjectURL(rotatedBlob);

      setPhotos((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, file: newFile, previewUrl: newUrl } : p,
        ),
      );
      toast.success(lang === "ar" ? "تم تدوير الصورة 90°" : "Photo rotated 90°");
    } catch (err) {
      console.error("Rotate error:", err);
      toast.error(lang === "ar" ? "فشل تدوير الصورة" : "Failed to rotate photo");
    }
  };

  const updatePhotoCaption = (id: string, caption: string) => {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, caption } : p)));
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const setPrimaryPhoto = (index: number) => {
    if (index === 0) return;
    setPhotos((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      if (moved) copy.unshift(moved);
      return copy;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeError(null);
    if (!form.item_code.trim()) {
      setCodeError(t("errRequiredCode"));
      toast.error(t("errRequiredCode"));
      return;
    }
    if (!form.name.trim()) {
      toast.error(t("errRequiredName"));
      return;
    }
    if (!form.expiry_date) {
      toast.error(t("errRequiredExpiry"));
      return;
    }
    if (form.production_date && form.expiry_date && form.production_date > form.expiry_date) {
      toast.error(t("errProductionAfterExpiry"));
      return;
    }
    const quantity = form.quantity === "" ? null : Number(form.quantity);
    if (quantity != null && (Number.isNaN(quantity) || quantity < 0)) {
      toast.error(t("errQuantity"));
      return;
    }

    setBusy(true);
    const newlyUploadedPaths: string[] = [];
    try {
      // 1. Upload pending new photo files
      const finalPhotoList: Array<{ path: string; caption?: string | undefined }> = [];
      for (const p of photos) {
        if (p.file) {
          const uploadedPath = await uploadItemPhoto(p.file);
          newlyUploadedPaths.push(uploadedPath);
          finalPhotoList.push({ path: uploadedPath, caption: p.caption });
        } else if (p.path) {
          finalPhotoList.push({ path: p.path, caption: p.caption });
        }
      }

      const photo_path = serializePhotos(finalPhotoList);

      const payload = {
        item_code: form.item_code.trim(),
        batch_number: form.batch_number.trim() || null,
        name: form.name.trim(),
        supplier: form.supplier.trim() || null,
        production_date: form.production_date || null,
        expiry_date: form.expiry_date,
        quantity,
        unit: form.unit.trim() || null,
        notes: form.notes.trim() || null,
        photo_path,
        qc_status: form.qc_status,
        storage_location: form.storage_location.trim() || null,
        qc_notes: form.qc_notes.trim() || null,
        coa_number: form.coa_number.trim() || null,
      };

      if (item) {
        const reset =
          item.expiry_date !== payload.expiry_date ? { last_notified_status: null } : {};
        const { error } = await supabase
          .from("items")
          .update({ ...payload, ...reset })
          .eq("id", item.id);
        if (error) throw error;

        void logActivity({
          action_type: "item_update",
          entity_id: item.id,
          entity_name: `${payload.name} (${payload.batch_number || "No Batch"})`,
          details: {
            expiry_date: payload.expiry_date,
            quantity: payload.quantity,
            unit: payload.unit,
            supplier: payload.supplier,
            storage_location: payload.storage_location,
            qc_status: payload.qc_status,
          },
        });

        // Clean up any deleted photos from storage
        if (item.photo_path) {
          const prevPhotos = parsePhotos(item.photo_path);
          const remainingPaths = new Set(finalPhotoList.map((p) => p.path));
          for (const prev of prevPhotos) {
            if (prev.path && !remainingPaths.has(prev.path)) {
              await deleteItemPhoto(prev.path);
            }
          }
        }
      } else {
        const { data: user } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("items")
          .insert({ ...payload, created_by: user.user?.id ?? null });
        if (error) throw error;

        void logActivity({
          action_type: "item_create",
          entity_name: `${payload.name} (${payload.batch_number || "No Batch"})`,
          details: {
            expiry_date: payload.expiry_date,
            quantity: payload.quantity,
            unit: payload.unit,
            supplier: payload.supplier,
            storage_location: payload.storage_location,
            qc_status: payload.qc_status,
          },
        });
      }

      toast.success(t("saved"));
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      for (const p of newlyUploadedPaths) {
        await deleteItemPhoto(p);
      }
      console.error("[ItemFormDialog] Submit failed:", err);
      const errObj = err as { code?: string; message?: string; details?: string; hint?: string } | null;
      const code = errObj?.code;
      const msg =
        errObj?.message ||
        (err instanceof Error ? err.message : "") ||
        "";

      if (code === "23505" || msg.includes("items_item_code_unique") || msg.includes("duplicate key")) {
        setCodeError(t("errDuplicateCode"));
        toast.error(t("errDuplicateCode"));
      } else if (code === "42501" || msg.includes("violates row-level security policy") || msg.includes("permission denied")) {
        toast.error(
          lang === "ar"
            ? "ليس لديك صلاحية لإضافة أو تعديل الأصناف (صلاحية مشاهد فقط أو التطبيق في وضع الصيانة)."
            : "You do not have permission to modify inventory items (View-only role or App is locked)."
        );
      } else {
        toast.error(msg || t("errGeneric"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 flex flex-col max-h-[92dvh] sm:max-h-[90vh] overflow-hidden">
        <DialogHeader className="px-4 pt-4 sm:px-6 sm:pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle>{item ? t("editItem") : t("addItem")}</DialogTitle>
        </DialogHeader>

        <form id="item-form" onSubmit={submit} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 overscroll-contain">
          {/* Item Code with Barcode Scanner button */}
          <div className="space-y-1.5">
            <Label htmlFor="item_code">
              {t("itemCode")} <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="item_code"
                value={form.item_code}
                onChange={(e) => {
                  setCodeError(null);
                  set("item_code")(e);
                }}
                placeholder="e.g. RM-COCOA-001"
                className={codeError ? "border-destructive font-mono" : "font-mono"}
                required
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
            {codeError && <p className="text-xs text-destructive">{codeError}</p>}
          </div>

          {/* Batch Number */}
          <div className="space-y-1.5">
            <Label htmlFor="batch_number">
              {t("batchNumber")}
            </Label>
            <Input
              id="batch_number"
              value={form.batch_number}
              onChange={set("batch_number")}
              placeholder="e.g. LOT-2026-04"
              className="font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">
              {t("name")} <span className="text-destructive">*</span>
            </Label>
            <Input id="name" value={form.name} onChange={set("name")} required />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="supplier">{t("supplier")}</Label>
              <Input id="supplier" value={form.supplier} onChange={set("supplier")} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="coa_number">{t("coaNumber")}</Label>
              <Input
                id="coa_number"
                placeholder="e.g. COA-9872"
                value={form.coa_number}
                onChange={set("coa_number")}
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="production_date">{t("productionDate")}</Label>
              <FlexibleDateInput
                id="production_date"
                value={form.production_date}
                onChange={(val) => setForm((f) => ({ ...f, production_date: val }))}
                placeholder="5/9/2026"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expiry_date">
                {t("expiryDate")} <span className="text-destructive">*</span>
              </Label>
              <FlexibleDateInput
                id="expiry_date"
                value={form.expiry_date}
                onChange={(val) => setForm((f) => ({ ...f, expiry_date: val }))}
                placeholder="5/9/2026"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="quantity">{t("quantity")}</Label>
              <Input
                id="quantity"
                type="number"
                step="any"
                min="0"
                value={form.quantity}
                onChange={set("quantity")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit">{t("unit")}</Label>
              <Input
                id="unit"
                value={form.unit}
                onChange={set("unit")}
                placeholder="kg, L, bags"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qc_status">{t("qcStatus")}</Label>
              <Select
                value={form.qc_status}
                onValueChange={(v) => setForm((f) => ({ ...f, qc_status: v as QcStatus }))}
              >
                <SelectTrigger id="qc_status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quarantine">🔒 {t("quarantine")}</SelectItem>
                  <SelectItem value="approved">✅ {t("approved")}</SelectItem>
                  <SelectItem value="rejected">❌ {t("rejected")}</SelectItem>
                  <SelectItem value="conditional">⚠️ {t("conditional")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="storage_location">{t("storageLocation")}</Label>
              <Input
                id="storage_location"
                placeholder="e.g. Cold Storage A, Dry Store 2"
                value={form.storage_location}
                onChange={set("storage_location")}
              />
            </div>
          </div>

          {/* Multi-Photo Manager with Camera & Descriptions */}
          <div className="space-y-2.5 rounded-xl border border-border/80 bg-muted/20 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs font-bold text-cocoa flex items-center gap-1.5">
                <Images className="size-4 text-brand" />
                <span>{t("photoOptional")}</span>
                {photos.length > 0 && (
                  <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-bold text-brand">
                    {photos.length} {t("photoCountLabel")}
                  </span>
                )}
              </Label>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs bg-brand/10 border-brand/50 text-cocoa hover:bg-brand/20 font-bold"
                  onClick={() => setCameraModalOpen(true)}
                >
                  <Camera className="size-3.5 text-brand" />
                  <span>{t("captureCamera")}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs border-border text-muted-foreground hover:bg-muted/60"
                  onClick={() => fileInput.current?.click()}
                >
                  <Plus className="size-3.5" />
                  <span>{photos.length === 0 ? t("chooseFromGallery") : t("addMorePhotos")}</span>
                </Button>
              </div>
            </div>

            <input
              ref={fileInput}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => pickFiles(e.target.files)}
            />

            {photos.length === 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setCameraModalOpen(true)}
                  className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-brand/40 bg-brand/5 p-4 text-center transition-all hover:border-brand hover:bg-brand/10 group active:scale-98"
                >
                  <div className="size-11 rounded-full bg-brand/15 text-brand flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <Camera className="size-6" />
                  </div>
                  <p className="text-xs font-bold text-cocoa">{t("captureCamera")}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {lang === "ar" ? "فتح الكاميرا المباشرة وتصوير الشحنة" : "Open live camera to capture item"}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/80 bg-card p-4 text-center transition-all hover:border-brand/40 hover:bg-muted/40 group active:scale-98"
                >
                  <div className="size-11 rounded-full bg-muted text-muted-foreground flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <Images className="size-6" />
                  </div>
                  <p className="text-xs font-bold text-foreground">{t("chooseFromGallery")}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {lang === "ar" ? "رفع صور من المعرض أو الملفات" : "Upload photos from gallery or files"}
                  </p>
                </button>

                <div className="sm:col-span-2 text-center pt-0.5">
                  <button
                    type="button"
                    onClick={() => setCameraModalOpen(true)}
                    className="inline-flex items-center gap-1.5 text-[11px] text-brand hover:underline font-medium"
                  >
                    <Smartphone className="size-3" />
                    <span>{lang === "ar" ? "أو التقاط مباشر عبر الكاميرا مع المعاينة والتدوير" : "Or capture with camera preview & rotate"}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                {photos.map((p, idx) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-lg border border-border/70 bg-card p-2 shadow-2xs"
                  >
                    {/* Thumbnail click to preview */}
                    <div
                      className="relative size-12 shrink-0 cursor-pointer overflow-hidden rounded-md border bg-muted"
                      onClick={() => {
                        setViewerIndex(idx);
                        setViewerOpen(true);
                      }}
                      title={t("clickToInspect")}
                    >
                      <img
                        src={p.previewUrl}
                        alt={p.caption || `Photo ${idx + 1}`}
                        className="size-full object-cover"
                      />
                      {idx === 0 && (
                        <span className="absolute bottom-0 inset-x-0 bg-brand text-[8px] font-bold text-white text-center leading-tight py-0.2">
                          ★ {t("primaryPhoto")}
                        </span>
                      )}
                    </div>

                    {/* Caption / Description Input */}
                    <div className="flex-1 min-w-0">
                      <Input
                        value={p.caption}
                        onChange={(e) => updatePhotoCaption(p.id, e.target.value)}
                        placeholder={t("photoCaption")}
                        className="h-8 text-xs font-medium"
                      />
                    </div>

                    {/* Actions: Primary, Rotate, Delete */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      {idx !== 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-brand"
                          title="تعيين كصورة رئيسية"
                          onClick={() => setPrimaryPhoto(idx)}
                        >
                          <Star className="size-3.5" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-brand"
                        title={lang === "ar" ? "تدوير الصورة 90°" : "Rotate 90°"}
                        onClick={() => void handleRotatePhoto(p.id)}
                      >
                        <RotateCw className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        title={t("removePhoto")}
                        onClick={() => removePhoto(p.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">{t("notes")}</Label>
            <Textarea id="notes" rows={2} value={form.notes} onChange={set("notes")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qc_notes">{t("qcNotes")}</Label>
            <Textarea
              id="qc_notes"
              rows={2}
              placeholder="e.g. Sensory inspection passed, moisture 3.2%"
              value={form.qc_notes}
              onChange={set("qc_notes")}
            />
          </div>

        </form>

        <DialogFooter className="gap-2 px-4 sm:px-6 py-3 border-t border-border shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom,12px))]">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button form="item-form" type="submit" disabled={busy}>
            {busy ? t("saving") : t("save")}
          </Button>
        </DialogFooter>

        <BarcodeScannerDialog
          open={scannerOpen}
          onOpenChange={setScannerOpen}
          onDetected={(code) => {
            setCodeError(null);
            setForm((f) => ({ ...f, item_code: code }));
          }}
        />

        <ProductImageViewerDialog
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          initialIndex={viewerIndex}
          onSaveRotation={(idx, rotatedBlob) => {
            const target = photos[idx];
            if (!target) return;
            const newFile = new File([rotatedBlob], target.file?.name || `photo_${Date.now()}.jpg`, {
              type: "image/jpeg",
            });
            const newPreviewUrl = URL.createObjectURL(rotatedBlob);
            setPhotos((prev) =>
              prev.map((p, i) =>
                i === idx ? { ...p, file: newFile, previewUrl: newPreviewUrl } : p
              )
            );
          }}
          item={
            photos.length > 0
              ? {
                  photos: photos.map((p) => ({
                    url: p.previewUrl,
                    caption: p.caption,
                  })),
                  name: form.name || t("photo"),
                  itemCode: form.item_code,
                  batchNumber: form.batch_number,
                  supplier: form.supplier,
                  expiryDate: form.expiry_date,
                  qcStatus: form.qc_status,
                }
              : null
          }
        />

        <CameraCaptureModal
          open={cameraModalOpen}
          onOpenChange={setCameraModalOpen}
          onPhotoCaptured={addPhotoFile}
        />
      </DialogContent>
    </Dialog>
  );
}
