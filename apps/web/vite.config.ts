import fs from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import viteReact from "@vitejs/plugin-react";
import dotenv from "dotenv";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  Object.assign(process.env, env);

  // E2E テスト用オーバーライド環境変数（Preview / Local）の反映
  const e2eEnvs = [
    path.resolve(process.cwd(), "e2e/.env.e2e-preview"),
    path.resolve(process.cwd(), "e2e/.env.e2e-local"),
  ];
  for (const envFile of e2eEnvs) {
    if (fs.existsSync(envFile)) {
      dotenv.config({ path: envFile, override: true });
    }
  }

  // ビルド時に必須環境変数（client / server）の存在を検証
  await import("./src/env/client.ts");
  await import("./src/env/server.ts");

  return {
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [
      devtools(),
      nitro({
        preset: "vercel",
      }),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
      basicSsl(),
    ],
    server: {
      proxy: {
        "/__/auth": {
          target: `https://${env.VITE_FIREBASE_AUTH_DOMAIN}`,
          changeOrigin: true,
        },
      },
    },
    ssr: {
      external: ["papaparse"],
    },
  };
});
