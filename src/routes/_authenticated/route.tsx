import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data?.session?.user) {
        throw redirect({ to: "/auth" });
      }
      return { user: data.session.user };
    } catch (err: any) {
      if (err && typeof err === "object" && (err.to || err.isRedirect || err.status === 307 || err.status === 302)) {
        throw err;
      }
      throw redirect({ to: "/auth" });
    }
  },
  component: () => <Outlet />,
});
