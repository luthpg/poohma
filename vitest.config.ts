import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    server: {
      deps: {
        inline: ["convex-test"],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/**",
        "tests/**",
        "src/components/ui/**",
        "src/routes/**",
        "src/utils/schemas.ts",
        "convex/_generated/**",
        "convex/schema.ts",
        "routeTree.gen.ts",
        "**/*.d.ts",
        "**/*.config.ts",
      ],
      thresholds: {
        statements: 50,
        branches: 40,
        functions: 50,
        lines: 50,
        "src/lib/crypto.ts": {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        "convex/rls.ts": {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        "src/utils/url-safety.ts": {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
      },
    },
  },
});
