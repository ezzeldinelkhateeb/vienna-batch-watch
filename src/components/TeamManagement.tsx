import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Shield, ShieldCheck, UserPlus, Users, RefreshCw, UserCheck } from "lucide-react";
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
} from "@/components/ui/dialog";

export type UserRole = "admin" | "quality" | "view_only";

interface TeamMember {
  id: string;
  email: string | null;
  role: UserRole;
}

export function TeamManagement({ currentUserId }: { currentUserId?: string | undefined }) {
  const { lang } = useI18n();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  useRegisterBackModal(openAdd, () => setOpenAdd(false), "team-management-add-user");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("quality");
  const [creating, setCreating] = useState(false);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
        supabase.from("profiles").select("id, email"),
        supabase.from("user_roles").select("user_id, role"),
      ]);

      if (pErr) console.warn("Profiles query warning:", pErr);
      if (rErr) console.warn("User roles query warning:", rErr);

      const rolesMap = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
      const list: TeamMember[] = (profiles ?? [])
        .filter((p) => Boolean(p && p.id))
        .map((p) => {
          const rawRole = rolesMap.get(p.id);
          let normalizedRole: UserRole = "quality";
          if (rawRole === "admin") normalizedRole = "admin";
          else if (rawRole === "view_only") normalizedRole = "view_only";
          else normalizedRole = "quality";

          return {
            id: String(p.id),
            email: p.email ? String(p.email) : null,
            role: normalizedRole,
          };
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
      // Use valid enum value for DB RPC (quality maps to member if DB enum has not expanded)
      const dbRole = role === "admin" ? "admin" : role === "view_only" ? "view_only" : "member";
      const { data: rpcUserId, error: rpcError } = await supabase.rpc(
        "create_team_member" as never,
        {
          _email: email.trim().toLowerCase(),
          _password: password,
          _role: dbRole,
        } as never,
      );

      if (!rpcError) {
        toast.success(
          lang === "ar"
            ? `تم إنشاء حساب ${email} بنجاح كـ (${role === "admin" ? "مدير نظام" : "مسؤول جودة/مخزن"})!`
            : `Account ${email} created successfully as (${role})!`,
        );

        setEmail("");
        setPassword("");
        setRole("quality");
        setOpenAdd(false);
        void fetchMembers();
        return;
      }

      console.warn("RPC create_team_member error, falling back to auth.signUp:", rpcError);

      // 2. Fallback if RPC function is not yet deployed in DB
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
              : "Email rate limit exceeded. Please run the SQL migration for create_team_member or disable 'Confirm email' in Supabase.",
          );
          return;
        }
        throw authError;
      }

      const newUserId = authResult.user?.id;
      if (newUserId) {
        const { error: upsertErr } = await supabase.from("user_roles").upsert({
          user_id: newUserId,
          role: role,
        });
        if (upsertErr && role === "quality") {
          await supabase.from("user_roles").upsert({
            user_id: newUserId,
            role: "member" as never,
          });
        }
      }

      toast.success(
        lang === "ar"
          ? `تم إنشاء حساب ${email} بنجاح كـ (${
              role === "admin"
                ? "Admin (مدير نظام)"
                : role === "quality"
                ? "مهندس إدخال (Data Entry Engineer)"
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
    if (member.id === currentUserId) {
      toast.error(
        lang === "ar"
          ? "لا يمكنك تغيير صلاحية حسابك الحالي بنفسك"
          : "You cannot change your own admin role",
      );
      return;
    }

    try {
      let { error } = await supabase.from("user_roles").upsert({
        user_id: member.id,
        role: newRole,
      });
      if (error && newRole === "quality") {
        const fallback = await supabase.from("user_roles").upsert({
          user_id: member.id,
          role: "member" as never,
        });
        error = fallback.error;
      }
      if (error) throw error;

      toast.success(
        lang === "ar"
          ? `تم تعديل صلاحية ${member.email} إلى (${
              newRole === "admin"
                ? "Admin (مدير نظام)"
                : newRole === "quality"
                ? "مهندس إدخال (Data Entry Engineer)"
                : "Viewer / Free (مشاهد فقط)"
            })`
          : `Updated role for ${member.email} to ${newRole}`,
      );
      void fetchMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    }
  };

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-cocoa">
            <Users className="h-5 w-5 text-cocoa" />
            {lang === "ar" ? "إدارة فريق العمل والمستخدمين" : "Team & User Management"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {lang === "ar"
              ? "يمكنك كمدير نظام إنشاء حسابات لفريق العمل (مفتشي الجودة وأمناء المخازن) وتحديد صلاحياتهم."
              : "Create accounts for team inspectors and storekeepers, and manage system roles."}
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

                <div className="rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground">
                  {lang === "ar"
                    ? "💡 يُفضل التأكد من تعطيل خيار 'Confirm email' في لوحة تحكم سوبابيز حتى يعمل الحساب فوراً بكلمة المرور دون انتظار إيميل تفعيل."
                    : "💡 Disable 'Confirm email' in Supabase to allow this user to log in immediately with their password."}
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

      {/* 3-Tier Roles Legend for Admin */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 pt-1">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex items-center gap-1.5 font-bold text-xs text-amber-950 dark:text-amber-200">
            <span>⭐</span>
            <span>{lang === "ar" ? "Admin (مدير نظام)" : "Admin"}</span>
          </div>
          <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80 mt-1 leading-relaxed">
            {lang === "ar"
              ? "صلاحيات كاملة: إضافة/تعديل/حذف بيانات + التحكم في إعدادات البرنامج (الواتساب، العتبات، المخازن، إلخ)."
              : "Full permissions: add/edit/delete data + manage system settings (WhatsApp, thresholds, warehouses)."}
          </p>
        </div>

        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
          <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-950 dark:text-emerald-200">
            <span>✏️</span>
            <span>{lang === "ar" ? "مهندس إدخال (Data Entry)" : "Data Entry Engineer"}</span>
          </div>
          <p className="text-[11px] text-emerald-900/80 dark:text-emerald-200/80 mt-1 leading-relaxed">
            {lang === "ar"
              ? "يقدر يضيف ويدخل بيانات (أصناف، حركات وارد/منصرف، جرد)، لكن مايشوفش ولا يتحكمش في إعدادات البرنامج."
              : "Can enter and edit items, stock movements, and audits — cannot see or control system settings."}
          </p>
        </div>

        <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-muted/40 p-3">
          <div className="flex items-center gap-1.5 font-bold text-xs text-foreground">
            <span>👁️</span>
            <span>{lang === "ar" ? "Viewer / Free (مشاهد فقط)" : "Viewer / Free"}</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
            {lang === "ar"
              ? "حساب محدود: استعراض ومطالعة البيانات والجرد والتقارير فقط من غير أي تعديل أو إضافة أو حذف."
              : "Limited read-only account: can only view data without editing, adding, or deleting."}
          </p>
        </div>
      </div>

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
            const displayName = m?.email || (memberId ? memberId.slice(0, 8) : (lang === "ar" ? "مستخدم" : "User"));
            return (
              <div
                key={memberId || `member-${idx}`}
                className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm transition-colors hover:bg-muted/20"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                      m.role === "admin"
                        ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                        : m.role === "quality"
                        ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                        : "bg-slate-500/15 text-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {m.role === "admin" ? (
                      <ShieldCheck className="h-4 w-4" />
                    ) : (
                      <UserCheck className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <span>{displayName}</span>
                      {isSelf && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {lang === "ar" ? "أنت" : "You"}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {m.role === "admin"
                        ? lang === "ar"
                          ? "⭐ Admin — صلاحيات كاملة: إضافة/تعديل/حذف + التحكم في إعدادات البرنامج"
                          : "Full Admin: Add/Edit/Delete + system settings control"
                        : m.role === "quality"
                        ? lang === "ar"
                          ? "✏️ مهندس إدخال (Data Entry) — إضافة وتعديل وجرد (بدون إعدادات)"
                          : "Data Entry Engineer: Add/edit/audit (no settings)"
                        : lang === "ar"
                        ? "👁️ Viewer / Free — حساب محدود: استعراض ومشاهدة فقط"
                        : "Viewer / Free: Read-only access"}
                    </div>
                  </div>
                </div>

                {!isSelf ? (
                  <select
                    value={m.role}
                    onChange={(e) => void handleChangeRole(m, e.target.value as UserRole)}
                    className="h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-ring font-semibold"
                  >
                    <option value="admin">⭐ {lang === "ar" ? "Admin (مدير نظام)" : "Admin"}</option>
                    <option value="quality">✏️ {lang === "ar" ? "مهندس إدخال (Data Entry)" : "Data Entry"}</option>
                    <option value="view_only">👁️ {lang === "ar" ? "Viewer / Free (مشاهد فقط)" : "Viewer / Free"}</option>
                  </select>
                ) : (
                  <span className="rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 px-2.5 py-1 text-xs font-bold">
                    {lang === "ar" ? "حسابك الحالي (Admin)" : "Current Account (Admin)"}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
