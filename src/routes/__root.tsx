import { TanStackDevtools } from "@tanstack/react-devtools";
import {
  type QueryClient,
  QueryClientProvider,
  queryOptions,
} from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { env } from "@/env";
import { useConvexFirebaseAuth } from "@/hooks/useConvexFirebaseAuth";
import { getAuthUser } from "@/services/auth.functions";
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource/geist-sans/700.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "@fontsource/geist-mono/600.css";
import "@fontsource/geist-mono/700.css";
import { PasscodeProvider } from "@/components/PasscodeProvider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import appCss from "@/styles.css?url";

export interface RouterContext {
  queryClient: QueryClient;
}

const convex = new ConvexReactClient(env.VITE_CONVEX_URL as string);

export const authUserQueryOptions = queryOptions({
  queryKey: ["authUser"],
  queryFn: () => getAuthUser(),
  staleTime: 1000 * 60 * 5, // 5 minutes
  gcTime: 1000 * 60 * 30, // 10 minutes
});

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { title: "PoohMa — 家族で使えるアカウント管理" },
      {
        name: "description",
        content:
          "PoohMaは家族でアカウント情報を安全に共有・管理できるWebアプリです。暗号化で大切なパスワードヒントを守ります。",
      },
      // OGP
      { property: "og:type", content: "website" },
      {
        property: "og:title",
        content: "PoohMa — 家族で使えるアカウント管理",
      },
      {
        property: "og:description",
        content:
          "家族でアカウント情報を安全に共有・管理。パスワードのヒントを暗号化して安全に管理しよう！",
      },
      { property: "og:image", content: "/android-chrome-512x512.png" },
      { property: "og:site_name", content: "PoohMa" },
      { property: "og:locale", content: "ja_JP" },
      // Twitter Card
      { name: "twitter:card", content: "summary" },
      {
        name: "twitter:title",
        content: "PoohMa — 家族で使えるアカウント管理",
      },
      {
        name: "twitter:description",
        content:
          "家族でアカウント情報を安全に共有・管理。E2E暗号化対応のパスワードマネージャー。",
      },
      { name: "twitter:image", content: "/android-chrome-512x512.png" },
      // PWA / Mobile
      { name: "theme-color", content: "#f97316" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "default",
      },
      { name: "apple-mobile-web-app-title", content: "PoohMa" },
      { name: "format-detection", content: "telephone=no" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      {
        rel: "icon",
        href: "/icon-32x32.png",
        type: "image/png",
        sizes: "32x32",
      },
      {
        rel: "icon",
        href: "/icon-192x192.png",
        type: "image/png",
        sizes: "192x192",
      },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.json" },
    ],
  }),

  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.fetchQuery(authUserQueryOptions);
    return { user };
  },

  errorComponent: (props) => {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <h1 className="mb-4 text-[32px] font-semibold tracking-geist-hero text-red-500">
          Error
        </h1>
        <p className="mb-8 text-[16px] text-muted-foreground">
          {props.error instanceof Error
            ? props.error.message
            : "予期せぬエラーが発生しました。"}
        </p>
        <button
          type="button"
          onClick={() => {
            window.location.href = "/";
          }}
          className="rounded-md bg-foreground px-6 py-2 text-[14px] font-medium text-background shadow-border transition hover:bg-gray-800"
        >
          トップページへ戻る
        </button>
      </div>
    );
  },
  notFoundComponent: () => {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <h1 className="mb-4 text-[32px] font-semibold tracking-geist-hero text-foreground">
          404 Not Found
        </h1>
        <p className="mb-8 text-[16px] text-muted-foreground">
          お探しのページは見つかりませんでした。
        </p>
        <button
          type="button"
          onClick={() => {
            window.location.href = "/";
          }}
          className="rounded-md bg-foreground px-6 py-2 text-[14px] font-medium text-background shadow-border transition hover:bg-gray-800"
        >
          トップページへ戻る
        </button>
      </div>
    );
  },
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ConvexProviderWithAuth client={convex} useAuth={useConvexFirebaseAuth}>
          <QueryClientProvider client={Route.useRouteContext().queryClient}>
            <ThemeProvider defaultTheme="system" storageKey="theme">
              <PasscodeProvider>
                <div className="min-h-screen bg-background text-foreground">
                  {children}
                  <TanStackDevtools
                    config={{
                      position: "bottom-right",
                    }}
                    plugins={[
                      {
                        name: "Tanstack Router",
                        render: <TanStackRouterDevtoolsPanel />,
                      },
                    ]}
                  />
                  <Toaster />
                </div>
              </PasscodeProvider>
            </ThemeProvider>
          </QueryClientProvider>
        </ConvexProviderWithAuth>
        <Scripts />
      </body>
    </html>
  );
}
