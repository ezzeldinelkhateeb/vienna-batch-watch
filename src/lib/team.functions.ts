import { createServerFn } from "@tanstack/react-start";
import { DEFAULT_PRIMARY_ADMIN_EMAIL, DEFAULT_PRIMARY_ADMIN_ID } from "@/hooks/use-settings";

export interface UpdateRolePayload {
  targetUserId: string;
  newRole: "admin" | "quality" | "view_only";
  requesterUserId?: string;
  requesterEmail?: string;
}

export interface ToggleSuspensionPayload {
  targetUserId: string;
  suspend: boolean;
  requesterUserId?: string;
}

export interface ForceLogoutPayload {
  targetUserId: string;
  requesterUserId?: string;
}

export interface TransferPrimaryAdminPayload {
  newPrimaryAdminId: string;
  newPrimaryAdminEmail: string;
  currentRequesterId: string;
  currentRequesterEmail?: string;
}

/** Helper to get current app settings using supabaseAdmin */
async function getSettingsAndFlags() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("feature_flags")
    .eq("id", true)
    .maybeSingle();

  const currentFlags = (settings?.feature_flags && typeof settings.feature_flags === "object"
    ? settings.feature_flags
    : {}) as Record<string, any>;

  return { supabaseAdmin, currentFlags };
}

/** Check whether a given user is the Primary Admin */
function isUserPrimaryAdmin(
  userId: string | undefined,
  email: string | undefined,
  flags: Record<string, any>,
): boolean {
  const primaryId = flags.primary_admin_id || DEFAULT_PRIMARY_ADMIN_ID;
  const primaryEmail = (flags.primary_admin_email || DEFAULT_PRIMARY_ADMIN_EMAIL).toLowerCase();

  if (userId && userId === primaryId) return true;
  if (email && email.toLowerCase() === primaryEmail) return true;
  return false;
}

/**
 * Server Function: Update User Role
 * Bypasses RLS and Postgres ENUM limitations by safely persisting:
 * - admin -> role: 'admin'
 * - quality -> role: 'member', remove from view_only_user_ids
 * - view_only -> role: 'member', add to view_only_user_ids
 */
export const updateUserRoleServer = createServerFn({ method: "POST" })
  .validator((data: UpdateRolePayload) => data)
  .handler(async ({ data }) => {
    const { targetUserId, newRole } = data;
    if (!targetUserId) {
      throw new Error("Target user ID is required");
    }

    const { supabaseAdmin, currentFlags } = await getSettingsAndFlags();

    // Prevent demoting the Primary Admin
    const targetIsPrimary = isUserPrimaryAdmin(targetUserId, undefined, currentFlags);
    if (targetIsPrimary && newRole !== "admin") {
      throw new Error("لا يمكن تغيير صلاحية الآدمن الرئيسي أو تخفيض رتبته");
    }

    // 1. Update user_roles in database
    // DB enum app_role only supports 'admin' and 'member'
    const dbRole = newRole === "admin" ? "admin" : "member";

    const { data: existingRoleRow } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (existingRoleRow?.id) {
      const { error: updErr } = await supabaseAdmin
        .from("user_roles")
        .update({ role: dbRole as any })
        .eq("id", existingRoleRow.id);
      if (updErr) {
        console.error("[updateUserRoleServer] Update error:", updErr);
        throw new Error(updErr.message);
      }
    } else {
      const { error: insErr } = await supabaseAdmin.from("user_roles").insert({
        user_id: targetUserId,
        role: dbRole as any,
      });
      if (insErr) {
        console.error("[updateUserRoleServer] Insert error:", insErr);
        throw new Error(insErr.message);
      }
    }

    // 2. Update view_only_user_ids list in app_settings.feature_flags
    const viewOnlyList = new Set<string>(
      Array.isArray(currentFlags.view_only_user_ids) ? currentFlags.view_only_user_ids : [],
    );

    if (newRole === "view_only") {
      viewOnlyList.add(targetUserId);
    } else {
      viewOnlyList.delete(targetUserId);
    }

    const updatedFlags = {
      ...currentFlags,
      view_only_user_ids: Array.from(viewOnlyList),
    };

    await supabaseAdmin
      .from("app_settings")
      .update({ feature_flags: updatedFlags })
      .eq("id", true);

    return { success: true, targetUserId, newRole, dbRole };
  });

/**
 * Server Function: Toggle User Suspension (إيقاف الحساب مؤقتاً أو تنشيطه)
 */
