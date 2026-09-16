import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type UserRole = "admin" | "quality" | "view_only";

export interface AuthState {
  session: Session | null;
  user: Session["user"] | null;
  role: UserRole;
  isAdmin: boolean;
  isQuality: boolean;
  isViewOnly: boolean;
  canEditItems: boolean;
  canDeleteItems: boolean;
  canManageTeam: boolean;
  loading: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole>("quality");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isQuality, setIsQuality] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [canEditItems, setCanEditItems] = useState(false);
  const [canDeleteItems, setCanDeleteItems] = useState(false);
  const [canManageTeam, setCanManageTeam] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async (next: Session | null) => {
      if (!active) return;
      setSession(next);
      if (next?.user) {
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", next.user.id);
        if (!active) return;

        const rolesList = (data ?? []).map((r) => r.role);
        let resolvedRole: UserRole = "quality";

        if (rolesList.includes("admin")) {
          resolvedRole = "admin";
        } else if (rolesList.includes("view_only")) {
          resolvedRole = "view_only";
        } else {
          resolvedRole = "quality"; // default for member / team
        }

        setRole(resolvedRole);
        setIsAdmin(resolvedRole === "admin");
        setIsQuality(resolvedRole === "quality");
        setIsViewOnly(resolvedRole === "view_only");
        setCanEditItems(resolvedRole === "admin" || resolvedRole === "quality");
        setCanDeleteItems(resolvedRole === "admin");
        setCanManageTeam(resolvedRole === "admin");
      } else {
        setRole("quality");
        setIsAdmin(false);
        setIsQuality(false);
        setIsViewOnly(false);
        setCanEditItems(false);
        setCanDeleteItems(false);
        setCanManageTeam(false);
      }
      if (active) setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => load(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void load(next);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return {
    session,
    user: session?.user ?? null,
    role,
    isAdmin,
    isQuality,
    isViewOnly,
    canEditItems,
    canDeleteItems,
    canManageTeam,
    loading,
    isLoading: loading,
    signOut,
  };
}
