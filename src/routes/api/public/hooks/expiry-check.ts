import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { runExpiryCheckEngine } from "@/lib/whatsapp.functions";

export const Route = createFileRoute("/api/public/hooks/expiry-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        try {
          const summary = await runExpiryCheckEngine();
          return new Response(JSON.stringify({ success: true, ...summary }), {
            headers: { "content-type": "application/json" },
          });
        } catch (error) {
          console.error("[expiry-check]", error);
          return new Response(
            JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "unknown",
            }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});