export const toggleUserSuspensionServer = createServerFn({ method: "POST" })
  .validator((data: ToggleSuspensionPayload) => data)
  .handler(async ({ data }) => {
    const { targetUserId, suspend } = data;
    if (!targetUserId) throw new Error("Target user ID is required");

    const { supabaseAdmin, currentFlags } = await getSettingsAndFlags();

    // Guard: Cannot suspend the Primary Admin
    if (isUserPrimaryAdmin(targetUserId, undefined, currentFlags)) {
      throw new Error("لا يمكن إيقاف حساب الآدمن الرئيسي للنظام");
    }

    const suspendedList = new Set<string>(
      Array.isArray(currentFlags.suspended_user_ids) ? currentFlags.suspended_user_ids : [],
    );

    const revokedSessions = {
      ...(typeof currentFlags.revoked_sessions === "object" && currentFlags.revoked_sessions !== null
        ? currentFlags.revoked_sessions
        : {}),
    };

    if (suspend) {
      suspendedList.add(targetUserId);
      // Immediately revoke sessions when suspending
      revokedSessions[targetUserId] = Date.now();
    } else {
      suspendedList.delete(targetUserId);
    }

    const updatedFlags = {
      ...currentFlags,
      suspended_user_ids: Array.from(suspendedList),
      revoked_sessions: revokedSessions,
    };

    const { error: setErr } = await supabaseAdmin
      .from("app_settings")
      .update({ feature_flags: updatedFlags })
      .eq("id", true);

    if (setErr) {
      console.error("[toggleUserSuspensionServer] Error updating settings:", setErr);
      throw new Error(setErr.message);
    }

    return { success: true, targetUserId, suspended: suspend };
  });

/**
 * Server Function: Force Logout / Revoke Active Session (إنهاء الجلسة فوراً)
 */
export const forceLogoutUserServer = createServerFn({ method: "POST" })
  .validator((data: ForceLogoutPayload) => data)
  .handler(async ({ data }) => {
    const { targetUserId } = data;
    if (!targetUserId) throw new Error("Target user ID is required");

    const { supabaseAdmin, currentFlags } = await getSettingsAndFlags();

    if (isUserPrimaryAdmin(targetUserId, undefined, currentFlags)) {
      throw new Error("لا يمكن إنهاء جلسة الآدمن الرئيسي");
    }

    const revokedSessions = {
      ...(typeof currentFlags.revoked_sessions === "object" && currentFlags.revoked_sessions !== null
        ? currentFlags.revoked_sessions
        : {}),
    };

    revokedSessions[targetUserId] = Date.now();

    const updatedFlags = {
      ...currentFlags,
      revoked_sessions: revokedSessions,
    };

    const { error: setErr } = await supabaseAdmin
      .from("app_settings")
      .update({ feature_flags: updatedFlags })
      .eq("id", true);

    if (setErr) {
      console.error("[forceLogoutUserServer] Error updating settings:", setErr);
      throw new Error(setErr.message);
    }

    return { success: true, targetUserId, revokedAt: revokedSessions[targetUserId] };
  });

/**
 * Server Function: Transfer Primary Admin (نقل صفة الآدمن الرئيسي)
 */
export const transferPrimaryAdminServer = createServerFn({ method: "POST" })
  .validator((data: TransferPrimaryAdminPayload) => data)
  .handler(async ({ data }) => {
    const { newPrimaryAdminId, newPrimaryAdminEmail, currentRequesterId, currentRequesterEmail } = data;

    if (!newPrimaryAdminId || !newPrimaryAdminEmail) {
      throw new Error("New primary admin data is required");
    }

    const { supabaseAdmin, currentFlags } = await getSettingsAndFlags();

    // Verify requester is indeed current primary admin
    const requesterIsPrimary = isUserPrimaryAdmin(
      currentRequesterId,
      currentRequesterEmail,
      currentFlags,
    );

    if (!requesterIsPrimary) {
      throw new Error("فقط الآدمن الرئيسي الحالي يملك صلاحية نقل إدارة النظام الأساسية");
    }

    // Ensure new primary admin is assigned admin role in user_roles
    const { data: existingRoleRow } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", newPrimaryAdminId)
      .maybeSingle();

    if (existingRoleRow?.id) {
      await supabaseAdmin
        .from("user_roles")
        .update({ role: "admin" as any })
        .eq("id", existingRoleRow.id);
    } else {
      await supabaseAdmin.from("user_roles").insert({
        user_id: newPrimaryAdminId,
        role: "admin" as any,
      });
    }

    // Remove new primary admin from view_only_user_ids or suspended_user_ids if they were in there
    const viewOnlyList = new Set<string>(
      Array.isArray(currentFlags.view_only_user_ids) ? currentFlags.view_only_user_ids : [],
    );
    viewOnlyList.delete(newPrimaryAdminId);

    const suspendedList = new Set<string>(
      Array.isArray(currentFlags.suspended_user_ids) ? currentFlags.suspended_user_ids : [],
    );
    suspendedList.delete(newPrimaryAdminId);

    const updatedFlags = {
      ...currentFlags,
      primary_admin_id: newPrimaryAdminId,
      primary_admin_email: newPrimaryAdminEmail.trim().toLowerCase(),
      view_only_user_ids: Array.from(viewOnlyList),
      suspended_user_ids: Array.from(suspendedList),
    };

    const { error: setErr } = await supabaseAdmin
      .from("app_settings")
      .update({ feature_flags: updatedFlags })
      .eq("id", true);

    if (setErr) {
      console.error("[transferPrimaryAdminServer] Error updating settings:", setErr);
      throw new Error(setErr.message);
    }

    return {
      success: true,
      newPrimaryAdminId,
      newPrimaryAdminEmail,
    };
  });
