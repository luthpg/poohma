import { resolve } from "node:path";
import type { Config } from "microcms-typegen";

// 注入済みの環境変数を優先し、ローカル設定から順に読み込む
for (const envFile of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(resolve(import.meta.dirname, "../..", envFile));
  } catch {
    // CI等では環境変数から直接注入されるため、ファイル不在時は無視
  }
}

export default {
  services: {
    main: {
      serviceDomain: process.env.MICROCMS_SERVICE_DOMAIN,
      apiKey: process.env.MICROCMS_API_KEY,
      output: "./src/types/microcms.d.ts",
      typeRules: {
        trustReadFieldConstraints: true,
      },
    },
  },
} satisfies Config;
