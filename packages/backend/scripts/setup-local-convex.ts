import { execFileSync, execSync, type StdioOptions } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";

const dirname =
  import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(dirname, "..");
const rootDir = path.resolve(backendDir, "../..");
const webDir = path.resolve(rootDir, "apps/web");
const localEnvFile = path.resolve(webDir, "e2e/.env.e2e-local");
const composeFile = path.resolve(backendDir, "docker-compose.local.yml");

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

function runCommand(
  cmd: string,
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
) {
  try {
    return execSync(cmd, {
      cwd: options.cwd ?? backendDir,
      env: { ...process.env, ...options.env },
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error: unknown) {
    const execError = error as { stderr?: Buffer | string; message?: string };
    const stderr =
      execError.stderr?.toString() || execError.message || String(error);
    throw new Error(`Command failed: ${cmd}\n${stderr}`);
  }
}

async function waitForHealth(url: string, timeoutMs = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // 起動待機
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function runPnpm(
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    stdio?: StdioOptions;
  },
) {
  const pnpmExecPath = process.env.npm_execpath || "pnpm";
  const isJsScript = /\.[cm]?js$/i.test(pnpmExecPath);

  if (isJsScript) {
    return execFileSync(process.execPath, [pnpmExecPath, ...args], options);
  }
  return execFileSync(pnpmExecPath, args, options);
}

export async function setupLocalConvex(): Promise<void> {
  console.log("🐳 [local-convex] Starting local Convex backend container...");

  // 動的インスタンスシークレットの生成（固定シークレットの公開防止）
  const instanceSecret =
    process.env.INSTANCE_SECRET || crypto.randomBytes(32).toString("hex");
  process.env.INSTANCE_SECRET = instanceSecret;

  try {
    // 1. Docker Compose 起動
    runCommand(`docker compose -f "${composeFile}" up -d`, {
      env: { INSTANCE_SECRET: instanceSecret },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(
      "❌ [local-convex] Failed to start Docker container. Ensure Docker Desktop is running.\n" +
        msg,
    );
    throw error;
  }

  // 2. ヘルスチェック待機
  console.log("⏳ [local-convex] Waiting for backend to become ready...");
  const isHealthy = await waitForHealth("http://127.0.0.1:3210/version");
  if (!isHealthy) {
    const err = new Error("Timeout waiting for local Convex backend to start.");
    console.error("❌ [local-convex]", err.message);
    throw err;
  }

  // 3. Admin Key の取得
  console.log("🔑 [local-convex] Generating admin key...");
  let adminKey: string;
  try {
    adminKey = runCommand(
      `docker compose -f "${composeFile}" exec -T backend ./generate_admin_key.sh`,
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("❌ [local-convex] Failed to generate admin key:", msg);
    throw error;
  }

  // 4. E2E テスト・デプロイ用環境変数ファイルに先に書き出し
  console.log("📝 [local-convex] Writing environment configuration...");
  const internalSecret =
    process.env.CONVEX_INTERNAL_SECRET || "e2e-local-internal-secret";

  fs.mkdirSync(path.dirname(localEnvFile), { recursive: true });
  fs.writeFileSync(
    localEnvFile,
    `VITE_CONVEX_URL=http://127.0.0.1:3210\n` +
      `VITE_CONVEX_SITE_URL=http://127.0.0.1:3211\n` +
      `CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210\n` +
      `CONVEX_SELF_HOSTED_ADMIN_KEY=${adminKey}\n` +
      `CONVEX_INTERNAL_SECRET=${internalSecret}\n` +
      `CONVEX_DEPLOYMENT=\n`,
    "utf-8",
  );

  // 5. ローカル Convex へバックエンドコードをワンショットデプロイ
  console.log(
    "🚀 [local-convex] Deploying Convex functions & schema to local instance...",
  );
  const selfHostedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    CONVEX_SELF_HOSTED_URL: "http://127.0.0.1:3210",
    CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey,
  };
  delete selfHostedEnv.CONVEX_DEPLOYMENT;
  delete selfHostedEnv.CONVEX_DEPLOY_KEY;

  try {
    runPnpm(
      [
        "exec",
        "convex",
        "deploy",
        "--typecheck=disable",
        "--codegen=disable",
        `--env-file=${localEnvFile}`,
      ],
      {
        cwd: backendDir,
        env: selfHostedEnv,
        stdio: "inherit",
      },
    );

    // 6. ローカル Convex インスタンスに環境変数を設定（HTTP Action / getUserByFirebaseUid 用）
    console.log(
      "⚙️  [local-convex] Setting environment variables on local instance...",
    );
    try {
      runPnpm(
        [
          "exec",
          "convex",
          "env",
          "set",
          `CONVEX_INTERNAL_SECRET=${internalSecret}`,
          "DISABLE_EMAIL_DELIVERY=true",
        ],
        {
          cwd: backendDir,
          env: selfHostedEnv,
          stdio: "inherit",
        },
      );
    } catch (envSetError) {
      console.warn(
        "⚠️ [local-convex] Non-fatal: failed to set environment variables on local instance via CLI:",
        envSetError,
      );
    }

    console.log(
      `✅ [local-convex] Local Convex backend is ready! (Wrote to ${localEnvFile})\n` +
        `   URL: http://127.0.0.1:3210 (Cloud usage: 0)`,
    );
  } catch (error) {
    console.error(
      "❌ [local-convex] Deployment to local backend failed:",
      error,
    );
    throw error;
  }
}

// 直接スクリプト実行された場合のエントリポイント
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  setupLocalConvex().catch(() => {
    process.exit(1);
  });
}
