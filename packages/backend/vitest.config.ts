import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30000,
    include: ["tests/**/*.spec.ts", "tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/**",
        "tests/**",
        "convex/_generated/**",
        "convex/schema.ts",
        "**/*.d.ts",
        "**/*.config.ts",
      ],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
        "convex/rls.ts": {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        "convex/customBuilders.ts": {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        "convex/users.ts": {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
      },
    },
  },
});
