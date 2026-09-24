import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const dirname =
  import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(dirname, "..");
const rootDir = path.resolve(webDir, "../..");

// .env および .env.local をロード
const envFiles = [
  path.join(rootDir, ".env"),
  path.join(rootDir, ".env.local"),
  path.join(webDir, ".env"),
  path.join(webDir, ".env.local"),
];

for (const envFile of envFiles) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile, override: true });
  }
}

const previewKey = process.env.CONVEX_PREVIEW_DEPLOY_KEY;
const previewEnvFile = path.join(webDir, "e2e/.env.e2e-preview");

if (!previewKey) {
  console.warn(
    "⚠️  [setup-e2e-preview] CONVEX_PREVIEW_DEPLOY_KEY is not set.\n" +
      "   Skipping Convex Preview Deployment. Falling back to default dev deployment.",
  );
  if (fs.existsSync(previewEnvFile)) {
    fs.rmSync(previewEnvFile, { force: true });
  }
  process.exit(0);
}

const isClean = process.argv.includes("--clean");
const previewFlag = isClean
  ? '--preview-create="e2e-test"'
  : '--preview-name="e2e-test"';

console.log(
  `🚀 [setup-e2e-preview] Deploying to Convex Preview (${isClean ? "recreate" : "reuse"})...`,
);

try {
  // 1. Convex Preview デプロイ & URL書き出し
  execSync(
    `pnpm exec convex deploy ${previewFlag} --typecheck=disable --codegen=disable --cmd="pnpm exec tsx scripts/write-e2e-preview-env.ts"`,
    {
      cwd: webDir,
      env: {
        ...process.env,
        CONVEX_DEPLOY_KEY: previewKey,
      },
      stdio: "inherit",
    },
  );

  if (!fs.existsSync(previewEnvFile)) {
    throw new Error(
      `[setup-e2e-preview] Failed: ${previewEnvFile} was not created.`,
    );
  }

  // 2. 生成された preview URL から deployment 名（サブドメイン）を抽出
  const previewEnvContent = fs.readFileSync(previewEnvFile, "utf-8");
  const urlMatch = previewEnvContent.match(
    /VITE_CONVEX_URL=(https:\/\/[^\s]+)/,
  );
  const rawUrl = urlMatch?.[1];
  if (!rawUrl) {
    throw new Error(
      `[setup-e2e-preview] Failed to parse VITE_CONVEX_URL from ${previewEnvFile}`,
    );
  }
  const previewUrl = new URL(rawUrl);
  const deploymentName = previewUrl.hostname.split(".")[0];

  // 3. .env.e2e.local が存在する場合、Preview Deployment に環境変数を設定
  const e2eLocalEnvPath = path.join(webDir, ".env.e2e.local");
  if (fs.existsSync(e2eLocalEnvPath)) {
    console.log(
      `⚙️  [setup-e2e-preview] Applying server environment variables to preview deployment "${deploymentName}"...`,
    );
    execSync(
      `pnpm exec convex env set --force --from-file .env.e2e.local --deployment ${deploymentName}`,
      {
        cwd: webDir,
        env: {
          ...process.env,
          CONVEX_DEPLOY_KEY: previewKey,
        },
        stdio: "inherit",
      },
    );
  } else {
    console.log(
      "ℹ️  [setup-e2e-preview] No .env.e2e.local found. Using existing Preview deployment environment variables.",
    );
  }

  // 4. E2E Preview 環境では常に外部メール送信を無効化（Resend クォータ保護）
  console.log(
    `✉️  [setup-e2e-preview] Ensuring DISABLE_EMAIL_DELIVERY=true on "${deploymentName}"...`,
  );
  execSync(
    `pnpm exec convex env set DISABLE_EMAIL_DELIVERY true --deployment ${deploymentName}`,
    {
      cwd: webDir,
      env: {
        ...process.env,
        CONVEX_DEPLOY_KEY: previewKey,
      },
      stdio: "inherit",
    },
  );

  console.log(
    `✅ [setup-e2e-preview] Convex Preview environment "${deploymentName}" is ready for E2E tests.`,
  );
} catch (error) {
  console.error(
    "❌ [setup-e2e-preview] Failed to setup Convex Preview deployment.",
  );
  throw error;
}
