import { execFileSync, execSync, type StdioOptions } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname =
  import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(dirname, "..");
const rootDir = path.resolve(backendDir, "../..");
const webDir = path.resolve(rootDir, "apps/web");
const localEnvFile = path.resolve(webDir, "e2e/.env.e2e-local");
const composeFile = path.resolve(backendDir, "docker-compose.local.yml");

function runCommand(cmd: string, options: { cwd?: string } = {}) {
  try {
    return execSync(cmd, {
      cwd: options.cwd ?? backendDir,
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

async function main() {
  console.log("🐳 [local-convex] Starting local Convex backend container...");

  try {
    // 1. Docker Compose 起動
    runCommand(`docker compose -f "${composeFile}" up -d`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(
      "❌ [local-convex] Failed to start Docker container. Ensure Docker Desktop is running.\n" +
        msg,
    );
    process.exit(1);
  }

  // 2. ヘルスチェック待機
  console.log("⏳ [local-convex] Waiting for backend to become ready...");
  const isHealthy = await waitForHealth("http://127.0.0.1:3210/version");
  if (!isHealthy) {
    console.error(
      "❌ [local-convex] Timeout waiting for local Convex backend to start.",
    );
    process.exit(1);
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
    process.exit(1);
  }

  // 4. E2E テスト・デプロイ用環境変数ファイルに先に書き出し
  console.log("📝 [local-convex] Writing environment configuration...");
  fs.mkdirSync(path.dirname(localEnvFile), { recursive: true });
  fs.writeFileSync(
    localEnvFile,
    `VITE_CONVEX_URL=http://127.0.0.1:3210\n` +
      `VITE_CONVEX_SITE_URL=http://127.0.0.1:3211\n` +
      `CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210\n` +
      `CONVEX_SELF_HOSTED_ADMIN_KEY=${adminKey}\n` +
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

    console.log(
      `✅ [local-convex] Local Convex backend is ready! (Wrote to ${localEnvFile})\n` +
        `   URL: http://127.0.0.1:3210 (Cloud usage: 0)`,
    );
  } catch (error) {
    console.error(
      "❌ [local-convex] Deployment to local backend failed:",
      error,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
