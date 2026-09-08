import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Shield, ShieldCheck, UserPlus, Users, RefreshCw, UserCheck } from "lucide-react";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
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

interface TeamMember {
  id: string;
  email: string | null;
  role: "admin" | "member";
}

export function TeamManagement({ currentUserId }: { currentUserId?: string }) {
  const { lang } = useI18n();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [creating, setCreating] = useState(false);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
        supabase.from("profiles").select("id, email"),
        supabase.from("user_roles").select("user_id, role"),
      ]);

      if (pErr) throw pErr;
      if (rErr) throw rErr;

      const rolesMap = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
      const list: TeamMember[] = (profiles ?? []).map((p) => ({
        id: p.id,
        email: p.email,
        role: (rolesMap.get(p.id) as "admin" | "member") || "member",
      }));

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
          : "Please provide a valid email and password with at least 6 characters"
      );
      return;
    }

    setCreating(true);
    try {
      // Use an isolated client so the active Admin session is not overwritten
      const isolatedClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });

      const { data: authResult, error: authError } = await isolatedClient.auth.signUp({
        email: email.trim(),
        password,
      });

      if (authError) {
        if (
          authError.message.toLowerCase().includes("rate limit") ||
          authError.code === "over_email_send_rate_limit"
        ) {
          toast.error(
            lang === "ar"
              ? "تنبيه: تم تجاوز حد إرسال الإيميلات المجاني. يُرجى الدخول إلى لوحة Supabase ➔ Authentication ➔ Providers ➔ Email وتعطيل 'Confirm email' ليتم إنشاء الحسابات بكلمة مرور فورية دون إرسال إيميل."
              : "Email rate limit exceeded. Please disable 'Confirm email' in Supabase Authentication settings to create accounts instantly."
          );
          return;
        }
        throw authError;
      }

      const newUserId = authResult.user?.id;
      if (newUserId && role === "admin") {
        await supabase.from("user_roles").upsert({
          user_id: newUserId,
          role: "admin",
        });
      }

      toast.success(
        lang === "ar"
          ? `تم إنشاء حساب ${email} بنجاح كـ (${role === "admin" ? "مدير نظام" : "مسؤول جودة/مخزن"})!`
          : `Account ${email} created successfully as (${role})!`
      );

      setEmail("");
      setPassword("");
      setRole("member");
      setOpenAdd(false);
      void fetchMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleRole = async (member: TeamMember) => {
    if (member.id === currentUserId) {
      toast.error(
        lang === "ar"
          ? "لا يمكنك تغيير صلاحية حسابك الحالي بنفسك"
          : "You cannot change your own admin role"
      );
      return;
    }

    const newRole = member.role === "admin" ? "member" : "admin";
    try {
      const { error } = await supabase.from("user_roles").upsert({
        user_id: member.id,
        role: newRole,
      });
      if (error) throw error;

      toast.success(
        lang === "ar"
          ? `تم تعديل صلاحية ${member.email} إلى ${newRole === "admin" ? "مدير نظام (Admin)" : "مسؤول جودة (Member)"}`
          : `Updated role for ${member.email} to ${newRole}`
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
            <DialogContent className="sm:max-w-md">
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
                    {lang === "ar" ? "كلمة المرور الأولية (6 أحرف فأكثر)" : "Initial Password (min 6)"}
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
                    onChange={(e) => setRole(e.target.value as "admin" | "member")}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="member">
                      {lang === "ar" ? "مسؤول جودة / أمين مخزن (Member)" : "QC Inspector / Storekeeper (Member)"}
                    </option>
                    <option value="admin">
                      {lang === "ar" ? "مدير نظام كامل الصلاحيات (Admin)" : "Full System Administrator (Admin)"}
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
                      ? lang === "ar" ? "جارٍ الإنشاء…" : "Creating…"
                      : lang === "ar" ? "إنشاء الحساب" : "Create Account"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="divide-y rounded-lg border">
        {members.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            {loading
              ? lang === "ar" ? "جارٍ تحميل المستخدمين…" : "Loading members…"
              : lang === "ar" ? "لا يوجد مستخدمون مسجلون بعد" : "No users found"}
          </div>
        ) : (
          members.map((m) => {
            const isSelf = m.id === currentUserId;
            const isAdminRole = m.role === "admin";
            return (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm transition-colors hover:bg-muted/20"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                      isAdminRole
                        ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                        : "bg-blue-500/15 text-blue-700 dark:text-blue-300"
                    }`}
                  >
                    {isAdminRole ? (
                      <ShieldCheck className="h-4 w-4" />
                    ) : (
                      <UserCheck className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <span>{m.email || m.id.slice(0, 8)}</span>
                      {isSelf && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {lang === "ar" ? "أنت" : "You"}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {isAdminRole
                        ? lang === "ar" ? "مدير نظام كامل (Admin)" : "System Administrator"
                        : lang === "ar" ? "مسؤول جودة / مخزن (Member)" : "QC Inspector / Storekeeper"}
                    </div>
                  </div>
                </div>

                {!isSelf && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleToggleRole(m)}
                    className="h-7 text-xs"
                  >
                    {isAdminRole
                      ? lang === "ar" ? "تحويل إلى Member" : "Demote to Member"
                      : lang === "ar" ? "ترقية إلى Admin" : "Promote to Admin"}
                  </Button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
