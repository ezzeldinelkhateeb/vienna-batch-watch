import { useEffect, useRef, useState } from "react";
import { ImageIcon, QrCode, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import {
  ACCEPTED_PHOTO_TYPES,
  deleteItemPhoto,
  signedPhotoUrl,
  uploadItemPhoto,
} from "@/lib/photos";
import { BarcodeScannerDialog } from "@/components/BarcodeScannerDialog";
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
  batch_number?: string | null;
  name: string;
  supplier: string | null;
  production_date: string | null;
  expiry_date: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  photo_path: string | null;
  last_notified_status: string | null;
  qc_status?: QcStatus | null;
  storage_location?: string | null;
  qc_notes?: string | null;
  coa_number?: string | null;
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
  const { t } = useI18n();
  const [form, setForm] = useState<FormState>(empty);
  const [busy, setBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  // photo state
  const fileInput = useRef<HTMLInputElement>(null);
  const [existingPath, setExistingPath] = useState<string | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCodeError(null);
    setNewFile(null);
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
    setExistingPath(item?.photo_path ?? null);
    setPreviewUrl(null);
    if (item?.photo_path) {
      void signedPhotoUrl(item.photo_path).then((url) => setPreviewUrl(url));
    }
  }, [open, item]);

  const set = (key: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const pickFile = (file: File | null) => {
    if (!file) return;
    if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
      toast.error(t("errPhotoType"));
      return;
    }
    setNewFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const clearPhoto = () => {
    setNewFile(null);
    setPreviewUrl(null);
    setExistingPath(null);
    if (fileInput.current) fileInput.current.value = "";
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
    let uploadedPath: string | null = null;
    try {
      if (newFile) {
        uploadedPath = await uploadItemPhoto(newFile);
      }
      const photo_path = newFile ? uploadedPath : existingPath;

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
        if (item.photo_path && item.photo_path !== photo_path) {
          await deleteItemPhoto(item.photo_path);
        }
      } else {
        const { data: user } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("items")
          .insert({ ...payload, created_by: user.user?.id ?? null });
        if (error) throw error;
      }
      toast.success(t("saved"));
      onSaved();
      onOpenChange(false);
    } catch (err) {
      if (uploadedPath) await deleteItemPhoto(uploadedPath);
      const code = (err as { code?: string } | null)?.code;
      const msg = err instanceof Error ? err.message : "";
      if (code === "23505" || msg.includes("items_item_code_unique")) {
        setCodeError(t("errDuplicateCode"));
        toast.error(t("errDuplicateCode"));
      } else {
        toast.error(msg || t("errGeneric"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? t("editItem") : t("addItem")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="item_code">{t("itemCode")} *</Label>
              <div className="flex gap-2">
                <Input
                  id="item_code"
                  value={form.item_code}
                  onChange={(e) => {
                    setCodeError(null);
                    set("item_code")(e);
                  }}
                  aria-invalid={codeError ? true : undefined}
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

            <div className="space-y-1.5">
              <Label htmlFor="batch_number">{t("batchNumber")}</Label>
              <Input
                id="batch_number"
                placeholder="e.g. BATCH-2026-001"
                value={form.batch_number}
                onChange={set("batch_number")}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">{t("name")} *</Label>
            <Input id="name" value={form.name} onChange={set("name")} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="supplier">{t("supplier")}</Label>
              <Input id="supplier" value={form.supplier} onChange={set("supplier")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coa_number">{t("coaNumber")}</Label>
              <Input
                id="coa_number"
                placeholder="e.g. COA-2026-881"
                value={form.coa_number}
                onChange={set("coa_number")}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="production_date">{t("productionDate")}</Label>
              <Input
                id="production_date"
                type="date"
                value={form.production_date}
                onChange={set("production_date")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expiry_date">{t("expiryDate")} *</Label>
              <Input
                id="expiry_date"
                type="date"
                required
                value={form.expiry_date}
                onChange={set("expiry_date")}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="quantity">{t("quantity")}</Label>
              <Input
                id="quantity"
                type="number"
                min="0"
                step="any"
                value={form.quantity}
                onChange={set("quantity")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit">{t("unit")}</Label>
              <Input id="unit" value={form.unit} onChange={set("unit")} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="qc_status">{t("qcStatus")}</Label>
              <Select
                value={form.qc_status}
                onValueChange={(val) => setForm((f) => ({ ...f, qc_status: val as QcStatus }))}
              >
                <SelectTrigger id="qc_status">
                  <SelectValue placeholder={t("qcStatus")} />
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

          <div className="space-y-1.5">
            <Label htmlFor="photo">{t("photoOptional")}</Label>
            <div className="flex items-center gap-3">
              <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                {previewUrl ? (
                  <img src={previewUrl} alt={t("photo")} className="size-full object-cover" />
                ) : (
                  <ImageIcon className="size-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  ref={fileInput}
                  id="photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  className="max-w-[15rem]"
                />
                {previewUrl && (
                  <Button type="button" variant="outline" onClick={clearPhoto}>
                    <X className="size-4" />
                    {t("removePhoto")}
                  </Button>
                )}
              </div>
            </div>
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

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (newFile ? t("uploadingPhoto") : t("saving")) : t("save")}
            </Button>
          </DialogFooter>
        </form>

        <BarcodeScannerDialog
          open={scannerOpen}
          onOpenChange={setScannerOpen}
          onDetected={(code) => {
            setCodeError(null);
            setForm((f) => ({ ...f, item_code: code }));
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
