import { supabase } from "@/integrations/supabase/client";
import { type ItemRow } from "@/components/ItemFormDialog";
import { logActivity } from "@/lib/activity-logger";

export type ArchiveReason =
  | "sold"
  | "transfer"
  | "distribution"
  | "depleted"
  | "manual";

export interface ArchiveMeta {
  isArchived: boolean;
  reason: ArchiveReason;
  reasonLabel: string;
  reasonBadgeColor: string;
  date: string | null;
  by: string | null;
  extraInfo: string | null;
  cleanNotes: string;
}

/**
 * Checks whether an item is archived.
 * Checks both database column is_archived and notes metadata fallback tag.
 */
export function isItemArchived(item: ItemRow | null | undefined): boolean {
  if (!item) return false;
  if (item.is_archived === true) return true;
  if (
    item.notes &&
    (item.notes.includes("[ARCHIVED") || item.notes.includes("[مؤرشف]"))
  ) {
    return true;
  }
  return false;
}

/**
 * Clean archive metadata tags from the notes string
 */
export function stripArchiveTag(notes: string | null | undefined): string {
  if (!notes) return "";
  return notes
    .replace(/\[ARCHIVED:[^\]]*\]/gi, "")
    .replace(/\[ARCHIVED\]/gi, "")
    .replace(/\[مؤرشف:[^\]]*\]/gi, "")
    .replace(/\[مؤرشف\]/gi, "")
    .trim();
}

/**
 * Get readable archive details and reason badge metadata
 */
export function getArchiveMeta(
  item: ItemRow | null | undefined,
  lang: "ar" | "en" = "ar"
): ArchiveMeta {
  if (!item) {
    return {
      isArchived: false,
      reason: "manual",
      reasonLabel: lang === "ar" ? "غير مؤرشف" : "Active",
      reasonBadgeColor: "bg-slate-100 text-slate-700",
      date: null,
      by: null,
      extraInfo: null,
      cleanNotes: "",
    };
  }

  const archived = isItemArchived(item);
  let reason: ArchiveReason = "manual";
  let date: string | null = item.archived_at || null;
  let by: string | null = item.archived_by_email || null;
  let extraInfo: string | null = null;

  if (item.archived_reason) {
    reason = item.archived_reason as ArchiveReason;
  } else if (item.notes) {
    const match = item.notes.match(/\[ARCHIVED:([^:]*):([^:]*)(?::([^:]*))?(?::([^\]]*))?\]/i);
    if (match) {
      reason = (match[1] as ArchiveReason) || "manual";
      date = match[2] || date;
      by = match[3] || by;
      if (match[4]) {
        try {
          extraInfo = decodeURIComponent(match[4]);
        } catch {
          extraInfo = match[4];
        }
      }
    }
  }

  const labelsAr: Record<ArchiveReason, string> = {
    sold: extraInfo ? `تم البيع (${extraInfo})` : "تم البيع لعميل",
    transfer: extraInfo ? `نقل إلى (${extraInfo})` : "نقل لمخزن آخر",
    distribution: extraInfo ? `توزيع (${extraInfo})` : "توزيع / عينات",
    depleted: "نفاد المخزون (صرف بالكامل)",
    manual: "أرشفة يدوية",
  };

  const labelsEn: Record<ArchiveReason, string> = {
    sold: extraInfo ? `Sold (${extraInfo})` : "Sold to Customer",
    transfer: extraInfo ? `Transferred (${extraInfo})` : "Transferred to Warehouse",
    distribution: extraInfo ? `Distributed (${extraInfo})` : "Distribution / Samples",
    depleted: "Depleted (Zero Balance)",
    manual: "Manual Archive",
  };

  const colors: Record<ArchiveReason, string> = {
    sold: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
    transfer: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    distribution: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border-purple-200 dark:border-purple-800",
    depleted: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    manual: "bg-stone-100 text-stone-700 dark:bg-stone-900 dark:text-stone-300 border-stone-200 dark:border-stone-800",
  };

  return {
    isArchived: archived,
    reason,
    reasonLabel: lang === "ar" ? labelsAr[reason] || labelsAr.manual : labelsEn[reason] || labelsEn.manual,
    reasonBadgeColor: colors[reason] || colors.manual,
    date,
    by,
    extraInfo,
    cleanNotes: stripArchiveTag(item.notes),
  };
}

