import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  /**
   * The prefix that client-side variables must have. This is enforced both at
   * a type-level and at runtime.
   */
  clientPrefix: "VITE_",

  client: {
    VITE_APP_TITLE: z.string().min(1).optional(),
    VITE_FIREBASE_API_KEY: z.string().min(1),
    VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1),
    VITE_FIREBASE_PROJECT_ID: z.string().min(1),
    VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1),
    VITE_CONVEX_URL: z.string().url(),
    VITE_GITHUB_REPO_URL: z.string().url().optional(),
    VITE_GOOGLE_PICKER_API_KEY: z.string().min(1),
    VITE_GOOGLE_CLOUD_PROJECT_NUMBER: z.string().min(1),
  },

  /**
   * What object holds the environment variables at runtime.
   * - Browser: use `import.meta.env` directly to avoid `ReferenceError: process is not defined`
   * - Server (SSR / Server Functions): prioritize build-time `import.meta.env.VITE_*` (statically replaced by Vite)
   *   over runtime `process.env` so that Preview deployments use the correct Convex Preview URL.
   */
  runtimeEnv:
    typeof window !== "undefined"
      ? import.meta.env
      : {
          VITE_APP_TITLE:
            import.meta.env?.VITE_APP_TITLE ??
            (typeof process !== "undefined"
              ? process.env.VITE_APP_TITLE
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
          VITE_CONVEX_URL:
            import.meta.env?.VITE_CONVEX_URL ??
            (typeof process !== "undefined"
              ? process.env.VITE_CONVEX_URL
              : undefined),
          VITE_GITHUB_REPO_URL:
            import.meta.env?.VITE_GITHUB_REPO_URL ??
            (typeof process !== "undefined"
              ? process.env.VITE_GITHUB_REPO_URL
              : undefined),
          VITE_GOOGLE_PICKER_API_KEY:
            import.meta.env?.VITE_GOOGLE_PICKER_API_KEY ??
            (typeof process !== "undefined"
              ? process.env.VITE_GOOGLE_PICKER_API_KEY
              : undefined),
          VITE_GOOGLE_CLOUD_PROJECT_NUMBER:
            import.meta.env?.VITE_GOOGLE_CLOUD_PROJECT_NUMBER ??
            (typeof process !== "undefined"
              ? process.env.VITE_GOOGLE_CLOUD_PROJECT_NUMBER
              : undefined),
        },

  /**
   * By default, this library will feed the environment variables directly to
   * the Zod validator.
   *
   * This means that if you have an empty string for a value that is supposed
   * to be a number (e.g. `PORT=` in a ".env" file), Zod will incorrectly flag
   * it as a type mismatch violation. Additionally, if you have an empty string
   * for a value that is supposed to be a string with a default value (e.g.
   * `DOMAIN=` in an ".env" file), the default value will never be applied.
   *
   * In order to solve these issues, we recommend that all new projects
   * explicitly specify this option as true.
   */
  emptyStringAsUndefined: true,
});
