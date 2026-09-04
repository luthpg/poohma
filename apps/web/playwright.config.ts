import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

const dirname =
	import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(dirname, "../..");

// .env.local と .env をロード（.env.local を優先）
const envFiles = [
	path.join(rootDir, ".env"),
	path.join(rootDir, ".env.local"),
	path.join(dirname, ".env"),
	path.join(dirname, ".env.local"),
];
for (const envFile of envFiles) {
	if (fs.existsSync(envFile)) {
		dotenv.config({ path: envFile, override: true });
	}
}

const STORAGE_STATE = path.join(dirname, "e2e/.auth/e2e-user.json");

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 2 : undefined,
	reporter: process.env.CI ? "github" : "html",
	use: {
		baseURL: process.env.E2E_BASE_URL ?? "https://localhost:3000",
		ignoreHTTPSErrors: true,
		trace: "on-first-retry",
	},
	webServer:
		process.env.CI && process.env.E2E_BASE_URL
			? undefined
			: {
					command: "pnpm dev",
					url: "https://localhost:3000",
					ignoreHTTPSErrors: true,
					reuseExistingServer: !process.env.CI,
					timeout: 120 * 1000,
				},
	projects: [
		{
			name: "setup",
			testMatch: /auth\.setup\.ts/,
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
			testIgnore: [/.*public.*\.spec\.ts/, /auth\.setup\.ts/],
			use: {
				...devices["Desktop Chrome"],
				storageState: STORAGE_STATE,
			},
			dependencies: ["setup"],
		},
	],
});
