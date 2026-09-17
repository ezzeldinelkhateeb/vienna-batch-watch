import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type UserRole = "admin" | "quality" | "view_only" | "data_entry" | "viewer";

export interface AuthState {
  session: Session | null;
  user: Session["user"] | null;
  role: UserRole;
  isAdmin: boolean;
  isQuality: boolean;
  isDataEntry: boolean;
  isViewOnly: boolean;
  isViewer: boolean;
  canEditItems: boolean;
  canDeleteItems: boolean;
  canManageTeam: boolean;
  canAccessSettings: boolean;
  loading: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole>("quality");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isQuality, setIsQuality] = useState(false);
  const [isDataEntry, setIsDataEntry] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [isViewer, setIsViewer] = useState(false);
  const [canEditItems, setCanEditItems] = useState(false);
  const [canDeleteItems, setCanDeleteItems] = useState(false);
  const [canManageTeam, setCanManageTeam] = useState(false);
  const [canAccessSettings, setCanAccessSettings] = useState(false);
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

        const rolesList = (data ?? []).map((r) => r.role as string);
        let resolvedRole: UserRole = "quality";

        if (rolesList.includes("admin")) {
          resolvedRole = "admin";
        } else if (rolesList.includes("view_only") || rolesList.includes("viewer")) {
          resolvedRole = "view_only";
        } else {
          resolvedRole = "quality"; // default for data entry / member
        }

        const isAdm = resolvedRole === "admin";
        const isEntry = resolvedRole === "quality" || resolvedRole === "data_entry";
        const isView = resolvedRole === "view_only" || resolvedRole === "viewer";

        setRole(resolvedRole);
        setIsAdmin(isAdm);
        setIsQuality(isEntry);
        setIsDataEntry(isEntry);
        setIsViewOnly(isView);
        setIsViewer(isView);
        setCanEditItems(isAdm || isEntry);
        setCanDeleteItems(isAdm);
        setCanManageTeam(isAdm);
        setCanAccessSettings(isAdm);
      } else {
        setRole("quality");
        setIsAdmin(false);
        setIsQuality(false);
        setIsDataEntry(false);
        setIsViewOnly(false);
        setIsViewer(false);
        setCanEditItems(false);
        setCanDeleteItems(false);
        setCanManageTeam(false);
        setCanAccessSettings(false);
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
    isDataEntry,
    isViewOnly,
    isViewer,
    canEditItems,
    canDeleteItems,
    canManageTeam,
    canAccessSettings,
    loading,
    isLoading: loading,
    signOut,
  };
}
