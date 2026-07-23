import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import {
  useEffect,
  type ReactNode,
} from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/useAuth";
import {
  ThemeProvider,
  THEME_STORAGE_KEY,
} from "@/components/ThemeProvider";

const themeInitializationScript = `
(function () {
  try {
    var storageKey = ${JSON.stringify(THEME_STORAGE_KEY)};
    var storedTheme = localStorage.getItem(storageKey);
    var theme =
      storedTheme === "light" ||
      storedTheme === "dark" ||
      storedTheme === "system"
        ? storedTheme
        : "system";

    var resolvedTheme =
      theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;

    var root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
    root.style.colorScheme = resolvedTheme;
  } catch (_) {
    document.documentElement.classList.add("light");
    document.documentElement.style.colorScheme = "light";
  }
})();
`;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">
          404
        </h1>
        <h2 className="mt-4 text-xl font-semibold">
          Halaman tidak ditemukan
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Halaman yang Anda cari tidak tersedia
          atau sudah dipindahkan.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    reportLovableError(error, {
      boundary:
        "tanstack_root_error_component",
    });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">
          Terjadi kesalahan
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Halaman tidak dapat dimuat. Silakan
          coba lagi.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route =
  createRootRouteWithContext<{
    queryClient: QueryClient;
  }>()({
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        {
          name: "viewport",
          content:
            "width=device-width, initial-scale=1",
        },
        {
          name: "color-scheme",
          content: "light dark",
        },
        {
          title: "Lovin Milk Dashboard",
        },
        {
          name: "description",
          content:
            "Dashboard penjualan & keuangan Lovin Milk Eatery & Family Playzone.",
        },
        {
          property: "og:title",
          content: "Lovin Milk Dashboard",
        },
        {
          property: "og:description",
          content:
            "Dashboard penjualan & keuangan Lovin Milk.",
        },
        {
          property: "og:type",
          content: "website",
        },
        {
          name: "twitter:card",
          content: "summary_large_image",
        },
      ],
      links: [
        {
          rel: "stylesheet",
          href: appCss,
        },
        {
          rel: "icon",
          href: "/favicon.ico",
          type: "image/x-icon",
        },
        {
          rel: "preconnect",
          href:
            "https://fonts.googleapis.com",
        },
        {
          rel: "preconnect",
          href:
            "https://fonts.gstatic.com",
          crossOrigin: "anonymous",
        },
        {
          rel: "stylesheet",
          href:
            "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap",
        },
      ],
    }),
    shellComponent: RootShell,
    component: RootComponent,
    notFoundComponent: NotFoundComponent,
    errorComponent: ErrorComponent,
  });

function RootShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html:
              themeInitializationScript,
          }}
        />
      </head>

      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } =
    Route.useRouteContext();

  return (
    <QueryClientProvider
      client={queryClient}
    >
      <ThemeProvider
        defaultTheme="system"
        storageKey={
          THEME_STORAGE_KEY
        }
      >
        <AuthProvider>
          <Outlet />
          <Toaster
            position="top-right"
            richColors
          />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}