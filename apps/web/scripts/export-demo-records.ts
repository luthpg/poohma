import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname =
  import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(dirname, "..");
const targetFile = path.resolve(dirname, "../convex/demoRecords.json");

console.log(
  "Exporting demo records from Convex via demo:exportDemoRecordsInternal...",
);

// 引数から familyId を取得（例: pnpm demo:export <familyId>）
const familyId = process.argv[2];
const argsArg = familyId ? JSON.stringify({ familyId }) : "{}";

try {
  const isWindows = process.platform === "win32";
  // Windows PowerShell / cmd でのエスケープ対策
  const quotedArgs = isWindows
    ? `"${argsArg.replace(/"/g, '\\"')}"`
    : `'${argsArg}'`;
  const cmd = `pnpm exec convex run demo:exportDemoRecordsInternal ${quotedArgs}`;

  const stdout = execSync(cmd, {
    cwd: webDir,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "inherit"],
  });

  const trimmed = stdout.trim();
  const startIdx = trimmed.indexOf("[");
  const endIdx = trimmed.lastIndexOf("]");
  if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
    throw new Error(
      `Could not find valid JSON array in convex run output:\n${trimmed}`,
    );
  }
  const jsonStr = trimmed.slice(startIdx, endIdx + 1);
  const parsed = JSON.parse(jsonStr);
  if (!Array.isArray(parsed)) {
    throw new Error("Exported data is not an array");
  }

  fs.writeFileSync(targetFile, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
  console.log(
    `Successfully exported ${parsed.length} demo records to ${targetFile}`,
  );
} catch (error) {
  console.error("Failed to export demo records:", error);
  process.exit(1);
}
