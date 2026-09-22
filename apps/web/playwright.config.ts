import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

const dirname =
  import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(dirname, "../..");

// .env.local と .env をロード（.env.local を優先、さらに e2e/.env.e2e-preview で上書き）
const envFiles = [
  path.join(rootDir, ".env"),
  path.join(rootDir, ".env.local"),
  path.join(dirname, ".env"),
  path.join(dirname, ".env.local"),
  path.join(dirname, "e2e/.env.e2e-preview"),
];
for (const envFile of envFiles) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile, override: true });
  }
}

const STORAGE_STATE = path.join(dirname, "e2e/.auth/e2e-user.json");
const defaultPort = process.env.PORT ?? "3100";
const configuredBaseURL =
  process.env.E2E_BASE_URL ?? process.env.E2E_STAGING_URL;
const baseURL = configuredBaseURL ?? `https://localhost:${defaultPort}`;
const baseHostname = new URL(baseURL).hostname;
const ignoreHTTPSErrors = ["localhost", "127.0.0.1", "[::1]"].includes(
  baseHostname,
);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL,
    ignoreHTTPSErrors,
    trace: "on-first-retry",
  },
  webServer:
    process.env.CI && configuredBaseURL
      ? undefined
      : {
          command: `pnpm dev --port ${defaultPort}`,
          url: `https://localhost:${defaultPort}`,
          ignoreHTTPSErrors: true,
          reuseExistingServer: false,
          timeout: 120 * 1000,
          env: {
            ...process.env,
            PORT: defaultPort,
          },
        },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      teardown: "teardown",
    },
    {
      name: "teardown",
      testMatch: /auth\.teardown\.ts/,
    },
    {
      name: "public",
      testMatch: /.*public.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "authenticated",
      testIgnore: [
        /.*public.*\.spec\.ts/,
        /auth\.setup\.ts/,
        /auth\.teardown\.ts/,
        /logout\.spec\.ts/,
      ],
      use: {
        ...devices["Desktop Chrome"],
        storageState: STORAGE_STATE,
      },
      dependencies: ["setup"],
      workers: 1,
    },
    {
      name: "logout",
      testMatch: /logout\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: STORAGE_STATE,
      },
      dependencies: ["authenticated"],
    },
  ],
});
