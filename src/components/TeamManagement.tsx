import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import {
  Shield,
  ShieldCheck,
  UserPlus,
  Users,
  RefreshCw,
  UserCheck,
  Crown,
  PauseCircle,
  PlayCircle,
  LogOut,
  AlertTriangle,
  Eye,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useRegisterBackModal } from "@/lib/modal-stack";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useSettings, DEFAULT_PRIMARY_ADMIN_EMAIL, DEFAULT_PRIMARY_ADMIN_ID } from "@/hooks/use-settings";
import { useActiveSessions } from "@/hooks/use-active-sessions";
import {
  updateUserRoleServer,
  toggleUserSuspensionServer,
  forceLogoutUserServer,
  transferPrimaryAdminServer,
} from "@/lib/team.functions";

export type UserRole = "admin" | "quality" | "view_only";

interface TeamMember {
  id: string;
  email: string | null;
  role: UserRole;
  isPrimaryAdmin: boolean;
  isSuspended: boolean;
}

export function TeamManagement({ currentUserId }: { currentUserId?: string | undefined }) {
  const { lang } = useI18n();
  const { user, isPrimaryAdmin, primaryAdminEmail } = useAuth();
  const settings = useSettings();
  const { kickUser } = useActiveSessions();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  useRegisterBackModal(openAdd, () => setOpenAdd(false), "team-management-add-user");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("quality");
  const [creating, setCreating] = useState(false);

  // Transfer Super Admin Modal state
  const [targetTransferMember, setTargetTransferMember] = useState<TeamMember | null>(null);
  const [transferring, setTransferring] = useState(false);
  useRegisterBackModal(
    Boolean(targetTransferMember),
    () => setTargetTransferMember(null),
    "team-management-transfer-primary",
  );

  // Loading indicators for actions
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [suspendingUserId, setSuspendingUserId] = useState<string | null>(null);
  const [kickingUserId, setKickingUserId] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const [
        { data: profiles, error: pErr },
        { data: roles, error: rErr },
        { data: appSettings, error: sErr },
      ] = await Promise.all([
        supabase.from("profiles").select("id, email"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("app_settings").select("feature_flags").eq("id", true).maybeSingle(),
      ]);

      if (pErr) console.warn("Profiles query warning:", pErr);
      if (rErr) console.warn("User roles query warning:", rErr);
      if (sErr) console.warn("AppSettings query warning:", sErr);

      const flags = (appSettings?.feature_flags && typeof appSettings.feature_flags === "object"
        ? appSettings.feature_flags
        : {}) as Record<string, any>;

      const pEmail = (flags.primary_admin_email || DEFAULT_PRIMARY_ADMIN_EMAIL).toLowerCase();
      const pId = flags.primary_admin_id || DEFAULT_PRIMARY_ADMIN_ID;
      const suspendedList = Array.isArray(flags.suspended_user_ids) ? flags.suspended_user_ids : [];
      const viewOnlyList = Array.isArray(flags.view_only_user_ids) ? flags.view_only_user_ids : [];

      const rolesMap = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
      const list: TeamMember[] = (profiles ?? [])
        .filter((p) => Boolean(p && p.id))
        .map((p) => {
          const isPrimary = p.id === pId || (p.email && p.email.toLowerCase() === pEmail);
          const rawRole = rolesMap.get(p.id);
          const isViewOnly = viewOnlyList.includes(p.id);

          let normalizedRole: UserRole = "quality";
          if (isPrimary || rawRole === "admin") {
            normalizedRole = "admin";
          } else if (isViewOnly || rawRole === "view_only" || rawRole === "viewer") {
            normalizedRole = "view_only";
          } else {
            normalizedRole = "quality"; // data entry / member
          }

          return {
            id: String(p.id),
            email: p.email ? String(p.email) : null,
            role: normalizedRole,
            isPrimaryAdmin: Boolean(isPrimary),
            isSuspended: Boolean(!isPrimary && suspendedList.includes(p.id)),
          };
        });

      // Sort: Primary Admin first, then other Admins, then Data Entry, then Viewers
      list.sort((a, b) => {
        if (a.isPrimaryAdmin) return -1;
        if (b.isPrimaryAdmin) return 1;
        if (a.role === "admin" && b.role !== "admin") return -1;
        if (b.role === "admin" && a.role !== "admin") return 1;
        return 0;
      });

      setMembers(list);
    } catch (err) {
      console.error("Failed to load members:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || password.length < 6) {
      toast.error(
        lang === "ar"
          ? "يجب إدخال بريد إلكتروني صحيح وكلمة مرور لا تقل عن 6 أحرف"
          : "Please provide a valid email and password with at least 6 characters",
      );
      return;
    }

    setCreating(true);
    try {
      const dbRole = role === "admin" ? "admin" : "member";
      const { data: rpcUserId, error: rpcError } = await supabase.rpc(
        "create_team_member" as never,
        {
          _email: email.trim().toLowerCase(),
          _password: password,
          _role: dbRole,
        } as never,
      );

      let createdUserId = rpcUserId ? String(rpcUserId) : null;

      if (rpcError) {
        console.warn("RPC create_team_member error, falling back to auth.signUp:", rpcError);

        const isolatedClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });

        const { data: authResult, error: authError } = await isolatedClient.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
        });

        if (authError) {
          if (
            authError.message.toLowerCase().includes("rate limit") ||
            authError.code === "over_email_send_rate_limit"
          ) {
            toast.error(
              lang === "ar"
                ? "تنبيه: تم تجاوز حد إرسال الإيميلات. يُرجى تشغيل كود SQL الخاص بدالة create_team_member في لوحة سوبابيز للإنشاء الفوري المباشر، أو إلغاء تفعيل Confirm Email."
                : "Email rate limit exceeded. Please disable 'Confirm email' in Supabase.",
            );
            return;
          }
          throw authError;
        }

        createdUserId = authResult.user?.id || null;
      }

      if (createdUserId) {
        try {
          await updateUserRoleServer({
            data: {
              targetUserId: createdUserId,
              newRole: role,
              requesterUserId: currentUserId,
              requesterEmail: user?.email,
            },
          });
        } catch (srvErr) {
          console.warn("[handleCreateUser] Server fn role assign error, applying direct fallback:", srvErr);
          const { error: insErr } = await supabase.from("user_roles").insert({
            user_id: createdUserId,
            role: dbRole as any,
          });
          if (insErr) console.warn("user_roles direct insert:", insErr);
        }
      }

      toast.success(
        lang === "ar"
          ? `تم إنشاء حساب ${email} بنجاح كـ (${
              role === "admin"
                ? "Admin (مدير نظام)"
                : role === "quality"
                ? "مهندس إدخال (Data Entry)"
                : "Viewer / Free (مشاهد فقط)"
            })!`
          : `Account ${email} created successfully as (${role})!`,
      );

      setEmail("");
      setPassword("");
      setRole("quality");
      setOpenAdd(false);
      void fetchMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const handleChangeRole = async (member: TeamMember, newRole: UserRole) => {
    if (member.isPrimaryAdmin) {
      toast.error(
        lang === "ar"
          ? "لا يمكن تغيير صلاحية الآدمن الرئيسي للنظام أو تخفيض رتبته"
          : "Cannot change Primary Admin role",
      );
      return;
    }
    if (member.id === currentUserId && !isPrimaryAdmin) {
      toast.error(
        lang === "ar"
          ? "لا يمكنك تغيير صلاحية حسابك الحالي بنفسك"
          : "You cannot change your own role",
      );
      return;
    }

    setUpdatingUserId(member.id);
    try {
      try {
        await updateUserRoleServer({
          data: {
            targetUserId: member.id,
            newRole,
            requesterUserId: currentUserId,
            requesterEmail: user?.email,
          },
        });
      } catch (srvErr) {
        console.warn("[handleChangeRole] Server fn fallback to direct client update:", srvErr);

        const dbRole = newRole === "admin" ? "admin" : "member";
        const { data: existingRole } = await supabase
          .from("user_roles")
          .select("id")
          .eq("user_id", member.id)
          .maybeSingle();

        if (existingRole?.id) {
          const { error: updErr } = await supabase
            .from("user_roles")
            .update({ role: dbRole as any })
            .eq("id", existingRole.id);
          if (updErr) throw updErr;
        } else {
          const { error: insErr } = await supabase
            .from("user_roles")
            .insert({ user_id: member.id, role: dbRole as any });
          if (insErr) throw insErr;
        }

        const { data: curSettings } = await supabase
          .from("app_settings")
          .select("feature_flags")
          .eq("id", true)
          .maybeSingle();

        const curFlags = (curSettings?.feature_flags && typeof curSettings.feature_flags === "object"
          ? curSettings.feature_flags
          : {}) as Record<string, any>;

        const vList = new Set<string>(
          Array.isArray(curFlags.view_only_user_ids) ? curFlags.view_only_user_ids : [],
        );
        if (newRole === "view_only") vList.add(member.id);
        else vList.delete(member.id);

        await supabase
          .from("app_settings")
          .update({ feature_flags: { ...curFlags, view_only_user_ids: Array.from(vList) } })
          .eq("id", true);
      }

      toast.success(
        lang === "ar"
          ? `تم تعديل دور (${member.email}) إلى (${
              newRole === "admin"
                ? "Admin (مدير نظام)"
                : newRole === "quality"
                ? "مهندس إدخال (Data Entry)"
                : "Viewer / Free (مشاهد فقط)"
            }) بنجاح ✅`
          : `Updated role for ${member.email} to ${newRole}`,
      );
      void fetchMembers();
      void settings.refetch();
    } catch (err: any) {
      console.error("Failed to update role:", err);
      toast.error(
        err?.message || (lang === "ar" ? "فشل تعديل الدور، حاول مرة أخرى" : "Failed to update role"),
      );
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleToggleSuspension = async (member: TeamMember) => {
    if (member.isPrimaryAdmin) {
      toast.error(
        lang === "ar" ? "لا يمكن إيقاف حساب الآدمن الرئيسي للنظام" : "Cannot suspend Primary Admin",
      );
      return;
    }
    if (member.id === currentUserId) {
      toast.error(
        lang === "ar" ? "لا يمكنك إيقاف حسابك الحالي" : "Cannot suspend your own account",
      );
      return;
    }

    const nextSuspendState = !member.isSuspended;
    setSuspendingUserId(member.id);

    try {
      try {
        await toggleUserSuspensionServer({
          data: {
            targetUserId: member.id,
            suspend: nextSuspendState,
            requesterUserId: currentUserId,
          },
        });
      } catch (srvErr) {
        console.warn("[handleToggleSuspension] Server fn fallback:", srvErr);
        const { data: curSettings } = await supabase
          .from("app_settings")
          .select("feature_flags")
          .eq("id", true)
          .maybeSingle();

        const curFlags = (curSettings?.feature_flags && typeof curSettings.feature_flags === "object"
          ? curSettings.feature_flags
          : {}) as Record<string, any>;

        const sList = new Set<string>(
          Array.isArray(curFlags.suspended_user_ids) ? curFlags.suspended_user_ids : [],
        );
        if (nextSuspendState) sList.add(member.id);
        else sList.delete(member.id);

        await supabase
          .from("app_settings")
          .update({ feature_flags: { ...curFlags, suspended_user_ids: Array.from(sList) } })
          .eq("id", true);
      }

      if (nextSuspendState) {
        // Send immediate Realtime force logout broadcast
        await kickUser(member.id, member.email || undefined);
      }

      toast.success(
        nextSuspendState
          ? (lang === "ar"
              ? `تم إيقاف حساب (${member.email}) مؤقتاً وتجميد صلاحياته ⏸️`
              : `Account suspended`)
          : (lang === "ar"
              ? `تمت إعادة تنشيط حساب (${member.email}) بنجاح ▶️`
              : `Account reactivated`),
      );
      void fetchMembers();
      void settings.refetch();
    } catch (err: any) {
      toast.error(
        err?.message || (lang === "ar" ? "تعذر تغيير حالة الحساب" : "Failed to change account status"),
      );
    } finally {
      setSuspendingUserId(null);
    }
  };

  const handleForceLogout = async (member: TeamMember) => {
    if (member.isPrimaryAdmin) {
      toast.error(
        lang === "ar" ? "لا يمكن إنهاء جلسة الآدمن الرئيسي" : "Cannot force logout Primary Admin",
      );
      return;
    }
    if (member.id === currentUserId) {
      toast.info(
        lang === "ar"
          ? "استخدم زر تسجيل الخروج لإنهاء جلستك الحالية"
          : "Use sign out button for your own session",
      );
      return;
    }

    setKickingUserId(member.id);
    try {
      // 1. Send WebSocket broadcast
      await kickUser(member.id, member.email || undefined);

      // 2. Persist in database revoked_sessions
      try {
        await forceLogoutUserServer({
          data: { targetUserId: member.id, requesterUserId: currentUserId },
        });
      } catch (srvErr) {
        console.warn("[handleForceLogout] Server fn fallback:", srvErr);
        const { data: curSettings } = await supabase
          .from("app_settings")
          .select("feature_flags")
          .eq("id", true)
          .maybeSingle();

        const curFlags = (curSettings?.feature_flags && typeof curSettings.feature_flags === "object"
          ? curSettings.feature_flags
          : {}) as Record<string, any>;

        const rev = {
          ...(typeof curFlags.revoked_sessions === "object" && curFlags.revoked_sessions !== null
            ? curFlags.revoked_sessions
            : {}),
        };
        rev[member.id] = Date.now();

        await supabase
          .from("app_settings")
          .update({ feature_flags: { ...curFlags, revoked_sessions: rev } })
          .eq("id", true);
      }

      toast.success(
        lang === "ar"
          ? `تم إنهاء جلسة (${member.email}) وطرده من النظام فوراً 🚪`
          : `Session terminated for ${member.email}`,
      );
      void settings.refetch();
    } catch (err: any) {
      toast.error(
        err?.message || (lang === "ar" ? "تعذر إنهاء الجلسة" : "Failed to terminate session"),
      );
    } finally {
      setKickingUserId(null);
    }
  };

  const handleTransferPrimaryAdmin = async () => {
    if (!targetTransferMember) return;
    if (!isPrimaryAdmin) {
      toast.error(
        lang === "ar"
          ? "فقط الآدمن الرئيسي يملك صلاحية نقل إدارة النظام الأساسية"
          : "Only Primary Admin can transfer ownership",
      );
      return;
    }

    setTransferring(true);
    try {
      await transferPrimaryAdminServer({
        data: {
          newPrimaryAdminId: targetTransferMember.id,
          newPrimaryAdminEmail: targetTransferMember.email || "",
          currentRequesterId: currentUserId || "",
          currentRequesterEmail: user?.email || undefined,
        },
      });

      toast.success(
        lang === "ar"
          ? `تم نقل صفة الآدمن الرئيسي (Super Admin) بنجاح إلى (${targetTransferMember.email}) 👑`
          : `Primary admin transferred to ${targetTransferMember.email}`,
      );
      setTargetTransferMember(null);
      void fetchMembers();
      void settings.refetch();
    } catch (err: any) {
      toast.error(
        err?.message || (lang === "ar" ? "فشل نقل الآدمن الرئيسي" : "Failed to transfer primary admin"),
      );
    } finally {
      setTransferring(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-cocoa">
            <Users className="h-5 w-5 text-cocoa" />
            {lang === "ar" ? "إدارة فريق العمل والمستخدمين" : "Team & User Management"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {lang === "ar"
              ? "التحكم في أدوار الفريق، إيقاف الحسابات مؤقتاً، إنهاء الجلسات النشطة، وإدارة الآدمن الرئيسي."
              : "Manage team roles, suspend accounts, force terminate sessions, and transfer primary admin."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchMembers()}
            disabled={loading}
            className="h-8 gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {lang === "ar" ? "تحديث" : "Refresh"}
          </Button>

          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5">
                <UserPlus className="h-3.5 w-3.5" />
                {lang === "ar" ? "إضافة عضو جديد" : "Add Member"}
              </Button>
            </DialogTrigger>
            <DialogContent className="w-full max-w-[95vw] sm:max-w-md max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {lang === "ar" ? "إنشاء حساب موظف جديد" : "Create New Team Member"}
                </DialogTitle>
              </DialogHeader>

              <form onSubmit={handleCreateUser} className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="new-user-email">
                    {lang === "ar" ? "البريد الإلكتروني للموظف" : "Employee Email"}
                  </Label>
                  <Input
                    id="new-user-email"
                    type="email"
                    required
                    placeholder="inspector@vienna.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-user-pwd">
                    {lang === "ar"
                      ? "كلمة المرور الأولية (6 أحرف فأكثر)"
                      : "Initial Password (min 6)"}
                  </Label>
                  <Input
                    id="new-user-pwd"
                    type="password"
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-user-role">
                    {lang === "ar" ? "الصلاحية / الدور" : "Role"}
                  </Label>
                  <select
                    id="new-user-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="admin">
                      {lang === "ar"
                        ? "⭐ Admin (مدير نظام) — صلاحيات كاملة: إضافة/تعديل/حذف + إعدادات البرنامج"
                        : "⭐ Admin — Full access: add/edit/delete + system settings"}
                    </option>
                    <option value="quality">
                      {lang === "ar"
                        ? "✏️ مهندس إدخال (Data Entry) — إضافة وتعديل وجرد (بدون وصول للإعدادات)"
                        : "✏️ Data Entry Engineer — Add/edit/audit (no settings access)"}
                    </option>
                    <option value="view_only">
                      {lang === "ar"
                        ? "👁️ Viewer / Free (مشاهد فقط) — استعراض وقراءة فقط بدون تعديل أو حذف"
                        : "👁️ Viewer / Free — Read-only, no edits/deletions"}
                    </option>
                  </select>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpenAdd(false)}
                    disabled={creating}
                  >
                    {lang === "ar" ? "إلغاء" : "Cancel"}
                  </Button>
                  <Button type="submit" disabled={creating}>
                    {creating
                      ? lang === "ar"
                        ? "جارٍ الإنشاء…"
                        : "Creating…"
                      : lang === "ar"
                        ? "إنشاء الحساب"
                        : "Create Account"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Primary Admin Highlight Card */}
      <div className="rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-3.5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/20 text-amber-900 dark:text-amber-200 ring-2 ring-amber-500/30">
              <Crown className="h-5 w-5 fill-amber-500 text-amber-600 dark:text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-950 dark:text-amber-200">
                  {lang === "ar" ? "الآدمن الرئيسي للنظام (Super Admin)" : "System Super Admin"}
                </span>
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:text-amber-300">
                  👑 {primaryAdminEmail || DEFAULT_PRIMARY_ADMIN_EMAIL}
                </span>
              </div>
              <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80 mt-0.5">
                {lang === "ar"
                  ? "يملك الصلاحية العليا الحصرية لإيقاف وتنشيط الحسابات، إنهاء الجلسات فوراً، ونقل صلاحية الآدمن الرئيسي لأي أدمن آخر."
                  : "Holds supreme authority to suspend accounts, force logout sessions, and transfer primary admin status."}
              </p>
            </div>
          </div>

          {isPrimaryAdmin && (
            <span className="rounded-md border border-amber-500/40 bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-900 dark:text-amber-200">
              {lang === "ar" ? "أنت الآدمن الرئيسي الحالي" : "You are Super Admin"}
            </span>
          )}
        </div>
      </div>

      {/* Roles Legend */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 pt-0.5">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
          <div className="flex items-center gap-1.5 font-bold text-xs text-amber-950 dark:text-amber-200">
            <span>⭐</span>
            <span>{lang === "ar" ? "Admin (مدير نظام)" : "Admin"}</span>
          </div>
          <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80 mt-1 leading-relaxed">
            {lang === "ar"
              ? "صلاحيات كاملة: إضافة/تعديل/حذف أصناف وحركات المخزن + التحكم في الإعدادات."
              : "Full permissions: add/edit/delete + manage system settings."}
          </p>
        </div>

        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5">
          <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-950 dark:text-emerald-200">
            <span>✏️</span>
            <span>{lang === "ar" ? "مهندس إدخال (Data Entry)" : "Data Entry Engineer"}</span>
          </div>
          <p className="text-[11px] text-emerald-900/80 dark:text-emerald-200/80 mt-1 leading-relaxed">
            {lang === "ar"
              ? "إضافة وتعديل أصناف وحركات المخزن والجرد، بدون وصول لإعدادات النظام."
              : "Add/edit items, movements, and audit. No system settings access."}
          </p>
        </div>

        <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-muted/40 p-2.5">
          <div className="flex items-center gap-1.5 font-bold text-xs text-foreground">
            <span>👁️</span>
            <span>{lang === "ar" ? "Viewer / Free (مشاهد فقط)" : "Viewer / Free"}</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
            {lang === "ar"
              ? "استعراض ومطالعة البيانات والتقارير فقط دون أي إضافة أو تعديل أو حذف."
              : "Read-only access: view inventory and reports without edit capabilities."}
          </p>
        </div>
      </div>

      {/* Members List */}
      <div className="divide-y rounded-lg border">
        {members.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            {loading
              ? lang === "ar"
                ? "جارٍ تحميل المستخدمين…"
                : "Loading members…"
              : lang === "ar"
                ? "لا يوجد مستخدمون مسجلون بعد"
                : "No users found"}
          </div>
        ) : (
          members.map((m, idx) => {
            const memberId = m?.id ? String(m.id) : "";
            const isSelf = Boolean(memberId && currentUserId && memberId === currentUserId);
            const displayName =
              m?.email || (memberId ? memberId.slice(0, 8) : lang === "ar" ? "مستخدم" : "User");

            const isUpdatingRole = updatingUserId === memberId;
            const isSuspending = suspendingUserId === memberId;
            const isKicking = kickingUserId === memberId;

            return (
              <div
                key={memberId || `member-${idx}`}
                className={`p-3.5 text-sm transition-colors hover:bg-muted/20 ${
                  m.isSuspended ? "bg-destructive/5" : ""
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Left: User Info */}
                  <div className="flex items-center gap-2.5 min-w-[200px]">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${
                        m.isPrimaryAdmin
                          ? "bg-amber-500/20 text-amber-900 dark:text-amber-200 ring-2 ring-amber-500/40"
                          : m.role === "admin"
                          ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                          : m.role === "quality"
                          ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                          : "bg-slate-500/15 text-slate-800 dark:text-slate-300"
                      }`}
                    >
                      {m.isPrimaryAdmin ? (
                        <Crown className="h-4 w-4 fill-amber-500 text-amber-600" />
                      ) : m.role === "admin" ? (
                        <ShieldCheck className="h-4 w-4" />
                      ) : m.role === "quality" ? (
                        <UserCheck className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <span className={m.isSuspended ? "line-through text-muted-foreground" : ""}>
                          {displayName}
                        </span>

                        {m.isPrimaryAdmin && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:text-amber-200 border border-amber-500/40">
                            👑 {lang === "ar" ? "الآدمن الرئيسي" : "Super Admin"}
                          </span>
                        )}

                        {isSelf && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {lang === "ar" ? "أنت" : "You"}
                          </span>
                        )}

                        {m.isSuspended && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-bold text-destructive">
                            <PauseCircle className="h-3 w-3" />
                            {lang === "ar" ? "موقوف مؤقتاً" : "Suspended"}
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-muted-foreground mt-0.5">
                        {m.isPrimaryAdmin
                          ? lang === "ar"
                            ? "👑 الآدمن الرئيسي — صلاحيات إدارة المنظومة الكاملة + نقل الإدارة"
                            : "Super Admin: Full platform control + transfer ownership"
                          : m.role === "admin"
                          ? lang === "ar"
                            ? "⭐ Admin — مدير نظام: صلاحيات إضافة/تعديل/حذف + الإعدادات"
                            : "Admin: Add/Edit/Delete + system settings control"
                          : m.role === "quality"
                          ? lang === "ar"
                            ? "✏️ مهندس إدخال — إضافة وتعديل أصناف وحركات وجرد (بدون إعدادات)"
                            : "Data Entry Engineer: Add/edit/audit (no settings)"
                          : lang === "ar"
                          ? "👁️ Viewer / Free — مشاهد فقط: استعراض ومطالعة فقط"
                          : "Viewer / Free: Read-only access"}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions & Role Selector */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Role Selector */}
                    {!m.isPrimaryAdmin && !isSelf ? (
                      <select
                        value={m.role}
                        disabled={isUpdatingRole}
                        onChange={(e) => void handleChangeRole(m, e.target.value as UserRole)}
                        className="h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-ring font-semibold"
                      >
                        <option value="admin">⭐ {lang === "ar" ? "Admin (مدير نظام)" : "Admin"}</option>
                        <option value="quality">
                          ✏️ {lang === "ar" ? "مهندس إدخال (Data Entry)" : "Data Entry"}
                        </option>
                        <option value="view_only">
                          👁️ {lang === "ar" ? "Viewer / Free (مشاهد فقط)" : "Viewer / Free"}
                        </option>
                      </select>
                    ) : m.isPrimaryAdmin ? (
                      <span className="rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200 px-2.5 py-1 text-xs font-bold flex items-center gap-1">
                        👑 {lang === "ar" ? "الآدمن الرئيسي" : "Super Admin"}
                      </span>
                    ) : (
                      <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
                        {lang === "ar" ? "حسابك الحالي" : "Current Account"}
                      </span>
                    )}

                    {/* Transfer Super Admin Button (Only Primary Admin can transfer to another Admin) */}
                    {isPrimaryAdmin && !m.isPrimaryAdmin && m.role === "admin" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setTargetTransferMember(m)}
                        className="h-8 gap-1 border-amber-500/40 text-amber-900 dark:text-amber-200 hover:bg-amber-500/15 text-xs font-semibold"
                      >
                        <Crown className="h-3.5 w-3.5 text-amber-600" />
                        {lang === "ar" ? "نقل الآدمن الرئيسي 👑" : "Transfer Primary"}
                      </Button>
                    )}

                    {/* Temporary Suspend / Activate Toggle */}
                    {!m.isPrimaryAdmin && !isSelf && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isSuspending}
                        onClick={() => void handleToggleSuspension(m)}
                        className={`h-8 gap-1 text-xs font-semibold ${
                          m.isSuspended
                            ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15"
                            : "border-destructive/30 text-destructive hover:bg-destructive/10"
                        }`}
                      >
                        {m.isSuspended ? (
                          <>
                            <PlayCircle className={`h-3.5 w-3.5 ${isSuspending ? "animate-spin" : ""}`} />
                            {lang === "ar" ? "تنشيط الحساب ▶️" : "Activate"}
                          </>
                        ) : (
                          <>
                            <PauseCircle className={`h-3.5 w-3.5 ${isSuspending ? "animate-spin" : ""}`} />
                            {lang === "ar" ? "إيقاف مؤقت ⏸️" : "Suspend"}
                          </>
                        )}
                      </Button>
                    )}

                    {/* Force Logout Button */}
                    {!m.isPrimaryAdmin && !isSelf && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={isKicking}
                        onClick={() => void handleForceLogout(m)}
                        className="h-8 gap-1 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title={lang === "ar" ? "إنهاء الجلسة فوراً وطرده من النظام" : "Force Logout Session"}
                      >
                        <LogOut className={`h-3.5 w-3.5 ${isKicking ? "animate-spin" : ""}`} />
                        {lang === "ar" ? "إنهاء الجلسة 🚪" : "Kick"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Transfer Primary Admin Confirmation Modal */}
      <Dialog
        open={Boolean(targetTransferMember)}
        onOpenChange={(open) => {
          if (!open) setTargetTransferMember(null);
        }}
      >
        <DialogContent className="w-full max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 mb-2">
              <Crown className="h-6 w-6 fill-amber-500" />
            </div>
            <DialogTitle className="text-center">
              {lang === "ar" ? "تأكيد نقل صفة الآدمن الرئيسي (Super Admin)" : "Transfer Super Admin Ownership"}
            </DialogTitle>
            <DialogDescription className="text-center text-xs pt-1 leading-relaxed">
              {lang === "ar" ? (
                <>
                  هل أنت متأكد من نقل صلاحية <strong>الآدمن الرئيسي</strong> إلى:
                  <br />
                  <span className="font-bold text-foreground text-sm">
                    {targetTransferMember?.email}
                  </span>
                  <br />
                  <span className="text-destructive font-semibold mt-2 inline-block">
                    ⚠️ تنبيه: بعد نقل الصلاحية سيصبح هذا الحساب هو المسؤول الأول عن المنظومة، وسيتحول
                    حسابك إلى مدير نظام (Admin) عادي.
                  </span>
                </>
              ) : (
                `Are you sure you want to transfer Super Admin ownership to ${targetTransferMember?.email}?`
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setTargetTransferMember(null)}
              disabled={transferring}
            >
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={() => void handleTransferPrimaryAdmin()}
              disabled={transferring}
              className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Crown className="h-4 w-4" />
              {transferring
                ? lang === "ar"
                  ? "جارٍ النقل…"
                  : "Transferring…"
                : lang === "ar"
                ? "تأكيد النقل الآن 👑"
                : "Confirm Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
