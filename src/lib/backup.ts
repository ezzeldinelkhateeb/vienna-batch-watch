import * as XLSX from "xlsx";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { PHOTO_BUCKET, extractAllPhotoPaths } from "@/lib/photos";
import type { ItemRow } from "@/components/ItemFormDialog";

export interface BackupManifest {
  version: string;
  exportedAt: string;
  appName: string;
  totalItems: number;
  totalPhotos: number;
  thresholds?: {
    early: number;
    medium: number;
    critical: number;
  };
}

export interface ParsedBackupData {
  items: Array<Partial<ItemRow>>;
  settings?: Record<string, any> | null;
  photos: Map<string, Blob>; // filename -> blob
  manifest?: BackupManifest | null;
}

export interface BackupAnalysis {
  totalBackupItems: number;
  newItems: Array<Partial<ItemRow>>;
  matchingItems: Array<{ backupItem: Partial<ItemRow>; existingItem: ItemRow }>;
  photosCount: number;
  hasSettings: boolean;
}

export type RestoreMode = "merge" | "skip_existing" | "wipe_and_rebuild";

export interface RestoreOptions {
  mode: RestoreMode;
  restorePhotos: boolean;
  restoreSettings: boolean;
  backupData: ParsedBackupData;
  analysis: BackupAnalysis;
  currentUserId?: string | null;
  onProgress?: (stage: string, current: number, total: number) => void;
}

export interface RestoreResult {
  added: number;
  updated: number;
  skipped: number;
  photosRestored: number;
  settingsRestored: boolean;
}

