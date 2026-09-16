import { supabase } from "@/integrations/supabase/client";

export type ActivityActionType =
  | "item_create"
  | "item_update"
  | "item_delete"
  | "stock_dispense"
  | "qc_status_change"
  | "app_lock_toggle"
  | "settings_update";

export interface LogActivityParams {
  action_type: ActivityActionType;
  entity_id?: string | null;
  entity_name?: string | null;
  details?: Record<string, any>;
}

export async function logActivity({
  action_type,
  entity_id = null,
  entity_name = null,
  details = {},
}: LogActivityParams): Promise<void> {
  try {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) return;

    await supabase.from("activity_logs").insert({
      user_id: user.id,
      user_email: user.email ?? null,
      action_type,
      entity_id,
      entity_name,
      details,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
  } catch (err) {
    // Fail silently so audit logging never interrupts user actions
    console.warn("Activity logging non-critical error:", err);
  }
}
