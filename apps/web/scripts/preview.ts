import {
  type ChildProcess,
  execSync,
  spawn,
  spawnSync,
} from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const dirname =
  import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(dirname, "..");
const rootDir = path.resolve(webDir, "../..");
const storageStatePath = path.resolve(webDir, "e2e/.auth/e2e-user.json");

// 環境変数ファイルの読み込み（.env, .env.local, e2e/.env.e2e-preview）
const envFiles = [
  path.join(rootDir, ".env"),
  path.join(rootDir, ".env.local"),
  path.join(webDir, ".env"),
  path.join(webDir, ".env.local"),
  path.join(webDir, "e2e/.env.e2e-preview"),
];

for (const envFile of envFiles) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile, override: true });
  }
}

const args = process.argv.slice(2);
const isFresh = args.includes("--fresh") || args.includes("--clean");
const port = process.env.PORT ?? "3100";
const portNumber = Number.parseInt(port, 10);
const targetUrl =
  process.env.PREVIEW_URL ?? `https://localhost:${port}/dashboard`;
const device = process.env.PREVIEW_DEVICE ?? "iPhone 17";
const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

let webServerProcess: ChildProcess | null = null;

function killProcessTree(pid: number) {
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
    } catch {
      // 既に終了している場合は無視
    }
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // 無視
      }
    }
  }
}

function cleanup() {
  if (webServerProcess?.pid) {
    console.log("\n🧹 [preview] Shutting down Web server...");
    killProcessTree(webServerProcess.pid);
    webServerProcess = null;
  }
}

process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});

process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});

async function isPortOpen(
  targetPort: number,
  timeoutMs = 1500,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });

    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(targetPort, "localhost");
  });
}

async function waitForPort(
  targetPort: number,
  timeoutMs = 60000,
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (await isPortOpen(targetPort)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  // 1. 認証ストレージ（e2e/.auth/e2e-user.json）の確認・生成
  if (isFresh || !fs.existsSync(storageStatePath)) {
    console.log(
      "🔑 [preview] Generating virtual authentication state via Playwright setup...",
    );
    const setupCmd = `${pnpmCmd} exec playwright test e2e/auth.setup.ts --project=setup --no-deps`;
    const setupResult = spawnSync(setupCmd, {
      cwd: webDir,
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        PORT: port,
      },
    });

    if (setupResult.status !== 0) {
      console.error("❌ [preview] Failed to generate authentication state.");
      process.exit(setupResult.status ?? 1);
    }
  } else {
    console.log(
      "ℹ️  [preview] Using existing authentication state (e2e/.auth/e2e-user.json). Pass --fresh to regenerate.",
    );
  }

  // 2. Web サーバー（ポート ${port}）の確認および起動
  const alreadyRunning = await isPortOpen(portNumber);

  if (alreadyRunning) {
    console.log(
      `⚡ [preview] Web server is already running on port ${port}. Reusing existing server.`,
    );
  } else {
    console.log(`🚀 [preview] Starting Web server on port ${port}...`);
    webServerProcess = spawn(`${pnpmCmd} dev --port ${port}`, {
      cwd: webDir,
      stdio: "pipe",
      shell: true,
      env: {
        ...process.env,
        PORT: port,
      },
    });

    webServerProcess.stdout?.on("data", (data) => {
      const line = data.toString().trim();
      if (line.includes("Local:") || line.includes("ready")) {
        console.log(`[Web Server] ${line}`);
      }
    });

    webServerProcess.on("exit", (code) => {
      if (code !== null && code !== 0) {
        console.error(`[Web Server] Exited with code ${code}`);
      }
    });

    const isReady = await waitForPort(portNumber);
    if (!isReady) {
      console.error(
        `❌ [preview] Web server failed to respond within 60s on port ${port}.`,
      );
      cleanup();
      process.exit(1);
    }
    console.log(`✅ [preview] Web server is ready on port ${port}`);
  }

  // 3. Playwright Open の実行（ブラウザ起動）
  console.log(
    `🌐 [preview] Opening Playwright browser (${device}) at ${targetUrl}...`,
  );
  const relativeStoragePath = path
    .relative(webDir, storageStatePath)
    .replace(/\\/g, "/");

  const openCmd = `${pnpmCmd} exec playwright open --load-storage="${relativeStoragePath}" --ignore-https-errors "${targetUrl}" --device="${device}" --color-scheme=light`;

  const browser = spawn(openCmd, {
    cwd: webDir,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
    },
  });

  browser.on("exit", (code) => {
    cleanup();
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  cleanup();
  console.error("❌ [preview] Unexpected error:", err);
  process.exit(1);
});
