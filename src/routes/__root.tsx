import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { I18nProvider } from "../lib/i18n";
import { Toaster } from "../components/ui/sonner";
import { useSettings } from "../hooks/use-settings";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error("[TanStack Root ErrorComponent]:", error);
  const router = useRouter();
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  const handleRefresh = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  const handleGoHome = () => {
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground" dir="rtl">
      <div className="w-full max-w-md rounded-2xl border border-border/80 bg-card p-6 text-center shadow-lg">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600">
          <span className="text-2xl">⚠️</span>
        </div>

        <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
          تعذر تحميل هذه الصفحة مؤقتاً
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
          حدث خطأ غير متوقع أثناء معالجة البيانات. بياناتك وجلستك محفوظة بأمان، ويمكنك إعادة المحاولة أو العودة للرئيسية فوراً دون الحاجة لمسح الكاش.
        </p>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-xs sm:text-sm font-semibold text-brand-foreground shadow-xs transition-all hover:bg-brand/90"
          >
            إعادة المحاولة / Try again
          </button>
          <button
            type="button"
            onClick={handleGoHome}
            className="inline-flex items-center justify-center rounded-lg border border-input bg-card px-4 py-2 text-xs sm:text-sm font-semibold text-cocoa transition-all hover:bg-accent"
          >
            الرئيسية / Home
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center justify-center rounded-lg border border-input bg-card px-4 py-2 text-xs sm:text-sm font-semibold text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
          >
            تحديث / Refresh
          </button>
        </div>

        <div className="mt-4 pt-3 border-t border-border/60">
          <button
            type="button"
            onClick={() => setShowDetails((prev) => !prev)}
            className="text-[11px] text-muted-foreground hover:text-foreground underline"
          >
            {showDetails ? "إخفاء التفاصيل التقنية" : "عرض تفاصيل الخطأ الفنية"}
          </button>

          {showDetails && (
            <div className="mt-2 text-start rounded-lg bg-muted/60 p-3 font-mono text-[11px] text-destructive border border-border/80 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto" dir="ltr">
              <div className="font-bold">{error?.message || "Unknown error"}</div>
              {error?.stack && <div className="mt-1 text-[10px] text-muted-foreground">{error.stack}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
      },
      { name: "author", content: "Vienna — High Quality Chocolate" },
      { name: "theme-color", content: "#5c2c16" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Vienna QC" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Great+Vibes&family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap",
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.json" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function DynamicBrandMeta() {
  const settings = useSettings();

  useEffect(() => {
    if (!settings.data) return;
    const { factory_name, system_tagline, app_logo_url, app_icon } = settings.data;

    if (factory_name) {
      document.title = `${factory_name}${system_tagline ? ` — ${system_tagline}` : ""}`;
    }

    let faviconLink = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!faviconLink) {
      faviconLink = document.createElement("link");
      faviconLink.rel = "icon";
      document.head.appendChild(faviconLink);
    }

    if (app_logo_url) {
      faviconLink.href = app_logo_url;
      faviconLink.type = "image/png";
    } else if (app_icon) {
      faviconLink.href = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>${encodeURIComponent(app_icon)}</text></svg>`;
      faviconLink.type = "image/svg+xml";
    }
  }, [settings.data]);

  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <DynamicBrandMeta />
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <Toaster position="top-center" richColors />
      </I18nProvider>
    </QueryClientProvider>
  );
}
