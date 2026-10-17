import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_FIREBASE_API_KEY: z.string().min(1),
    VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1),
    VITE_FIREBASE_PROJECT_ID: z.string().min(1),
    VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1).optional(),
    VITE_CONVEX_URL: z.url(),
    VITE_CONVEX_SITE_URL: z.string().url().optional(),
    VITE_GITHUB_REPO_URL: z
      .string()
      .url()
      .default("https://github.com/luthpg/poohma"),
    VITE_SITE_URL: z.url().default("https://poohma.ciderlabs.link"),
  },
  runtimeEnv: import.meta.env,
});
