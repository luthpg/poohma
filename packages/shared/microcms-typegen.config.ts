import { resolve } from "node:path";
import type { Config } from "microcms-typegen";

try {
  process.loadEnvFile(resolve(import.meta.dirname, ".env"));
} catch {
  // CI等では環境変数から直接注入されるため、ファイル不在時は無視
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
