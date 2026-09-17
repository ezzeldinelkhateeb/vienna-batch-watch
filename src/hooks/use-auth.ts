import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_PRIMARY_ADMIN_EMAIL, DEFAULT_PRIMARY_ADMIN_ID } from "./use-settings";

export type UserRole = "admin" | "quality" | "view_only" | "data_entry" | "viewer";

export interface AuthState {
  session: Session | null;
  user: Session["user"] | null;
  role: UserRole;
  isAdmin: boolean;
  isPrimaryAdmin: boolean;
  primaryAdminEmail: string;
  isSuspended: boolean;
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
  const [isPrimaryAdmin, setIsPrimaryAdmin] = useState(false);
  const [primaryAdminEmail, setPrimaryAdminEmail] = useState(DEFAULT_PRIMARY_ADMIN_EMAIL);
  const [isSuspended, setIsSuspended] = useState(false);
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
        try {
          const [{ data: rolesData }, { data: settingsData }] = await Promise.all([
            supabase.from("user_roles").select("role").eq("user_id", next.user.id),
            supabase.from("app_settings").select("feature_flags").eq("id", true).maybeSingle(),
          ]);

          if (!active) return;

          const flags = (settingsData?.feature_flags && typeof settingsData.feature_flags === "object"
            ? settingsData.feature_flags
            : {}) as Record<string, any>;

          const pEmail = (flags.primary_admin_email || DEFAULT_PRIMARY_ADMIN_EMAIL).toLowerCase();
          const pId = flags.primary_admin_id || DEFAULT_PRIMARY_ADMIN_ID;

          const isSuper = Boolean(
            (next.user.id && next.user.id === pId) ||
            (next.user.email && next.user.email.toLowerCase() === pEmail)
          );

          const suspendedList = Array.isArray(flags.suspended_user_ids) ? flags.suspended_user_ids : [];
          const userIsSuspended = !isSuper && suspendedList.includes(next.user.id);

          const viewOnlyList = Array.isArray(flags.view_only_user_ids) ? flags.view_only_user_ids : [];
          const userIsViewOnly = viewOnlyList.includes(next.user.id);

          const rolesList = (rolesData ?? []).map((r) => r.role as string);
          let resolvedRole: UserRole = "quality";

          if (isSuper || rolesList.includes("admin")) {
            resolvedRole = "admin";
          } else if (userIsViewOnly || rolesList.includes("view_only") || rolesList.includes("viewer")) {
            resolvedRole = "view_only";
          } else {
            resolvedRole = "quality"; // default for data entry / member
          }

          const isAdm = resolvedRole === "admin";
          const isEntry = resolvedRole === "quality" || resolvedRole === "data_entry";
          const isView = resolvedRole === "view_only" || resolvedRole === "viewer";

          setRole(resolvedRole);
          setIsAdmin(isAdm);
          setIsPrimaryAdmin(isSuper);
          setPrimaryAdminEmail(pEmail);
          setIsSuspended(userIsSuspended);
          setIsQuality(isEntry);
          setIsDataEntry(isEntry);
          setIsViewOnly(isView);
          setIsViewer(isView);
          setCanEditItems(!userIsSuspended && (isAdm || isEntry));
          setCanDeleteItems(!userIsSuspended && isAdm);
          setCanManageTeam(!userIsSuspended && isAdm);
          setCanAccessSettings(!userIsSuspended && isAdm);
        } catch (e) {
          console.error("[useAuth] Failed to load auth details:", e);
        }
      } else {
        setRole("quality");
        setIsAdmin(false);
        setIsPrimaryAdmin(false);
        setPrimaryAdminEmail(DEFAULT_PRIMARY_ADMIN_EMAIL);
        setIsSuspended(false);
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
    isPrimaryAdmin,
    primaryAdminEmail,
    isSuspended,
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
