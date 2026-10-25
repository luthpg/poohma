import { execFileSync, type StdioOptions } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setupLocalConvex } from "./setup-local-convex.js";
import { stopLocalConvex } from "./stop-local-convex.js";

const dirname =
  import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(dirname, "..");
const rootDir = path.resolve(backendDir, "../..");

function runPnpm(
  args: string[],
  options: {
    cwd?: string;
    stdio?: StdioOptions;
  } = {},
) {
  const pnpmExecPath = process.env.npm_execpath || "pnpm";
  const isJsScript = /\.[cm]?js$/i.test(pnpmExecPath);

  if (isJsScript) {
    return execFileSync(process.execPath, [pnpmExecPath, ...args], options);
  }
  return execFileSync(pnpmExecPath, args, options);
}

let isCleaningUp = false;

async function cleanup(): Promise<boolean> {
  if (isCleaningUp) return true;
  isCleaningUp = true;

  try {
    await stopLocalConvex();
    return true;
  } catch (cleanupError) {
    console.error("⚠️ [local-convex] Cleanup encountered error:", cleanupError);
    return false;
  }
}

async function main() {
  let exitCode = 0;

  const handleSignal = async (signal: string) => {
    console.log(`\n🛑 [local-convex] Received ${signal}, cleaning up...`);
    await cleanup();
    process.exit(130);
  };

  process.on("SIGINT", () => void handleSignal("SIGINT"));
  process.on("SIGTERM", () => void handleSignal("SIGTERM"));

  try {
    await setupLocalConvex();

    console.log(
      "🧪 [local-convex] Running Web E2E tests against local Convex backend...",
    );
    try {
      runPnpm(["--filter", "@poohma/web", "run", "test:e2e"], {
        cwd: rootDir,
        stdio: "inherit",
      });
    } catch (error: unknown) {
      const execError = error as { status?: number };
      exitCode = execError.status ?? 1;
      console.error(
        `❌ [local-convex] E2E tests failed with exit code ${exitCode}`,
      );
    }
  } catch (setupError) {
    console.error("❌ [local-convex] Setup failed:", setupError);
    exitCode = 1;
  } finally {
    // 成功・失敗・例外問わず確実にクリーンアップを実行
    const cleanupSuccess = await cleanup();
    if (!cleanupSuccess && exitCode === 0) {
      exitCode = 1;
    }
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