// Helper to format date for filenames (e.g. 2026-09-10-1430)
export function getBackupTimestampString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}_${hh}-${min}`;
}

/** Trigger browser download for a Blob */
export function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * Generate Excel Workbook representing items and settings
 */
export function buildExcelWorkbook(
  items: ItemRow[],
  settings: Record<string, any> | null,
  manifest: BackupManifest,
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // 1. Items Worksheet
  const itemRows = items.map((item) => ({
    "كود الصنف (Item Code)": item.item_code ?? "",
    "رقم التشغيلة (Batch Number)": item.batch_number ?? "",
    "اسم الخامة (Material Name)": item.name,
    "المورد (Supplier)": item.supplier ?? "",
    "تاريخ الإنتاج (Production Date)": item.production_date ?? "",
    "تاريخ الصلاحية (Expiry Date)": item.expiry_date,
    "الكمية (Quantity)": item.quantity ?? "",
    "الوحدة (Unit)": item.unit ?? "",
    "مكان التخزين (Storage Location)": item.storage_location ?? "",
    "قرار الجودة (QC Status)": item.qc_status ?? "quarantine",
    "ملاحظات الجودة (QC Notes)": item.qc_notes ?? "",
    "رقم شهادة التحليل (COA Ref)": item.coa_number ?? "",
    "ملاحظات إضافية (Notes)": item.notes ?? "",
    "ملفات الصور (Photos)": item.photo_path ?? "",
    "معرف النظام (UUID)": item.id,
    "تاريخ الإضافة (Created At)": item.created_at ?? "",
  }));
  const wsItems = XLSX.utils.json_to_sheet(itemRows);
  XLSX.utils.book_append_sheet(wb, wsItems, "الأصناف والتشغيلات");

  // 2. Settings Worksheet
  if (settings) {
    const settingsRows = [
      {
        "الإعداد (Setting)": "رقم الواتساب (WhatsApp Phone)",
        "القيمة (Value)": settings.whatsapp_phone ?? "",
      },
      {
        "الإعداد (Setting)": "CallMeBot API Key",
        "القيمة (Value)": settings.callmebot_apikey ?? "",
      },
      {
        "الإعداد (Setting)": "توكن بوت تليجرام (Telegram Bot Token)",
        "القيمة (Value)": settings.telegram_bot_token ?? "",
      },
      {
        "الإعداد (Setting)": "معرف شات تليجرام (Telegram Chat ID)",
        "القيمة (Value)": settings.telegram_chat_id ?? "",
      },
      {
        "الإعداد (Setting)": "قناة الإشعار (Notify Channel)",
        "القيمة (Value)": settings.notify_channel ?? "both",
      },
      {
        "الإعداد (Setting)": "تنبيه مبكر بالأيام (Early Threshold)",
        "القيمة (Value)": settings.threshold_early ?? 90,
      },
      {
        "الإعداد (Setting)": "تنبيه متوسط بالأيام (Medium Threshold)",
        "القيمة (Value)": settings.threshold_medium ?? 60,
      },
      {
        "الإعداد (Setting)": "تنبيه حرج بالأيام (Critical Threshold)",
        "القيمة (Value)": settings.threshold_critical ?? 30,
      },
    ];
    const wsSettings = XLSX.utils.json_to_sheet(settingsRows);
    XLSX.utils.book_append_sheet(wb, wsSettings, "إعدادات التنبيهات");
  }

  // 3. Manifest Worksheet
  const metaRows = [
    { "الخاصية (Property)": "اسم النظام (Application)", "القيمة (Value)": manifest.appName },
    { "الخاصية (Property)": "تاريخ وتوقيت النسخة (Export Time)", "القيمة (Value)": manifest.exportedAt },
    { "الخاصية (Property)": "إصدار النسخة (Backup Version)", "القيمة (Value)": manifest.version },
    { "الخاصية (Property)": "إجمالي الأصناف (Total Items)", "القيمة (Value)": manifest.totalItems },
    { "الخاصية (Property)": "إجمالي الصور (Total Photos)", "القيمة (Value)": manifest.totalPhotos },
  ];
  const wsMeta = XLSX.utils.json_to_sheet(metaRows);
  XLSX.utils.book_append_sheet(wb, wsMeta, "معلومات النسخة الاحتياطية");

  return wb;
}

/**
 * Generate Excel only export
 */
export async function exportExcelOnly(): Promise<{ blob: Blob; filename: string }> {
  const [itemsRes, settingsRes] = await Promise.all([
    supabase.from("items").select("*").order("expiry_date", { ascending: true }),
    supabase.from("app_settings").select("*").eq("id", true).maybeSingle(),
  ]);

  if (itemsRes.error) throw itemsRes.error;
  const items = (itemsRes.data ?? []) as ItemRow[];
  const settings = settingsRes.data;

  const manifest: BackupManifest = {
    appName: "Vienna Batch Watch",
    version: "2.0",
    exportedAt: new Date().toISOString(),
    totalItems: items.length,
    totalPhotos: extractAllPhotoPaths(items.map((i) => i.photo_path)).length,
  };

  const wb = buildExcelWorkbook(items, settings, manifest);
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const filename = `vienna-inventory_${getBackupTimestampString()}.xlsx`;
  return { blob, filename };
}

/**
 * Full backup archive generator:
 * Creates a .zip containing:
 * - data.xlsx (Excel file with sheets)
 * - backup_data.json (Lossless JSON records)
 * - manifest.json (Metadata)
 * - photos/ (All item images downloaded from Supabase Storage)
 */
export async function exportBackupZip(
  onProgress?: (stage: string, current: number, total: number) => void,
): Promise<{ blob: Blob; filename: string; manifest: BackupManifest }> {
  onProgress?.("جاري قراءة البيانات من النظام...", 0, 100);

  // 1. Fetch items & settings
  const [itemsRes, settingsRes] = await Promise.all([
    supabase.from("items").select("*").order("name", { ascending: true }),
    supabase.from("app_settings").select("*").eq("id", true).maybeSingle(),
  ]);

  if (itemsRes.error) throw itemsRes.error;
  const items = (itemsRes.data ?? []) as ItemRow[];
  const settings = settingsRes.data;

  // 2. Identify all photos
  const photoPaths = extractAllPhotoPaths(items.map((i) => i.photo_path));
  const totalPhotos = photoPaths.length;

  const manifest: BackupManifest = {
    appName: "Vienna Batch Watch",
    version: "2.0",
    exportedAt: new Date().toISOString(),
    totalItems: items.length,
    totalPhotos,
    thresholds: settings
      ? {
          early: settings.threshold_early,
          medium: settings.threshold_medium,
          critical: settings.threshold_critical,
        }
      : undefined,
  };

  const zip = new JSZip();
  const photosFolder = zip.folder("photos");

  // 3. Download photos
  let downloadedCount = 0;
  for (const path of photoPaths) {
    onProgress?.("جاري تنزيل الصور...", downloadedCount + 1, totalPhotos || 1);
    try {
      const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(path);
      if (!error && data && photosFolder) {
        photosFolder.file(path, data);
        downloadedCount++;
      }
    } catch {
      // If single photo fails, continue to preserve rest of backup
      console.warn(`Could not backup photo: ${path}`);
    }
  }

  onProgress?.("جاري إعداد ملفات الإكسيل والبيانات...", 90, 100);

  // 4. Add data.xlsx
  const wb = buildExcelWorkbook(items, settings, manifest);
  const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  zip.file("data.xlsx", excelBuffer);

  // 5. Add backup_data.json
  const backupJson = JSON.stringify(
    {
      manifest,
      items,
      settings,
    },
    null,
    2,
  );
  zip.file("backup_data.json", backupJson);

  // 6. Add manifest.json
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  onProgress?.("جاري ضغط ملف النسخة الاحتياطية...", 98, 100);

  // 7. Compress to ZIP
  const zipBlob = await zip.generateAsync(
    {
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    },
    (metadata) => {
      onProgress?.(`جاري ضغط الملفات (${Math.round(metadata.percent)}%)...`, Math.round(metadata.percent), 100);
    },
  );

  const filename = `vienna-backup_${getBackupTimestampString()}.zip`;
  onProgress?.("اكتملت النسخة الاحتياطية بنجاح!", 100, 100);

  return { blob: zipBlob, filename, manifest };
}

/**
 * Parse an uploaded backup file (ZIP, XLSX, or JSON)
 */
export async function parseBackupArchive(file: File): Promise<ParsedBackupData> {
  const fileNameLower = file.name.toLowerCase();

  // A. ZIP file
  if (fileNameLower.endsWith(".zip")) {
    const zip = await JSZip.loadAsync(file);
    const photosMap = new Map<string, Blob>();

    // Check for photos folder
    const photoFiles = zip.file(/^photos\//);
    for (const pFile of photoFiles) {
      if (!pFile.dir) {
        const cleanName = pFile.name.replace(/^photos\//, "");
        if (cleanName) {
          const blob = await pFile.async("blob");
          photosMap.set(cleanName, blob);
        }
      }
    }

    // 1. Try parsing backup_data.json
    const jsonFile = zip.file("backup_data.json");
    if (jsonFile) {
      const jsonText = await jsonFile.async("text");
      const parsed = JSON.parse(jsonText);
      return {
        items: Array.isArray(parsed.items) ? parsed.items : [],
        settings: parsed.settings ?? null,
        photos: photosMap,
        manifest: parsed.manifest ?? null,
      };
    }

    // 2. Fallback: check data.xlsx inside ZIP
    const xlsxFile = zip.file("data.xlsx") || zip.file(/\.xlsx$/i)[0];
    if (xlsxFile) {
      const arrayBuffer = await xlsxFile.async("arraybuffer");
      const wb = XLSX.read(arrayBuffer, { type: "array" });
      const items = parseItemsFromWorkbook(wb);
      return {
        items,
        photos: photosMap,
        manifest: null,
      };
    }

    throw new Error("ملف الـ ZIP لا يحتوي على ملف بيانات (backup_data.json أو data.xlsx)");
  }

  // B. XLSX file directly
  if (fileNameLower.endsWith(".xlsx") || fileNameLower.endsWith(".xls")) {
    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: "array" });
    const items = parseItemsFromWorkbook(wb);
    return {
      items,
      photos: new Map(),
      manifest: null,
    };
  }

  // C. JSON file directly
  if (fileNameLower.endsWith(".json")) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const items = Array.isArray(parsed.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
    return {
      items,
      settings: parsed.settings ?? null,
      photos: new Map(),
      manifest: parsed.manifest ?? null,
    };
  }

  throw new Error("صيغة الملف غير مدعومة. يرجى اختيار ملف .zip أو .xlsx أو .json");
}

/** Helper to parse item rows from XLSX Workbook */
function parseItemsFromWorkbook(wb: XLSX.WorkBook): Array<Partial<ItemRow>> {
  const sheetName =
    wb.SheetNames.find((s) => s.includes("الأصناف") || s.toLowerCase().includes("item")) ??
    wb.SheetNames[0];

  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];

  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws);
  return rawRows
    .map((r) => {
      // Map either Arabic header or English/key name
      const itemCode =
        r["كود الصنف (Item Code)"] ?? r["كود الصنف"] ?? r["item_code"] ?? r["Item Code"] ?? null;
      const batchNumber =
        r["رقم التشغيلة (Batch Number)"] ?? r["رقم التشغيلة"] ?? r["batch_number"] ?? r["Batch Number"] ?? null;
      const name =
        r["اسم الخامة (Material Name)"] ?? r["اسم الخامة"] ?? r["الاسم"] ?? r["name"] ?? r["Name"] ?? "";
      const supplier =
        r["المورد (Supplier)"] ?? r["المورد"] ?? r["supplier"] ?? r["Supplier"] ?? null;
      const prodDate =
        r["تاريخ الإنتاج (Production Date)"] ?? r["تاريخ الإنتاج"] ?? r["production_date"] ?? null;
      const expiryDate =
        r["تاريخ الصلاحية (Expiry Date)"] ?? r["تاريخ الصلاحية"] ?? r["expiry_date"] ?? "";
      const quantity =
        r["الكمية (Quantity)"] ?? r["الكمية"] ?? r["quantity"] ?? null;
      const unit =
        r["الوحدة (Unit)"] ?? r["الوحدة"] ?? r["unit"] ?? null;
      const storageLocation =
        r["مكان التخزين (Storage Location)"] ?? r["مكان التخزين"] ?? r["storage_location"] ?? null;
      const qcStatus =
        r["قرار الجودة (QC Status)"] ?? r["قرار الجودة"] ?? r["qc_status"] ?? "quarantine";
      const qcNotes =
        r["ملاحظات الجودة (QC Notes)"] ?? r["ملاحظات الجودة"] ?? r["qc_notes"] ?? null;
      const coaNumber =
        r["رقم شهادة التحليل (COA Ref)"] ?? r["رقم شهادة التحليل"] ?? r["coa_number"] ?? null;
      const notes =
        r["ملاحظات إضافية (Notes)"] ?? r["ملاحظات"] ?? r["notes"] ?? null;
      const photoPath =
        r["ملفات الصور (Photos)"] ?? r["ملفات الصور"] ?? r["photo_path"] ?? null;
      const id = r["معرف النظام (UUID)"] ?? r["id"] ?? undefined;

      return {
        id: typeof id === "string" && id.length === 36 ? id : undefined,
        item_code: itemCode ? String(itemCode).trim() : null,
        batch_number: batchNumber ? String(batchNumber).trim() : null,
        name: String(name).trim(),
        supplier: supplier ? String(supplier).trim() : null,
        production_date: prodDate ? String(prodDate).trim() : null,
        expiry_date: String(expiryDate).trim(),
        quantity: quantity !== null && quantity !== undefined && !isNaN(Number(quantity)) ? Number(quantity) : null,
        unit: unit ? String(unit).trim() : null,
        storage_location: storageLocation ? String(storageLocation).trim() : null,
        qc_status: ["quarantine", "approved", "rejected", "conditional"].includes(String(qcStatus))
          ? (qcStatus as any)
          : "quarantine",
        qc_notes: qcNotes ? String(qcNotes).trim() : null,
        coa_number: coaNumber ? String(coaNumber).trim() : null,
        notes: notes ? String(notes).trim() : null,
        photo_path: photoPath ? String(photoPath).trim() : null,
      };
    })
    .filter((item) => item.name && item.expiry_date);
}

/**
 * Compare backup items with current database items to identify:
 * - New items that don't exist in system
 * - Matching items that already exist (for merge/update)
 */
export function analyzeBackupDiff(
  backupItems: Array<Partial<ItemRow>>,
  currentItems: ItemRow[],
): BackupAnalysis {
  const currentById = new Map<string, ItemRow>();
  const currentByCode = new Map<string, ItemRow>();
  const currentByNameBatch = new Map<string, ItemRow>();

  for (const cur of currentItems) {
    if (cur.id) currentById.set(cur.id, cur);
    if (cur.item_code) currentByCode.set(cur.item_code.trim().toLowerCase(), cur);
    const key = `${cur.name.trim().toLowerCase()}:::${(cur.batch_number || "").trim().toLowerCase()}`;
    currentByNameBatch.set(key, cur);
  }

  const newItems: Array<Partial<ItemRow>> = [];
  const matchingItems: Array<{ backupItem: Partial<ItemRow>; existingItem: ItemRow }> = [];

  for (const bItem of backupItems) {
    if (!bItem.name || !bItem.expiry_date) continue;

    let matched: ItemRow | undefined;

    // 1. Match by UUID if present
    if (bItem.id && currentById.has(bItem.id)) {
      matched = currentById.get(bItem.id);
    }

    // 2. Match by unique item_code if present
    if (!matched && bItem.item_code) {
      const codeKey = bItem.item_code.trim().toLowerCase();
      if (currentByCode.has(codeKey)) {
        matched = currentByCode.get(codeKey);
      }
    }

    // 3. Match by name + batch_number
    if (!matched) {
      const nameBatchKey = `${bItem.name.trim().toLowerCase()}:::${(bItem.batch_number || "").trim().toLowerCase()}`;
      if (currentByNameBatch.has(nameBatchKey)) {
        matched = currentByNameBatch.get(nameBatchKey);
      }
    }

    if (matched) {
      matchingItems.push({ backupItem: bItem, existingItem: matched });
    } else {
      newItems.push(bItem);
    }
  }

  return {
    totalBackupItems: backupItems.length,
    newItems,
    matchingItems,
    photosCount: 0,
    hasSettings: false,
  };
}

/**
 * Execute restore process based on selected strategy
 */
export async function executeRestoreProcess(options: RestoreOptions): Promise<RestoreResult> {
  const {
    mode,
    restorePhotos,
    restoreSettings,
    backupData,
    analysis,
    currentUserId,
    onProgress,
  } = options;

  let added = 0;
  let updated = 0;
  let skipped = 0;
  let photosRestored = 0;
  let settingsRestored = false;

  // 1. Restore photos to Supabase Storage Bucket
  if (restorePhotos && backupData.photos.size > 0) {
    let currentPhotoIdx = 0;
    const totalPhotos = backupData.photos.size;

    for (const [filename, blob] of backupData.photos.entries()) {
      currentPhotoIdx++;
      onProgress?.(
        `جاري استعادة ورفع الصور (${currentPhotoIdx}/${totalPhotos})...`,
        currentPhotoIdx,
        totalPhotos,
      );

      try {
        await supabase.storage.from(PHOTO_BUCKET).upload(filename, blob, {
          upsert: true,
          contentType: blob.type || "image/jpeg",
        });
        photosRestored++;
      } catch (err) {
        console.warn(`Failed to upload photo ${filename}:`, err);
      }
    }
  }

  // 2. Database Items handling based on mode
  if (mode === "wipe_and_rebuild") {
    onProgress?.("جاري تنظيف وإفراغ بيانات المخزون الحالية...", 10, 100);

    // Wipe all existing items
    const { error: deleteErr } = await supabase
      .from("items")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (deleteErr) {
      throw new Error(`فشل تفريغ البيانات السابقة: ${deleteErr.message}`);
    }

    // Insert all items clean
    const allValidItems = backupData.items.filter((i) => i.name && i.expiry_date);
    const chunkSize = 50;

    for (let i = 0; i < allValidItems.length; i += chunkSize) {
      const chunk = allValidItems.slice(i, i + chunkSize).map((raw) => sanitizeItemForInsert(raw, currentUserId));
      onProgress?.(
        `جاري إدخال الأصناف (${i + chunk.length}/${allValidItems.length})...`,
        i + chunk.length,
        allValidItems.length,
      );

      const { error: insErr } = await supabase.from("items").insert(chunk);
      if (insErr) {
        throw new Error(`فشل إدخال الأصناف أثناء إعادة البناء: ${insErr.message}`);
      }
      added += chunk.length;
    }
  } else if (mode === "merge") {
    // A. Update matching items
    const totalMatches = analysis.matchingItems.length;
    let matchIdx = 0;
    for (const match of analysis.matchingItems) {
      matchIdx++;
      onProgress?.(
        `جاري تحديث الأصناف المتطابقة (${matchIdx}/${totalMatches})...`,
        matchIdx,
        totalMatches || 1,
      );

      const updatePayload = sanitizeItemForUpdate(match.backupItem);
      const { error: upErr } = await supabase
        .from("items")
        .update(updatePayload)
        .eq("id", match.existingItem.id);

      if (!upErr) {
        updated++;
      } else {
        console.warn(`Error updating item ${match.existingItem.name}:`, upErr);
      }
    }

    // B. Insert new items
    const totalNew = analysis.newItems.length;
    const chunkSize = 50;
    for (let i = 0; i < totalNew; i += chunkSize) {
      const chunk = analysis.newItems.slice(i, i + chunkSize).map((raw) => sanitizeItemForInsert(raw, currentUserId));
      onProgress?.(
        `جاري إضافة الأصناف الجديدة (${i + chunk.length}/${totalNew})...`,
        i + chunk.length,
        totalNew,
      );

      const { error: insErr } = await supabase.from("items").insert(chunk);
      if (!insErr) {
        added += chunk.length;
      } else {
        console.warn("Error inserting new items chunk:", insErr);
      }
    }
  } else if (mode === "skip_existing") {
    // Only insert new items, skip matching items
    skipped = analysis.matchingItems.length;
    const totalNew = analysis.newItems.length;
    const chunkSize = 50;

    for (let i = 0; i < totalNew; i += chunkSize) {
      const chunk = analysis.newItems.slice(i, i + chunkSize).map((raw) => sanitizeItemForInsert(raw, currentUserId));
      onProgress?.(
        `جاري إضافة الأصناف الجديدة (${i + chunk.length}/${totalNew})...`,
        i + chunk.length,
        totalNew || 1,
      );

      const { error: insErr } = await supabase.from("items").insert(chunk);
      if (!insErr) {
        added += chunk.length;
      } else {
        console.warn("Error inserting new items chunk:", insErr);
      }
    }
  }

  // 3. Restore App Settings if requested
  if (restoreSettings && backupData.settings) {
    onProgress?.("جاري استعادة إعدادات التنبيهات وقنوات الإشعار...", 95, 100);
    const s = backupData.settings;
    const settingsPayload: Record<string, any> = {
      id: true,
      whatsapp_phone: s.whatsapp_phone ?? null,
      callmebot_apikey: s.callmebot_apikey ?? null,
      telegram_bot_token: s.telegram_bot_token ?? null,
      telegram_chat_id: s.telegram_chat_id ?? null,
      notify_channel: s.notify_channel ?? "both",
      threshold_early: s.threshold_early ?? 90,
      threshold_medium: s.threshold_medium ?? 60,
      threshold_critical: s.threshold_critical ?? 30,
      updated_at: new Date().toISOString(),
    };

    const { error: setErr } = await supabase.from("app_settings").upsert(settingsPayload);
    if (!setErr) {
      settingsRestored = true;
    } else {
      console.warn("Error restoring settings:", setErr);
    }
  }

  onProgress?.("اكتملت عملية الاستعادة بنجاح!", 100, 100);

  return {
    added,
    updated,
    skipped,
    photosRestored,
    settingsRestored,
  };
}

/** Sanitize and prepare item for fresh insertion */
function sanitizeItemForInsert(raw: Partial<ItemRow>, currentUserId?: string | null): Record<string, any> {
  const qcStatus = ["quarantine", "approved", "rejected", "conditional"].includes(raw.qc_status as string)
    ? raw.qc_status
    : "quarantine";

  const payload: Record<string, any> = {
    name: (raw.name || "").trim(),
    expiry_date: (raw.expiry_date || "").trim(),
    item_code: raw.item_code ? raw.item_code.trim() : null,
    batch_number: raw.batch_number ? raw.batch_number.trim() : null,
    supplier: raw.supplier ? raw.supplier.trim() : null,
    production_date: raw.production_date ? raw.production_date.trim() : null,
    quantity: raw.quantity !== null && raw.quantity !== undefined && !isNaN(Number(raw.quantity)) ? Number(raw.quantity) : null,
    unit: raw.unit ? raw.unit.trim() : null,
    storage_location: raw.storage_location ? raw.storage_location.trim() : null,
    qc_status: qcStatus,
    qc_notes: raw.qc_notes ? raw.qc_notes.trim() : null,
    coa_number: raw.coa_number ? raw.coa_number.trim() : null,
    notes: raw.notes ? raw.notes.trim() : null,
    photo_path: raw.photo_path ? raw.photo_path.trim() : null,
  };

  if (currentUserId) {
    payload.created_by = currentUserId;
  }

  return payload;
}

/** Sanitize item for update */
function sanitizeItemForUpdate(raw: Partial<ItemRow>): Record<string, any> {
  const payload: Record<string, any> = {
    name: (raw.name || "").trim(),
    expiry_date: (raw.expiry_date || "").trim(),
    updated_at: new Date().toISOString(),
  };

  if (raw.item_code !== undefined) payload.item_code = raw.item_code ? raw.item_code.trim() : null;
  if (raw.batch_number !== undefined) payload.batch_number = raw.batch_number ? raw.batch_number.trim() : null;
  if (raw.supplier !== undefined) payload.supplier = raw.supplier ? raw.supplier.trim() : null;
  if (raw.production_date !== undefined) payload.production_date = raw.production_date ? raw.production_date.trim() : null;
  if (raw.quantity !== undefined) payload.quantity = raw.quantity !== null && !isNaN(Number(raw.quantity)) ? Number(raw.quantity) : null;
  if (raw.unit !== undefined) payload.unit = raw.unit ? raw.unit.trim() : null;
  if (raw.storage_location !== undefined) payload.storage_location = raw.storage_location ? raw.storage_location.trim() : null;
  if (raw.qc_status !== undefined) {
    payload.qc_status = ["quarantine", "approved", "rejected", "conditional"].includes(raw.qc_status as string)
      ? raw.qc_status
      : "quarantine";
  }
  if (raw.qc_notes !== undefined) payload.qc_notes = raw.qc_notes ? raw.qc_notes.trim() : null;
  if (raw.coa_number !== undefined) payload.coa_number = raw.coa_number ? raw.coa_number.trim() : null;
  if (raw.notes !== undefined) payload.notes = raw.notes ? raw.notes.trim() : null;
  if (raw.photo_path !== undefined && raw.photo_path) payload.photo_path = raw.photo_path.trim();

  return payload;
}