export interface ExecuteStockExitParams {
  item: ItemRow;
  exitQty: number;
  reason: ArchiveReason;
  targetOrCustomer?: string;
  priceOrInvoice?: string;
  notes?: string;
  forceArchive?: boolean;
  currentUser?: { id?: string; email?: string | null } | null;
}

/**
 * Execute Stock Exit (Sale, Transfer, Distribution, Deplete) and handle Archiving
 */
export async function executeStockExitAndArchive({
  item,
  exitQty,
  reason,
  targetOrCustomer = "",
  priceOrInvoice = "",
  notes = "",
  forceArchive = false,
  currentUser = null,
}: ExecuteStockExitParams): Promise<{
  success: boolean;
  remainingQty: number;
  wasArchived: boolean;
  error?: string;
}> {
  const currentQty = Number(item.quantity) || 0;
  const numExitQty = Math.max(0, parseFloat(exitQty.toFixed(4)));
  const remainingQty = Math.max(0, parseFloat((currentQty - numExitQty).toFixed(4)));

  // An item should be archived if remaining quantity reaches 0 OR forceArchive is explicitly requested
  const shouldArchive = forceArchive || remainingQty === 0;

  const nowIso = new Date().toISOString();
  const cleanOldNotes = stripArchiveTag(item.notes);

  let updatedNotes = cleanOldNotes;
  if (notes.trim()) {
    updatedNotes = updatedNotes ? `${updatedNotes}\n${notes.trim()}` : notes.trim();
  }

  const extraEncoded = targetOrCustomer.trim() ? encodeURIComponent(targetOrCustomer.trim()) : "";
  if (shouldArchive) {
    const archiveTag = `[ARCHIVED:${reason}:${nowIso}:${currentUser?.email || ""}:${extraEncoded}]`;
    updatedNotes = updatedNotes ? `${updatedNotes}\n${archiveTag}` : archiveTag;
  }

  // 1. Prepare movement description & line
  let lineDescription = "صرف مخزن";
  let movementType = "stock_exit";

  if (reason === "sold") {
    movementType = "sale";
    lineDescription = targetOrCustomer ? `بيع: ${targetOrCustomer}` : "مبيعات للعملاء";
  } else if (reason === "transfer") {
    movementType = "transfer";
    lineDescription = targetOrCustomer ? `تحويل إلى: ${targetOrCustomer}` : "نقل لمخزن آخر";
  } else if (reason === "distribution") {
    movementType = "distribution";
    lineDescription = targetOrCustomer ? `توزيع: ${targetOrCustomer}` : "توزيع / عينات";
  } else if (reason === "depleted") {
    movementType = "depleted";
    lineDescription = "نفاد المخزون (صرف بالكامل)";
  } else {
    movementType = "archive";
    lineDescription = "أرشفة المخزون";
  }

  const combinedMovementNotes = [
    targetOrCustomer ? `الجهة/المستلم: ${targetOrCustomer}` : null,
    priceOrInvoice ? `السعر/الفاتورة: ${priceOrInvoice}` : null,
    shouldArchive ? "تم نقل الصنف إلى الأرشيف" : null,
    notes.trim() || null,
  ]
    .filter(Boolean)
    .join(" | ");

  // 2. Update items table (Attempt full columns first, fallback gracefully to notes if column missing)
  try {
    const fullPayload: Record<string, any> = {
      quantity: remainingQty,
      notes: updatedNotes || null,
      updated_at: nowIso,
      is_archived: shouldArchive,
      archived_at: shouldArchive ? nowIso : null,
      archived_reason: shouldArchive ? reason : null,
      archived_by: shouldArchive ? currentUser?.id || null : null,
      archived_by_email: shouldArchive ? currentUser?.email || null : null,
    };

    const { error: fullUpdateError } = await supabase
      .from("items")
      .update(fullPayload)
      .eq("id", item.id);

    if (fullUpdateError) {
      // If column doesn't exist yet in remote DB, fallback to updating quantity + notes only
      if (
        fullUpdateError.message?.includes("is_archived") ||
        fullUpdateError.code === "42703" ||
        fullUpdateError.message?.includes("schema cache")
      ) {
        console.warn("is_archived column not yet in DB, falling back to notes tag:", fullUpdateError);
        const { error: fallbackError } = await supabase
          .from("items")
          .update({
            quantity: remainingQty,
            notes: updatedNotes || null,
            updated_at: nowIso,
          })
          .eq("id", item.id);

        if (fallbackError) throw fallbackError;
      } else {
        throw fullUpdateError;
      }
    }
  } catch (err: any) {
    console.error("Failed to update item exit/archive:", err);
    return {
      success: false,
      remainingQty: currentQty,
      wasArchived: false,
      error: err?.message || "Failed to update item",
    };
  }

  // 3. Record movement in stock_movements
  if (numExitQty > 0 || shouldArchive) {
    try {
      await supabase.from("stock_movements").insert({
        item_id: item.id,
        item_name: item.name,
        batch_number: item.batch_number || null,
        movement_type: movementType,
        quantity_dispensed: numExitQty > 0 ? numExitQty : (currentQty || 0),
        unit: item.unit || "كجم",
        previous_quantity: currentQty,
        remaining_quantity: remainingQty,
        production_line: lineDescription,
        recipient_name: targetOrCustomer.trim() || null,
        notes: combinedMovementNotes || null,
        dispensed_by: currentUser?.id || null,
        dispensed_by_email: currentUser?.email || null,
      });
    } catch (movErr) {
      console.warn("Stock movement recording non-critical warning:", movErr);
    }
  }

  // 4. Log activity
  void logActivity({
    action_type: shouldArchive ? "item_archive" : "stock_exit",
    entity_id: item.id,
    entity_name: `${item.name} (${item.batch_number || "No Batch"})`,
    details: {
      reason,
      exit_qty: numExitQty,
      remaining_qty: remainingQty,
      unit: item.unit,
      target_customer: targetOrCustomer || null,
      was_archived: shouldArchive,
      price_or_invoice: priceOrInvoice || null,
    },
  });

  return {
    success: true,
    remainingQty,
    wasArchived: shouldArchive,
  };
}

