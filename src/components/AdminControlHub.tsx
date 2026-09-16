import { useState, useEffect } from "react";
import {
  Sliders,
  Plus,
  Trash2,
  Edit2,
  Save,
  CheckCircle2,
  Sparkles,
  Link as LinkIcon,
  ExternalLink,
  FileText,
  Phone,
  Printer,
  Shield,
  Factory,
  Download,
  Share2,
  FolderOpen,
  ArrowUp,
  ArrowDown,
  Warehouse,
  ToggleLeft,
  Building2,
  RotateCcw,
  Eye,
  AlertCircle,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { logActivity } from "@/lib/activity-logger";
import { AdminActivityLog } from "@/components/AdminActivityLog";
import {
  useSettings,
  settingsQueryKey,
  type CustomActionButton,
  type FeatureFlags,
  DEFAULT_PRODUCTION_LINES,
  DEFAULT_STORAGE_LOCATIONS,
  DEFAULT_FEATURE_FLAGS,
} from "@/hooks/use-settings";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const AVAILABLE_ICONS = [
  { id: "link", label: "رابط Link" },
  { id: "external-link", label: "رابط خارجي External" },
  { id: "file-text", label: "مستند/تقرير File" },
  { id: "sparkles", label: "مميز Sparkles" },
  { id: "factory", label: "مصنع Factory" },
  { id: "shield", label: "حماية/جودة Shield" },
  { id: "printer", label: "طباعة Printer" },
  { id: "phone", label: "اتصال Phone" },
  { id: "download", label: "تحميل Download" },
  { id: "share", label: "مشاركة Share" },
  { id: "folder", label: "مجلد Folder" },
];

const AVAILABLE_COLORS = [
  { id: "default", label: "كلاسيكي (Default)", bg: "bg-card border-border" },
  { id: "brand", label: "بني فيينا (Brand)", bg: "bg-brand text-white" },
  { id: "emerald", label: "أخضر زمردي (Emerald)", bg: "bg-emerald-600 text-white" },
  { id: "amber", label: "كهرماني/ذهبي (Amber)", bg: "bg-amber-600 text-white" },
  { id: "rose", label: "وردي/أحمر (Rose)", bg: "bg-rose-600 text-white" },
  { id: "purple", label: "بنفسجي (Purple)", bg: "bg-purple-600 text-white" },
  { id: "blue", label: "أزرق ملكي (Blue)", bg: "bg-blue-600 text-white" },
];

type HubTab = "buttons" | "lines" | "locations" | "features" | "branding" | "logs";

export function AdminControlHub() {
  const { lang } = useI18n();
  const settings = useSettings();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<HubTab>("buttons");
  const [saving, setSaving] = useState(false);

  // Custom Buttons State
  const [buttons, setButtons] = useState<CustomActionButton[]>([]);
  const [buttonModalOpen, setButtonModalOpen] = useState(false);
  const [editingButton, setEditingButton] = useState<CustomActionButton | null>(null);

  // Production Lines State
  const [productionLines, setProductionLines] = useState<string[]>([]);
  const [newLineName, setNewLineName] = useState("");

  // Storage Locations State
  const [storageLocations, setStorageLocations] = useState<string[]>([]);
  const [newLocationName, setNewLocationName] = useState("");

  // Feature Flags State
  const [features, setFeatures] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS);

  // Branding State
  const [factoryName, setFactoryName] = useState("Vienna");
  const [systemTagline, setSystemTagline] = useState("Factory Batch Watch & Expiry Guard");

  // Sync with loaded settings
  useEffect(() => {
    if (!settings.data) return;
    setButtons(settings.data.custom_buttons ?? []);
    setProductionLines(settings.data.production_lines ?? DEFAULT_PRODUCTION_LINES);
    setStorageLocations(settings.data.storage_locations ?? DEFAULT_STORAGE_LOCATIONS);
    setFeatures(settings.data.feature_flags ?? DEFAULT_FEATURE_FLAGS);
    setFactoryName(settings.data.factory_name || "Vienna");
    setSystemTagline(settings.data.system_tagline || "Factory Batch Watch & Expiry Guard");
  }, [settings.data]);

  const persistToDatabase = async (updatedFields: Record<string, any>, successMessage?: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("app_settings")
        .update(updatedFields)
        .eq("id", true);

      if (error) throw error;

      await logActivity({
        action_type: "settings_update",
        entity_name: "إعدادات المصنع ولوحة التحكم",
        details: updatedFields,
      });

      await queryClient.invalidateQueries({ queryKey: settingsQueryKey });
      toast.success(
        successMessage ||
          (lang === "ar" ? "تم حفظ وتطبيق التعديلات بنجاح! ✅" : "Changes saved and applied! ✅"),
      );
    } catch (err: any) {
      console.error("Admin hub persist error:", err);
      toast.error(err?.message || (lang === "ar" ? "فشل حفظ التعديلات" : "Failed to save changes"));
    } finally {
      setSaving(false);
    }
  };

  // Button management handlers
  const handleOpenAddButton = () => {
    setEditingButton({
      id: "btn_" + Date.now(),
      label_ar: "",
      label_en: "",
      url: "",
      icon: "link",
      color: "brand",
      target: "_blank",
      is_active: true,
      order: buttons.length + 1,
    });
    setButtonModalOpen(true);
  };

  const handleSaveButtonModal = async () => {
    if (!editingButton) return;
    if (!editingButton.label_ar.trim() && !editingButton.label_en.trim()) {
      toast.error(lang === "ar" ? "يرجى كتابة عنوان الزر" : "Please enter button label");
      return;
    }
    if (!editingButton.url.trim()) {
      toast.error(lang === "ar" ? "يرجى كتابة الرابط أو المسار" : "Please enter button URL/path");
      return;
    }

    const exists = buttons.some((b) => b.id === editingButton.id);
    let nextButtons: CustomActionButton[];
    if (exists) {
      nextButtons = buttons.map((b) => (b.id === editingButton.id ? editingButton : b));
    } else {
      nextButtons = [...buttons, editingButton];
    }

    setButtons(nextButtons);
    setButtonModalOpen(false);
    setEditingButton(null);
    await persistToDatabase(
      { custom_buttons: nextButtons },
      lang === "ar" ? "تم حفظ الزر المخصص بنجاح" : "Custom button saved",
    );
  };

  const handleDeleteButton = async (id: string) => {
    const nextButtons = buttons.filter((b) => b.id !== id);
    setButtons(nextButtons);
    await persistToDatabase(
      { custom_buttons: nextButtons },
      lang === "ar" ? "تم حذف الزر" : "Button deleted",
    );
  };

  const handleToggleActiveButton = async (id: string, active: boolean) => {
    const nextButtons = buttons.map((b) => (b.id === id ? { ...b, is_active: active } : b));
    setButtons(nextButtons);
    await persistToDatabase(
      { custom_buttons: nextButtons },
      lang === "ar" ? "تم تحديث حالة الزر" : "Button status updated",
    );
  };

  const handleMoveButton = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= buttons.length) return;

    const reordered = [...buttons];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    const indexed = reordered.map((b, i) => ({ ...b, order: i + 1 }));
    setButtons(indexed);
    await persistToDatabase({ custom_buttons: indexed });
  };

  // Production line handlers
  const handleAddLine = async () => {
    const name = newLineName.trim();
    if (!name) return;
    if (productionLines.includes(name)) {
      toast.error(lang === "ar" ? "هذا الخط موجود بالفعل" : "Line already exists");
      return;
    }
    const nextLines = [...productionLines, name];
    setProductionLines(nextLines);
    setNewLineName("");
    await persistToDatabase(
      { production_lines: nextLines },
      lang === "ar" ? "تمت إضافة خط الإنتاج بنجاح" : "Production line added",
    );
  };

  const handleDeleteLine = async (name: string) => {
    const nextLines = productionLines.filter((l) => l !== name);
    setProductionLines(nextLines);
    await persistToDatabase(
      { production_lines: nextLines },
      lang === "ar" ? "تم حذف خط الإنتاج" : "Production line removed",
    );
  };

  const handleResetDefaultLines = async () => {
    setProductionLines(DEFAULT_PRODUCTION_LINES);
    await persistToDatabase(
      { production_lines: DEFAULT_PRODUCTION_LINES },
      lang === "ar" ? "تم استعادة خطوط المصنع الافتراضية" : "Reset default lines",
    );
  };

  // Storage locations handlers
  const handleAddLocation = async () => {
    const name = newLocationName.trim();
    if (!name) return;
    if (storageLocations.includes(name)) {
      toast.error(lang === "ar" ? "هذا المستودع موجود بالفعل" : "Location already exists");
      return;
    }
    const nextLocations = [...storageLocations, name];
    setStorageLocations(nextLocations);
    setNewLocationName("");
    await persistToDatabase(
      { storage_locations: nextLocations },
      lang === "ar" ? "تمت إضافة موقع التخزين بنجاح" : "Storage location added",
    );
  };

  const handleDeleteLocation = async (name: string) => {
    const nextLocations = storageLocations.filter((l) => l !== name);
    setStorageLocations(nextLocations);
    await persistToDatabase(
      { storage_locations: nextLocations },
      lang === "ar" ? "تم حذف موقع التخزين" : "Storage location removed",
    );
  };

  const handleResetDefaultLocations = async () => {
    setStorageLocations(DEFAULT_STORAGE_LOCATIONS);
    await persistToDatabase(
      { storage_locations: DEFAULT_STORAGE_LOCATIONS },
      lang === "ar" ? "تم استعادة المستودعات الافتراضية" : "Reset default locations",
    );
  };

  // Feature flag handlers
  const handleToggleFeature = async (key: keyof FeatureFlags, val: boolean) => {
    const nextFeatures = { ...features, [key]: val };
    setFeatures(nextFeatures);
    await persistToDatabase(
      { feature_flags: nextFeatures },
      lang === "ar" ? "تم تحديث إعدادات القسم" : "Feature toggle updated",
    );
  };

  // Branding save handler
  const handleSaveBranding = async () => {
    await persistToDatabase(
      {
        factory_name: factoryName.trim() || "Vienna",
        system_tagline: systemTagline.trim() || "Factory Batch Watch & Expiry Guard",
      },
      lang === "ar" ? "تم حفظ هوية وشعار المصنع" : "Branding updated successfully",
    );
  };

  return (
    <div className="space-y-6">
      {/* Admin Hub Header Banner */}
      <div className="rounded-xl border border-brand/30 bg-gradient-to-r from-brand/15 via-amber-500/10 to-brand/5 p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-brand text-white shadow-xs">
                <Sliders className="size-4" />
              </div>
              <h2 className="text-base sm:text-lg font-bold text-cocoa">
                {lang === "ar" ? "لوحة التحكم الشاملة لإدارة المصنع (Admin Hub)" : "Factory Master Admin Control Hub"}
              </h2>
              <span className="rounded-full bg-brand/20 px-2.5 py-0.5 text-[11px] font-bold text-brand">
                {lang === "ar" ? "صلاحيات كاملة" : "Full Admin Control"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {lang === "ar"
                ? "تخصيص كامل لأزرار الفريق، خطوط الإنتاج، مستودعات التخزين، وتفعيل/إيقاف أقسام وميزات المنظومة."
                : "Full customization of team buttons, production lines, storage warehouses, and feature toggles."}
            </p>
          </div>
        </div>
      </div>

      {/* Hub Sub-navigation */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-border/70 bg-muted/40 p-1.5 shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab("buttons")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-all ${
            activeTab === "buttons"
              ? "bg-card text-brand shadow-xs ring-1 ring-border/50"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <LinkIcon className="size-4" />
          <span>{lang === "ar" ? "أزرار الفريق والمهام" : "Custom Buttons"}</span>
          <span className="rounded-md bg-muted px-1.5 py-0.2 text-[10px] font-mono">
            {buttons.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("lines")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-all ${
            activeTab === "lines"
              ? "bg-card text-brand shadow-xs ring-1 ring-border/50"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Factory className="size-4" />
          <span>{lang === "ar" ? "خطوط الإنتاج" : "Production Lines"}</span>
          <span className="rounded-md bg-muted px-1.5 py-0.2 text-[10px] font-mono">
            {productionLines.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("locations")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-all ${
            activeTab === "locations"
              ? "bg-card text-brand shadow-xs ring-1 ring-border/50"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Warehouse className="size-4" />
          <span>{lang === "ar" ? "المستودعات والثلاجات" : "Storage Locations"}</span>
          <span className="rounded-md bg-muted px-1.5 py-0.2 text-[10px] font-mono">
            {storageLocations.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("features")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-all ${
            activeTab === "features"
              ? "bg-card text-brand shadow-xs ring-1 ring-border/50"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ToggleLeft className="size-4" />
          <span>{lang === "ar" ? "أقسام وميزات النظام" : "Feature Toggles"}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("branding")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-all ${
            activeTab === "branding"
              ? "bg-card text-brand shadow-xs ring-1 ring-border/50"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Building2 className="size-4" />
          <span>{lang === "ar" ? "هوية المصنع والشعار" : "Factory Branding"}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("logs")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-all ${
            activeTab === "logs"
              ? "bg-card text-brand shadow-xs ring-1 ring-border/50"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <History className="size-4" />
          <span>{lang === "ar" ? "سجل تدقيق الأنشطة" : "Audit Trail"}</span>
        </button>
      </div>

      {/* Tab 1: Custom Action Buttons */}
      {activeTab === "buttons" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-xs">
            <div>
              <h3 className="text-sm font-bold text-foreground">
                {lang === "ar" ? "إدارة أزرار وروابط المهام السريعة" : "Manage Quick Action Buttons"}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {lang === "ar"
                  ? "أزرار تظهر أعلى شاشة المخزون لجميع عمال وفنيي المصنع (مثل شيتات الإكسل، تقارير الإنتاج، جروب الواتساب، أو الأقسام الداخلية)."
                  : "Buttons visible to all factory staff at top of inventory (e.g. Google sheets, external ERP, production WhatsApp)."}
              </p>
            </div>
            <Button
              type="button"
              onClick={handleOpenAddButton}
              className="shrink-0 gap-1.5 bg-brand text-brand-foreground text-xs shadow-xs"
            >
              <Plus className="size-4" />
              <span>{lang === "ar" ? "إضافة زر جديد" : "Add New Button"}</span>
            </Button>
          </div>

          {buttons.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-8 text-center">
              <LinkIcon className="mx-auto size-8 text-muted-foreground/60 mb-2" />
              <p className="text-sm font-bold text-foreground">
                {lang === "ar" ? "لا توجد أزرار مخصصة بعد" : "No custom buttons added yet"}
              </p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1 mb-4">
                {lang === "ar"
                  ? "أضف أزراراً لتسهيل وصول الفريق إلى الروابط المتكررة بضغطة واحدة من أي جهاز."
                  : "Add shortcuts so your factory crew can access critical links with a single tap."}
              </p>
              <Button
                type="button"
                onClick={handleOpenAddButton}
                size="sm"
                className="bg-brand text-brand-foreground text-xs"
              >
                <Plus className="size-4 me-1" />
                {lang === "ar" ? "إضافة أول زر" : "Add First Button"}
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border/60 rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden">
              {buttons.map((btn, index) => {
                const colorObj = AVAILABLE_COLORS.find((c) => c.id === btn.color) || AVAILABLE_COLORS[0];
                return (
                  <div
                    key={btn.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={index === 0}
                          onClick={() => handleMoveButton(index, "up")}
                          className="size-5 p-0 text-muted-foreground hover:text-foreground"
                          title="Move up"
                        >
                          <ArrowUp className="size-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={index === buttons.length - 1}
                          onClick={() => handleMoveButton(index, "down")}
                          className="size-5 p-0 text-muted-foreground hover:text-foreground"
                          title="Move down"
                        >
                          <ArrowDown className="size-3" />
                        </Button>
                      </div>

                      <div
                        className={`flex size-9 shrink-0 items-center justify-center rounded-lg shadow-xs text-xs font-bold border ${colorObj.bg}`}
                      >
                        <ExternalLink className="size-4" />
                      </div>

                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs sm:text-sm text-foreground">
                            {btn.label_ar || btn.label_en}
                          </span>
                          {btn.label_en && btn.label_ar && (
                            <span className="text-[11px] text-muted-foreground font-medium">
                              ({btn.label_en})
                            </span>
                          )}
                          <span
                            className={`rounded-full px-2 py-0.2 text-[10px] font-bold ${
                              btn.is_active !== false
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {btn.is_active !== false
                              ? lang === "ar"
                                ? "نشط"
                                : "Active"
                              : lang === "ar"
                                ? "معطل"
                                : "Inactive"}
                          </span>
                        </div>
                        <p className="font-mono text-[11px] text-muted-foreground truncate max-w-sm sm:max-w-md">
                          {btn.url}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <Switch
                        checked={btn.is_active !== false}
                        onCheckedChange={(checked) => handleToggleActiveButton(btn.id, checked)}
                        title={lang === "ar" ? "تفعيل/تعطيل" : "Toggle active"}
                      />

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingButton({ ...btn });
                          setButtonModalOpen(true);
                        }}
                        className="h-8 gap-1 text-xs"
                      >
                        <Edit2 className="size-3.5" />
                        <span className="hidden sm:inline">{lang === "ar" ? "تعديل" : "Edit"}</span>
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteButton(btn.id)}
                        className="h-8 gap-1 text-xs text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="size-3.5" />
                        <span className="hidden sm:inline">{lang === "ar" ? "حذف" : "Delete"}</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Production Lines Manager */}
      {activeTab === "lines" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  {lang === "ar" ? "خطوط الإنتاج في المصنع" : "Factory Production Lines"}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {lang === "ar"
                    ? "الخطوط المسجلة هنا تظهر فوراً في نافذة صرف المواد الخام للتشغيل (Dispense to Production)."
                    : "Configured lines appear dynamically when dispensing raw materials."}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetDefaultLines}
                className="h-8 gap-1 text-xs text-muted-foreground shrink-0"
              >
                <RotateCcw className="size-3.5" />
                <span>{lang === "ar" ? "استعادة الخطوط الافتراضية" : "Reset Defaults"}</span>
              </Button>
            </div>

            {/* Add new line input */}
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <Input
                placeholder={lang === "ar" ? "اسم خط الإنتاج الجديد (مثال: خط البسكويت والميني ويفر)..." : "New production line name..."}
                value={newLineName}
                onChange={(e) => setNewLineName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAddLine();
                  }
                }}
                className="text-xs"
              />
              <Button
                type="button"
                onClick={handleAddLine}
                disabled={!newLineName.trim() || saving}
                className="shrink-0 gap-1.5 bg-brand text-brand-foreground text-xs shadow-xs"
              >
                <Plus className="size-4" />
                <span>{lang === "ar" ? "إضافة الخط" : "Add Line"}</span>
              </Button>
            </div>
          </div>

          <div className="divide-y divide-border/60 rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden">
            {productionLines.map((line, idx) => (
              <div
                key={line}
                className="flex items-center justify-between gap-3 p-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-6 items-center justify-center rounded-md bg-muted text-[11px] font-mono font-bold text-muted-foreground">
                    {idx + 1}
                  </span>
                  <Factory className="size-4 text-brand" />
                  <span className="text-xs sm:text-sm font-semibold text-foreground">{line}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteLine(line)}
                  disabled={saving}
                  className="h-7 text-xs text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-3.5 me-1" />
                  <span>{lang === "ar" ? "حذف" : "Remove"}</span>
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Storage Locations Manager */}
      {activeTab === "locations" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  {lang === "ar" ? "مستودعات وثلاجات التخزين" : "Factory Storage Locations & Cold Stores"}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {lang === "ar"
                    ? "تظهر هذه المواقع كخيارات سريعة في نموذج استلام الصنف ونافذة اعتماد الجودة والفلاتر."
                    : "Locations appear in receipt forms, quick QC dialog, and inventory filters."}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetDefaultLocations}
                className="h-8 gap-1 text-xs text-muted-foreground shrink-0"
              >
                <RotateCcw className="size-3.5" />
                <span>{lang === "ar" ? "استعادة المستودعات الافتراضية" : "Reset Defaults"}</span>
              </Button>
            </div>

            {/* Add new location input */}
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <Input
                placeholder={lang === "ar" ? "اسم المستودع أو الثلاجة (مثال: ثلاجة بودرة الكاكاو 16°C)..." : "New storage location name..."}
                value={newLocationName}
                onChange={(e) => setNewLocationName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAddLocation();
                  }
                }}
                className="text-xs"
              />
              <Button
                type="button"
                onClick={handleAddLocation}
                disabled={!newLocationName.trim() || saving}
                className="shrink-0 gap-1.5 bg-brand text-brand-foreground text-xs shadow-xs"
              >
                <Plus className="size-4" />
                <span>{lang === "ar" ? "إضافة الموقع" : "Add Location"}</span>
              </Button>
            </div>
          </div>

          <div className="divide-y divide-border/60 rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden">
            {storageLocations.map((loc, idx) => (
              <div
                key={loc}
                className="flex items-center justify-between gap-3 p-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-6 items-center justify-center rounded-md bg-muted text-[11px] font-mono font-bold text-muted-foreground">
                    {idx + 1}
                  </span>
                  <Warehouse className="size-4 text-brand" />
                  <span className="text-xs sm:text-sm font-semibold text-foreground">{loc}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteLocation(loc)}
                  disabled={saving}
                  className="h-7 text-xs text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-3.5 me-1" />
                  <span>{lang === "ar" ? "حذف" : "Remove"}</span>
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Feature Toggles */}
      {activeTab === "features" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
            <h3 className="text-sm font-bold text-foreground">
              {lang === "ar" ? "التحكم في أقسام وميزات المنظومة" : "System Feature & Section Controls"}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lang === "ar"
                ? "يمكنك تشغيل أو إخفاء أي قسم أو ميزة داخل الموقع بضغطة زر لتوجيه تركيز فريق العمل."
                : "Toggle on or off major factory sections and workflows dynamically."}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* KPI Statistics Card */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-xs">
              <div className="space-y-0.5">
                <Label className="text-xs sm:text-sm font-bold cursor-pointer">
                  {lang === "ar" ? "📊 كروت الإحصائيات الشاملة (KPI Cards)" : "Top KPI Stat Cards"}
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {lang === "ar"
                    ? "إظهار كروت أرقام المخزون الإجمالية، الشحنات، الباتشات المتعددة، ومعدلات الأمان أعلى صفحة المخزون."
                    : "Display top statistics cards summarizing total materials, batches, and readiness."}
                </p>
              </div>
              <Switch
                checked={features.enable_kpis !== false}
                onCheckedChange={(val) => handleToggleFeature("enable_kpis", val)}
              />
            </div>

            {/* Dispense Raw Material */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-xs">
              <div className="space-y-0.5">
                <Label className="text-xs sm:text-sm font-bold cursor-pointer">
                  {lang === "ar" ? "🏭 صرف المواد للإنتاج (Dispense Production)" : "Dispense to Production"}
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {lang === "ar"
                    ? "إتاحة زر صرف المواد الخام مع حركات الخصم وسجل الحركات لقسم التشغيل."
                    : "Enable material dispensing workflow with stock movement logs."}
                </p>
              </div>
              <Switch
                checked={features.enable_dispense !== false}
                onCheckedChange={(val) => handleToggleFeature("enable_dispense", val)}
              />
            </div>

            {/* Waste Prevention Hub */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-xs">
              <div className="space-y-0.5">
                <Label className="text-xs sm:text-sm font-bold cursor-pointer">
                  {lang === "ar" ? "🛡️ شاشة منع الهالك (Waste Prevention)" : "Waste Prevention Hub"}
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {lang === "ar"
                    ? "إظهار رابط وقسم منع الهالك وإرسال تقارير الواتساب لحماية المواد من التلف."
                    : "Enable the proactive waste prevention dashboard and WhatsApp batch rescue reports."}
                </p>
              </div>
              <Switch
                checked={features.enable_waste_prevention !== false}
                onCheckedChange={(val) => handleToggleFeature("enable_waste_prevention", val)}
              />
            </div>

            {/* Monthly Audit Hub */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-xs">
              <div className="space-y-0.5">
                <Label className="text-xs sm:text-sm font-bold cursor-pointer">
                  {lang === "ar" ? "📋 شاشة الجرد الدوري (Monthly Audit)" : "Monthly Audit Hub"}
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {lang === "ar"
                    ? "إتاحة جولات المراجعة الشهرية والتسويات المخزنية والتقارير الرقابية الموقعة."
                    : "Enable monthly inventory review workflows and signed discrepancy audits."}
                </p>
              </div>
              <Switch
                checked={features.enable_monthly_audit !== false}
                onCheckedChange={(val) => handleToggleFeature("enable_monthly_audit", val)}
              />
            </div>

            {/* Barcode Scanner */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-xs">
              <div className="space-y-0.5">
                <Label className="text-xs sm:text-sm font-bold cursor-pointer">
                  {lang === "ar" ? "📷 قارئ الباركود بالكاميرا (Barcode Scanner)" : "Camera Barcode Scanner"}
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {lang === "ar"
                    ? "إتاحة زر فحص الباركود والـ QR بكاميرا الهاتف في شريط البحث السريع."
                    : "Show camera barcode scanning button in inventory search bar."}
                </p>
              </div>
              <Switch
                checked={features.enable_barcode_scanner !== false}
                onCheckedChange={(val) => handleToggleFeature("enable_barcode_scanner", val)}
              />
            </div>

            {/* Non-Admin Export CSV */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-xs">
              <div className="space-y-0.5">
                <Label className="text-xs sm:text-sm font-bold cursor-pointer">
                  {lang === "ar" ? "📥 تصدير ملفات Excel/CSV للموظفين" : "Allow Staff CSV Export"}
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {lang === "ar"
                    ? "السماح لجميع الفنيين والموظفين بتصدير جدول المخزون أو قصرها على المسؤولين فقط."
                    : "Allow non-admin staff to export inventory CSV or restrict to admins."}
                </p>
              </div>
              <Switch
                checked={features.allow_export_non_admin !== false}
                onCheckedChange={(val) => handleToggleFeature("allow_export_non_admin", val)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Branding & Identity */}
      {activeTab === "branding" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-bold text-foreground">
                {lang === "ar" ? "هوية المصنع وعنوان المنظومة" : "Factory Name & System Branding"}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {lang === "ar"
                  ? "تظهر هذه الهوية في ترويسة التطبيق، تقارير الطباعة، وتنبيهات الواتساب والتليجرام."
                  : "Branding appears in application header, print sheets, and alert messages."}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  {lang === "ar" ? "اسم المصنع أو العلامة التجارية" : "Factory / Brand Name"}
                </Label>
                <Input
                  value={factoryName}
                  onChange={(e) => setFactoryName(e.target.value)}
                  placeholder="Vienna"
                  className="text-xs font-medium"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  {lang === "ar" ? "وصف وشعار المنظومة (Tagline)" : "System Subtitle / Tagline"}
                </Label>
                <Input
                  value={systemTagline}
                  onChange={(e) => setSystemTagline(e.target.value)}
                  placeholder="Factory Batch Watch & Expiry Guard"
                  className="text-xs font-medium"
                />
              </div>
            </div>

            <div className="pt-2 border-t flex justify-end">
              <Button
                type="button"
                onClick={handleSaveBranding}
                disabled={saving}
                className="gap-1.5 bg-brand text-brand-foreground text-xs shadow-xs"
              >
                <Save className="size-4" />
                <span>{lang === "ar" ? "حفظ هوية المصنع" : "Save Branding"}</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: System Audit Activity Log */}
      {activeTab === "logs" && <AdminActivityLog />}

      {/* Button Create/Edit Dialog */}
      <Dialog open={buttonModalOpen} onOpenChange={setButtonModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm sm:text-base font-bold text-cocoa flex items-center gap-2">
              <LinkIcon className="size-4 text-brand" />
              <span>
                {editingButton?.id && buttons.some((b) => b.id === editingButton.id)
                  ? lang === "ar"
                    ? "تعديل زر مخصص"
                    : "Edit Custom Button"
                  : lang === "ar"
                    ? "إضافة زر مخصص جديد"
                    : "Add New Custom Button"}
              </span>
            </DialogTitle>
          </DialogHeader>

          {editingButton && (
            <div className="space-y-3.5 py-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "ar" ? "العنوان بالعربية" : "Arabic Label"}</Label>
                  <Input
                    value={editingButton.label_ar}
                    onChange={(e) => setEditingButton({ ...editingButton, label_ar: e.target.value })}
                    placeholder="مثال: شيت الإنتاج اليومي"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "ar" ? "العنوان بالإنجليزية" : "English Label"}</Label>
                  <Input
                    value={editingButton.label_en}
                    onChange={(e) => setEditingButton({ ...editingButton, label_en: e.target.value })}
                    placeholder="e.g. Daily Sheet"
                    className="text-xs font-sans"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{lang === "ar" ? "الرابط أو المسار (URL / Path)" : "URL or Internal Path"}</Label>
                <Input
                  value={editingButton.url}
                  onChange={(e) => setEditingButton({ ...editingButton, url: e.target.value })}
                  placeholder="https://docs.google.com/... أو /waste-prevention"
                  className="text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  {lang === "ar"
                    ? "يمكن كتابة رابط خارجي يبدأ بـ https:// أو مسار داخلي مثل /monthly-audit"
                    : "Can be an external URL or internal route path"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "ar" ? "الأيقونة" : "Icon"}</Label>
                  <Select
                    value={editingButton.icon || "link"}
                    onValueChange={(val) => setEditingButton({ ...editingButton, icon: val })}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_ICONS.map((ic) => (
                        <SelectItem key={ic.id} value={ic.id} className="text-xs">
                          {ic.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">{lang === "ar" ? "اللون" : "Color Theme"}</Label>
                  <Select
                    value={editingButton.color || "brand"}
                    onValueChange={(val: any) => setEditingButton({ ...editingButton, color: val })}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_COLORS.map((col) => (
                        <SelectItem key={col.id} value={col.id} className="text-xs">
                          {col.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingButton.is_active !== false}
                    onCheckedChange={(val) => setEditingButton({ ...editingButton, is_active: val })}
                    id="btn-active-switch"
                  />
                  <Label htmlFor="btn-active-switch" className="text-xs cursor-pointer font-medium">
                    {lang === "ar" ? "زر نشط ويظهر للفريق" : "Active & Visible"}
                  </Label>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingButton.target === "_blank"}
                    onCheckedChange={(val) => setEditingButton({ ...editingButton, target: val ? "_blank" : "_self" })}
                    id="btn-target-switch"
                  />
                  <Label htmlFor="btn-target-switch" className="text-xs cursor-pointer font-medium">
                    {lang === "ar" ? "فتح في نافذة جديدة" : "Open in new tab"}
                  </Label>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setButtonModalOpen(false)}
              className="text-xs"
            >
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveButtonModal}
              disabled={saving}
              className="bg-brand text-brand-foreground text-xs"
            >
              {saving ? (lang === "ar" ? "جاري الحفظ..." : "Saving...") : (lang === "ar" ? "حفظ الزر" : "Save Button")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
