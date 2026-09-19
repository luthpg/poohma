import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname =
  import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(dirname, "..");

// 走査対象のビルド出力ディレクトリ候補
const targetDirs = [
  path.resolve(webRoot, ".vercel/output"),
  path.resolve(webRoot, ".output"),
  path.resolve(webRoot, "dist"),
].filter((dir) => fs.existsSync(dir));

if (targetDirs.length === 0) {
  console.error(
    "Error: No build output directories found (.vercel/output/, .output/ or dist/). Run build first.",
  );
  process.exit(1);
}

// 本番バンドルに混入してはならないテスト専用シンボル
const FORBIDDEN_SYMBOLS = ["__e2eSignIn", "firebase-browser-bridge"];

function getAllJsFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllJsFiles(fullPath));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".js") ||
        entry.name.endsWith(".mjs") ||
        entry.name.endsWith(".cjs"))
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

let violations = 0;

for (const targetDir of targetDirs) {
  const jsFiles = getAllJsFiles(targetDir);
  console.log(
    `Scanning ${jsFiles.length} files in ${path.relative(webRoot, targetDir)} for forbidden test symbols...`,
  );

  for (const file of jsFiles) {
    const content = fs.readFileSync(file, "utf-8");
    for (const symbol of FORBIDDEN_SYMBOLS) {
      if (content.includes(symbol)) {
        console.error(
          `[SECURITY VIOLATION] Forbidden test symbol "${symbol}" found in production bundle: ${path.relative(webRoot, file)}`,
        );
        violations++;
      }
    }
  }
}

if (violations > 0) {
  console.error(
    `Bundle safety check failed: ${violations} violation(s) detected.`,
  );
  process.exit(1);
}

console.log(
  "Bundle safety check passed: No test symbols found in production bundle.",
);
process.exit(0);
