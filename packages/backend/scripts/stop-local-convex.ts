import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dirname =
  import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(dirname, "..");
const rootDir = path.resolve(backendDir, "../..");
const webDir = path.resolve(rootDir, "apps/web");
const localEnvFile = path.resolve(webDir, "e2e/.env.e2e-local");
const composeFile = path.resolve(backendDir, "docker-compose.local.yml");

export async function stopLocalConvex(): Promise<void> {
  console.log("🛑 [local-convex] Stopping local Convex backend container...");

  try {
    execSync(`docker compose -f "${composeFile}" down`, {
      cwd: backendDir,
      stdio: "inherit",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn("⚠️  [local-convex] Failed to stop container cleanly:", msg);
  }

  if (fs.existsSync(localEnvFile)) {
    fs.rmSync(localEnvFile, { force: true });
    console.log(`🧹 [local-convex] Removed ${localEnvFile}`);
  }

  console.log("✅ [local-convex] Local Convex backend stopped.");
}

// 直接スクリプト実行された場合のエントリポイント
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  stopLocalConvex().catch(() => {
    process.exit(1);
  });
}
