import { useState, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Download,
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  FileArchive,
  Layers,
  Sparkles,
  RefreshCw,
  Trash2,
  ArrowRight,
  ShieldAlert,
  HardDrive,
  Image as ImageIcon,
  Check,
  FileText,
  Clock,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { settingsQueryKey } from "@/hooks/use-settings";
import { extractAllPhotoPaths } from "@/lib/photos";
import type { ItemRow } from "@/components/ItemFormDialog";
import {
  exportBackupZip,
  exportExcelOnly,
  parseBackupArchive,
  analyzeBackupDiff,
  executeRestoreProcess,
  triggerFileDownload,
  type ParsedBackupData,
  type BackupAnalysis,
  type RestoreMode,
  type RestoreResult,
} from "@/lib/backup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface BackupRestoreManagerProps {
  onDone?: () => void;
  isModal?: boolean;
}

export function BackupRestoreManager({ onDone, isModal = false }: BackupRestoreManagerProps) {
  const { t, lang } = useI18n();
  const { session, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  // Current system query to calculate live stats
  const itemsQuery = useQuery({
    queryKey: ["items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .order("expiry_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
  });

  const currentItems = itemsQuery.data ?? [];
  const currentPhotosCount = useMemo(() => {
    return extractAllPhotoPaths(currentItems.map((i) => i.photo_path)).length;
  }, [currentItems]);

  // Export state
  const [exportingZip, setExportingZip] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportStage, setExportStage] = useState("");
  const [exportPercent, setExportPercent] = useState(0);

  // Restore state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsingFile, setParsingFile] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedBackupData | null>(null);
  const [diffAnalysis, setDiffAnalysis] = useState<BackupAnalysis | null>(null);

  // Restore strategy options
  const [restoreMode, setRestoreMode] = useState<RestoreMode>("merge");
  const [restorePhotos, setRestorePhotos] = useState(true);
  const [restoreSettings, setRestoreSettings] = useState(true);
  const [wipeConfirmText, setWipeConfirmText] = useState("");

  // Restore execution state
  const [restoring, setRestoring] = useState(false);
  const [restoreStage, setRestoreStage] = useState("");
  const [restorePercent, setRestorePercent] = useState(0);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);

  // 1. Export Handlers
  const handleExportZip = async () => {
    setExportingZip(true);
    setExportPercent(5);
    setExportStage(t("backupPreparing"));

    try {
      const { blob, filename } = await exportBackupZip((stage, current, total) => {
        setExportStage(stage);
        const pct = Math.min(100, Math.round((current / (total || 1)) * 100));
        setExportPercent(pct);
      });

      triggerFileDownload(blob, filename);
      toast.success(t("backupCompleted"));
    } catch (err: any) {
      toast.error(err?.message || "فشل إنشاء النسخة الاحتياطية");
      console.error("Backup ZIP failed:", err);
    } finally {
      setExportingZip(false);
      setExportPercent(0);
      setExportStage("");
    }
  };

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const { blob, filename } = await exportExcelOnly();
      triggerFileDownload(blob, filename);
      toast.success(t("backupCompleted"));
    } catch (err: any) {
      toast.error(err?.message || "فشل تصدير ملف الإكسيل");
      console.error("Export Excel failed:", err);
    } finally {
      setExportingExcel(false);
    }
  };

  // 2. File Selection & Parsing
  const processUploadedFile = async (file: File) => {
    setSelectedFile(file);
    setParsingFile(true);
    setRestoreResult(null);

    try {
      const parsed = await parseBackupArchive(file);
      setParsedData(parsed);

      // Run diff analysis against current items
      const analysis = analyzeBackupDiff(parsed.items, currentItems);
      analysis.photosCount = parsed.photos.size;
      analysis.hasSettings = Boolean(parsed.settings);
      setDiffAnalysis(analysis);

      // Default photo restore to true if photos exist
      setRestorePhotos(parsed.photos.size > 0);
      setRestoreSettings(Boolean(parsed.settings));

      toast.success(`تم فحص الملف: تم العثور على ${parsed.items.length} صنف و ${parsed.photos.size} صورة`);
    } catch (err: any) {
      toast.error(err?.message || t("invalidFileFormat"));
      setSelectedFile(null);
      setParsedData(null);
      setDiffAnalysis(null);
    } finally {
      setParsingFile(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processUploadedFile(file);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processUploadedFile(file);
    }
  };

  const resetSelection = () => {
    setSelectedFile(null);
    setParsedData(null);
    setDiffAnalysis(null);
    setRestoreResult(null);
    setWipeConfirmText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // 3. Restore Execution Handler
  const handleExecuteRestore = async () => {
    if (!parsedData || !diffAnalysis) return;

    if (restoreMode === "wipe_and_rebuild") {
      if (!isAdmin) {
        toast.error(t("adminOnlyWipeNotice"));
        return;
      }
      const trimmed = wipeConfirmText.trim().toLowerCase();
      if (trimmed !== "تأكيد" && trimmed !== "confirm") {
        toast.error(t("confirmMatchRequired"));
        return;
      }
    }

    setRestoring(true);
    setRestorePercent(5);
    setRestoreStage("بدء عملية الاستعادة...");

    try {
      const result = await executeRestoreProcess({
        mode: restoreMode,
        restorePhotos,
        restoreSettings,
        backupData: parsedData,
        analysis: diffAnalysis,
        currentUserId: session?.user?.id ?? null,
        onProgress: (stage, current, total) => {
          setRestoreStage(stage);
          const pct = Math.min(100, Math.round((current / (total || 1)) * 100));
          setRestorePercent(pct);
        },
      });

      setRestoreResult(result);
      toast.success(t("restoreSuccess"));

      // Invalidate queries so inventory and app state refresh immediately
      void queryClient.invalidateQueries({ queryKey: ["items"] });
      void queryClient.invalidateQueries({ queryKey: ["item-photo-urls"] });
      void queryClient.invalidateQueries({ queryKey: settingsQueryKey });

      if (onDone) {
        setTimeout(onDone, 3000);
      }
    } catch (err: any) {
      toast.error(err?.message || "فشلت عملية الاستعادة");
      console.error("Restore execution failed:", err);
    } finally {
      setRestoring(false);
    }
  };

  const isWipeUnlocked =
    restoreMode !== "wipe_and_rebuild" ||
    (isAdmin && (wipeConfirmText.trim().toLowerCase() === "تأكيد" || wipeConfirmText.trim().toLowerCase() === "confirm"));

  return (
    <div className="space-y-6">
      {/* Overview Cards & System Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border rounded-xl p-4 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{t("totalMaterialsStored")}</p>
            <p className="text-2xl font-bold mt-1 text-foreground">
              {itemsQuery.isLoading ? "..." : currentItems.length}
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
            <HardDrive className="size-5" />
          </div>
        </div>

        <div className="bg-card border rounded-xl p-4 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{t("totalPhotosStored")}</p>
            <p className="text-2xl font-bold mt-1 text-foreground">
              {itemsQuery.isLoading ? "..." : currentPhotosCount}
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-600">
            <ImageIcon className="size-5" />
          </div>
        </div>

        <div className="bg-card border rounded-xl p-4 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{t("systemSubtitle")}</p>
            <p className="text-sm font-semibold mt-1 text-emerald-600 flex items-center gap-1.5">
              <CheckCircle2 className="size-4" />
              قاعدة البيانات متصلة وجاهزة
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-600">
            <Sparkles className="size-5" />
          </div>
        </div>
      </div>

      {/* SECTION 1: EXPORT / BACKUP */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Download className="size-5" />
            </div>
            <div>
              <CardTitle className="text-lg">{t("backupSectionTitle")}</CardTitle>
              <CardDescription className="text-xs mt-1">{t("backupSectionDesc")}</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {exportingZip && (
            <div className="p-4 rounded-lg bg-muted/60 border border-border space-y-2">
              <div className="flex justify-between items-center text-xs font-medium">
                <span className="text-foreground">{exportStage}</span>
                <span className="text-muted-foreground">{exportPercent}%</span>
              </div>
              <Progress value={exportPercent} className="h-2" />
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <Button
              onClick={handleExportZip}
              disabled={exportingZip || exportingExcel}
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 h-11"
            >
              {exportingZip ? (
                <>
                  <RefreshCw className="size-4 animate-spin me-2" />
                  <span>{exportStage || t("backupPreparing")}</span>
                </>
              ) : (
                <>
                  <Archive className="size-4 me-2" />
                  <span>{t("downloadFullBackup")}</span>
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={handleExportExcel}
              disabled={exportingZip || exportingExcel}
              className="h-11"
            >
              {exportingExcel ? (
                <>
                  <RefreshCw className="size-4 animate-spin me-2" />
                  <span>جاري تصدير الإكسيل...</span>
                </>
              ) : (
                <>
                  <FileSpreadsheet className="size-4 me-2 text-emerald-600" />
                  <span>{t("downloadExcelOnly")}</span>
                </>
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            💡 {t("lastBackupHint")}
          </p>
        </CardContent>
      </Card>

      {/* SECTION 2: RESTORE / IMPORT */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600">
              <UploadCloud className="size-5" />
            </div>
            <div>
              <CardTitle className="text-lg">{t("restoreSectionTitle")}</CardTitle>
              <CardDescription className="text-xs mt-1">{t("restoreSectionDesc")}</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* File Upload / Dropzone */}
          {!selectedFile ? (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,.xlsx,.xls,.json"
                onChange={handleFileChange}
                className="hidden"
              />
              <FileArchive className="size-10 mx-auto text-muted-foreground/70 mb-3" />
              <p className="text-sm font-medium text-foreground">{t("dragDropBackupHint")}</p>
              <p className="text-xs text-muted-foreground mt-1.5">
                يدعم أرشيف ZIP الكامل (مع الصور) أو جداول Excel XLSX أو ملفات JSON
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Selected File Banner */}
              <div className="p-4 rounded-xl bg-muted/50 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                    <FileArchive className="size-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      الحجم: {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • النوع:{" "}
                      {selectedFile.name.endsWith(".zip")
                        ? "أرشيف شامل (ZIP)"
                        : selectedFile.name.endsWith(".xlsx")
                          ? "جدول إكسيل (XLSX)"
                          : "ملف بيانات (JSON)"}
                    </p>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetSelection}
                  disabled={restoring}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {t("chooseDifferentFile")}
                </Button>
              </div>

              {/* Inspection Summary Card */}
              {diffAnalysis && (
                <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-primary" />
                    {t("restoreInspectionTitle")}
                  </h4>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
                      <span className="text-xs text-muted-foreground block">{t("totalItemsInBackup")}</span>
                      <span className="text-lg font-bold text-foreground">
                        {diffAnalysis.totalBackupItems}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <span className="text-xs text-emerald-700 dark:text-emerald-400 block font-medium">
                        {t("newItemsToInsert")}
                      </span>
                      <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                        +{diffAnalysis.newItems.length}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <span className="text-xs text-blue-700 dark:text-blue-400 block font-medium">
                        {t("matchingItemsToUpdate")}
                      </span>
                      <span className="text-lg font-bold text-blue-700 dark:text-blue-400">
                        {diffAnalysis.matchingItems.length}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <span className="text-xs text-amber-700 dark:text-amber-400 block font-medium">
                        {t("photosFoundInBackup")}
                      </span>
                      <span className="text-lg font-bold text-amber-700 dark:text-amber-400">
                        {diffAnalysis.photosCount}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Restore Strategy Selection */}
              <div className="space-y-3 pt-2">
                <Label className="text-sm font-semibold">{t("restoreModeTitle")}</Label>
                <RadioGroup
                  value={restoreMode}
                  onValueChange={(val) => setRestoreMode(val as RestoreMode)}
                  className="grid grid-cols-1 gap-3"
                  disabled={restoring}
                >
                  {/* Option 1: Smart Merge (Recommended) */}
                  <label
                    htmlFor="mode-merge"
                    className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                      restoreMode === "merge"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <RadioGroupItem value="merge" id="mode-merge" className="mt-1" />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {t("restoreModeMerge")}
                        </span>
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 text-[10px]">
                          منع التكرار
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {t("restoreModeMergeDesc")}
                      </p>
                    </div>
                  </label>

                  {/* Option 2: Skip Existing */}
                  <label
                    htmlFor="mode-skip"
                    className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                      restoreMode === "skip_existing"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <RadioGroupItem value="skip_existing" id="mode-skip" className="mt-1" />
                    <div className="space-y-1">
                      <span className="text-sm font-semibold text-foreground">
                        {t("restoreModeSkip")}
                      </span>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {t("restoreModeSkipDesc")}
                      </p>
                    </div>
                  </label>

                  {/* Option 3: Wipe & Clean Rebuild */}
                  <label
                    htmlFor="mode-wipe"
                    className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                      restoreMode === "wipe_and_rebuild"
                        ? "border-destructive bg-destructive/5 ring-1 ring-destructive"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <RadioGroupItem value="wipe_and_rebuild" id="mode-wipe" className="mt-1" />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-destructive flex items-center gap-1.5">
                          <Trash2 className="size-3.5" />
                          {t("restoreModeWipe")}
                        </span>
                        <Badge variant="destructive" className="text-[10px]">
                          حذف وإعادة بناء
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {t("restoreModeWipeDesc")}
                      </p>
                    </div>
                  </label>
                </RadioGroup>
              </div>

              {/* Wipe Safety Confirmation Box */}
              {restoreMode === "wipe_and_rebuild" && (
                <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 space-y-3">
                  <div className="flex items-start gap-2.5 text-destructive">
                    <ShieldAlert className="size-5 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs font-bold">{t("dangerZoneWipeWarning")}</p>
                      {!isAdmin && (
                        <p className="text-xs font-medium text-destructive underline">
                          {t("adminOnlyWipeNotice")}
                        </p>
                      )}
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="space-y-1.5 pt-1">
                      <Label htmlFor="wipe-confirm" className="text-xs font-medium">
                        {t("typeConfirmToProceed")}
                      </Label>
                      <Input
                        id="wipe-confirm"
                        value={wipeConfirmText}
                        onChange={(e) => setWipeConfirmText(e.target.value)}
                        placeholder="اكتب: تأكيد"
                        className="h-9 text-xs bg-background border-destructive/40 focus-visible:ring-destructive"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Secondary Options */}
              <div className="flex flex-col sm:flex-row gap-4 pt-1">
                {parsedData?.photos && parsedData.photos.size > 0 && (
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <Checkbox
                      checked={restorePhotos}
                      onCheckedChange={(c) => setRestorePhotos(Boolean(c))}
                      disabled={restoring}
                    />
                    <span>{t("restorePhotosOption")} ({parsedData.photos.size})</span>
                  </label>
                )}

                {parsedData?.settings && (
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <Checkbox
                      checked={restoreSettings}
                      onCheckedChange={(c) => setRestoreSettings(Boolean(c))}
                      disabled={restoring}
                    />
                    <span>{t("restoreSettingsOption")}</span>
                  </label>
                )}
              </div>

              {/* Progress during restore */}
              {restoring && (
                <div className="p-4 rounded-lg bg-muted/60 border border-border space-y-2">
                  <div className="flex justify-between items-center text-xs font-medium">
                    <span className="text-foreground">{restoreStage}</span>
                    <span className="text-muted-foreground">{restorePercent}%</span>
                  </div>
                  <Progress value={restorePercent} className="h-2" />
                </div>
              )}

              {/* Restore Result Card */}
              {restoreResult && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <CheckCircle2 className="size-4" />
                    <span>{t("restoreSuccess")}</span>
                  </div>
                  <p className="text-xs leading-relaxed">
                    {t("restoreResultsSummary", {
                      added: restoreResult.added,
                      updated: restoreResult.updated,
                      skipped: restoreResult.skipped,
                      photos: restoreResult.photosRestored,
                    })}
                  </p>
                </div>
              )}

              {/* Start Button */}
              <div className="pt-2">
                <Button
                  onClick={handleExecuteRestore}
                  disabled={restoring || !isWipeUnlocked}
                  className={`w-full h-11 font-semibold ${
                    restoreMode === "wipe_and_rebuild"
                      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                >
                  {restoring ? (
                    <>
                      <RefreshCw className="size-4 animate-spin me-2" />
                      <span>{restoreStage || "جاري الاستعادة..."}</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="size-4 me-2" />
                      <span>{t("startRestoreProcess")}</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