/**
 * Restore an archived item back to active inventory
 */
export async function restoreArchivedItem({
  item,
  newQuantity,
  currentUser = null,
}: {
  item: ItemRow;
  newQuantity?: number | null;
  currentUser?: { id?: string; email?: string | null } | null;
}): Promise<{ success: boolean; error?: string }> {
  const nowIso = new Date().toISOString();
  const cleanNotes = stripArchiveTag(item.notes);
  const qtyToSet = newQuantity !== undefined && newQuantity !== null ? newQuantity : (Number(item.quantity) || 0);

  try {
    const fullPayload: Record<string, any> = {
      is_archived: false,
      archived_at: null,
      archived_reason: null,
      archived_by: null,
      archived_by_email: null,
      quantity: qtyToSet,
      notes: cleanNotes || null,
      updated_at: nowIso,
    };

    const { error: fullUpdateErr } = await supabase
      .from("items")
      .update(fullPayload)
      .eq("id", item.id);

    if (fullUpdateErr) {
      if (
        fullUpdateErr.message?.includes("is_archived") ||
        fullUpdateErr.code === "42703" ||
        fullUpdateErr.message?.includes("schema cache")
      ) {
        const { error: fallbackErr } = await supabase
          .from("items")
          .update({
            quantity: qtyToSet,
            notes: cleanNotes || null,
            updated_at: nowIso,
          })
          .eq("id", item.id);

        if (fallbackErr) throw fallbackErr;
      } else {
        throw fullUpdateErr;
      }
    }

    // Insert restoration movement in stock_movements
    try {
      await supabase.from("stock_movements").insert({
        item_id: item.id,
        item_name: item.name,
        batch_number: item.batch_number || null,
        movement_type: "restore",
        quantity_dispensed: 0,
        unit: item.unit || "كجم",
        previous_quantity: Number(item.quantity) || 0,
        remaining_quantity: qtyToSet,
        production_line: "استعادة للمخزون النشط",
        recipient_name: currentUser?.email || null,
        notes: `تمت استعادة الصنف من الأرشيف بنجاح برصيد ${qtyToSet} ${item.unit || "كجم"}`,
        dispensed_by: currentUser?.id || null,
        dispensed_by_email: currentUser?.email || null,
      });
    } catch (movErr) {
      console.warn("Stock movement restore warning:", movErr);
    }

    // Activity log
    void logActivity({
      action_type: "item_restore",
      entity_id: item.id,
      entity_name: `${item.name} (${item.batch_number || "No Batch"})`,
      details: {
        restored_quantity: qtyToSet,
        unit: item.unit,
      },
    });

    return { success: true };
  } catch (err: any) {
    console.error("Failed to restore item:", err);
    return { success: false, error: err?.message || "Failed to restore item" };
  }
}
