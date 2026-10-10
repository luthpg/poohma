import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const dirname =
  import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(dirname, "..");
const rootDir = path.resolve(backendDir, "../..");
const webDir = path.resolve(rootDir, "apps/web");
const previewEnvFile = path.resolve(webDir, "e2e/.env.e2e-preview");

// .env および .env.local をロード
const envFiles = [
  path.join(rootDir, ".env"),
  path.join(rootDir, ".env.local"),
  path.join(backendDir, ".env"),
  path.join(backendDir, ".env.local"),
  path.join(webDir, ".env"),
  path.join(webDir, ".env.local"),
];

for (const envFile of envFiles) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile, override: true });
  }
}

const previewKey = process.env.CONVEX_PREVIEW_DEPLOY_KEY;

if (!previewKey) {
  console.warn(
    "⚠️  [setup-preview] CONVEX_PREVIEW_DEPLOY_KEY is not set.\n" +
      "   Skipping Convex Preview Deployment. Falling back to default dev deployment.",
  );
  if (fs.existsSync(previewEnvFile)) {
    fs.rmSync(previewEnvFile, { force: true });
  }
  process.exit(0);
}

const pnpmExecPath = process.env.npm_execpath;
if (!pnpmExecPath) {
  throw new Error("[setup-preview] npm_execpath is missing in environment");
}

const isClean = process.argv.includes("--clean");
const previewFlag = isClean
  ? "--preview-create=e2e-test"
  : "--preview-name=e2e-test";

console.log(
  `🚀 [setup-preview] Deploying to Convex Preview (${isClean ? "recreate" : "reuse"})...`,
);

try {
  // 1. Convex Preview デプロイ & URL書き出し (backendDir 相対パスで安全に実行)
  execFileSync(
    process.execPath,
    [
      pnpmExecPath,
      "exec",
      "convex",
      "deploy",
      previewFlag,
      "--typecheck=disable",
      "--codegen=disable",
      "--cmd=pnpm exec tsx scripts/write-preview-env.ts",
    ],
    {
      cwd: backendDir,
      env: {
        ...process.env,
        CONVEX_DEPLOY_KEY: previewKey,
      },
      stdio: "inherit",
    },
  );

  if (!fs.existsSync(previewEnvFile)) {
    throw new Error(
      `[setup-preview] Failed: ${previewEnvFile} was not created.`,
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
      `[setup-preview] Failed to parse VITE_CONVEX_URL from ${previewEnvFile}`,
    );
  }
  const previewUrl = new URL(rawUrl);
  const deploymentName = previewUrl.hostname.split(".")[0];
  if (!deploymentName) {
    throw new Error(
      `[setup-preview] Failed to extract deployment name from ${previewUrl.hostname}`,
    );
  }

  // 3. .env.e2e.local が存在する場合、Preview Deployment に環境変数を設定
  const e2eLocalCandidates = [
    path.join(backendDir, ".env.e2e.local"),
    path.join(webDir, ".env.e2e.local"),
    path.join(rootDir, ".env.e2e.local"),
  ];
  const e2eLocalEnvPath = e2eLocalCandidates.find((p) => fs.existsSync(p));

  if (e2eLocalEnvPath) {
    console.log(
      `⚙️  [setup-preview] Applying server environment variables to preview deployment "${deploymentName}" from ${e2eLocalEnvPath}...`,
    );
    execFileSync(
      process.execPath,
      [
        pnpmExecPath,
        "exec",
        "convex",
        "env",
        "set",
        "--force",
        "--from-file",
        e2eLocalEnvPath,
        "--deployment",
        deploymentName,
      ],
      {
        cwd: backendDir,
        env: {
          ...process.env,
          CONVEX_DEPLOY_KEY: previewKey,
        },
        stdio: "inherit",
      },
    );
  } else {
    console.log(
      "ℹ️  [setup-preview] No .env.e2e.local found. Using existing Preview deployment environment variables.",
    );
  }

  // 4. E2E Preview 環境では常に外部メール送信を無効化（Resend クォータ保護）
  console.log(
    `✉️  [setup-preview] Ensuring DISABLE_EMAIL_DELIVERY=true on "${deploymentName}"...`,
  );
  execFileSync(
    process.execPath,
    [
      pnpmExecPath,
      "exec",
      "convex",
      "env",
      "set",
      "DISABLE_EMAIL_DELIVERY",
      "true",
      "--deployment",
      deploymentName,
    ],
    {
      cwd: backendDir,
      env: {
        ...process.env,
        CONVEX_DEPLOY_KEY: previewKey,
      },
      stdio: "inherit",
    },
  );

  console.log(
    `✅ [setup-preview] Convex Preview environment "${deploymentName}" is ready for E2E tests.`,
  );
} catch (error) {
  console.error(
    "❌ [setup-preview] Failed to setup Convex Preview deployment.",
  );
  throw error;
}
