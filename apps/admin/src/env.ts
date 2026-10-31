import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    SERVER_URL: z.string().url().optional(),
  },

  clientPrefix: "VITE_",

  client: {
    VITE_APP_TITLE: z.string().min(1).default("PoohMa Admin Console"),
    VITE_CONVEX_URL: z.url().optional(),
    VITE_FIREBASE_API_KEY: z.string().min(1).optional(),
    VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1).optional(),
    VITE_FIREBASE_PROJECT_ID: z.string().min(1).optional(),
    VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1).optional(),
    VITE_CONVEX_TEAM_ACCESS_TOKEN: z.string().min(1).optional(),
  },

  runtimeEnv:
    typeof window !== "undefined"
      ? import.meta.env
      : {
          SERVER_URL:
            typeof process !== "undefined" ? process.env.SERVER_URL : undefined,
          VITE_APP_TITLE:
            import.meta.env?.VITE_APP_TITLE ??
            (typeof process !== "undefined"
              ? process.env.VITE_APP_TITLE
              : undefined),
          VITE_CONVEX_URL:
            import.meta.env?.VITE_CONVEX_URL ??
            (typeof process !== "undefined"
              ? process.env.VITE_CONVEX_URL
              : undefined),
          VITE_FIREBASE_API_KEY:
            import.meta.env?.VITE_FIREBASE_API_KEY ??
            (typeof process !== "undefined"
              ? process.env.VITE_FIREBASE_API_KEY
              : undefined),
          VITE_FIREBASE_AUTH_DOMAIN:
            import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN ??
            (typeof process !== "undefined"
              ? process.env.VITE_FIREBASE_AUTH_DOMAIN
              : undefined),
          VITE_FIREBASE_PROJECT_ID:
            import.meta.env?.VITE_FIREBASE_PROJECT_ID ??
            (typeof process !== "undefined"
              ? process.env.VITE_FIREBASE_PROJECT_ID
              : undefined),
          VITE_FIREBASE_STORAGE_BUCKET:
            import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET ??
            (typeof process !== "undefined"
              ? process.env.VITE_FIREBASE_STORAGE_BUCKET
              : undefined),
          VITE_CONVEX_TEAM_ACCESS_TOKEN:
            import.meta.env?.VITE_CONVEX_TEAM_ACCESS_TOKEN ??
            (typeof process !== "undefined"
              ? process.env.VITE_CONVEX_TEAM_ACCESS_TOKEN
              : undefined),
        },

  emptyStringAsUndefined: true,
});
