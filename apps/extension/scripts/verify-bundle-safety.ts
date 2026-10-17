import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 検査対象ディレクトリ（ビルド成果物）
const OUTPUT_DIR = path.resolve(__dirname, "../.output/chrome-mv3");

// 禁止シークレットパターン
const FORBIDDEN_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /CONVEX_INTERNAL_SECRET/,
  /FIREBASE_ADMIN/,
  /client_secret.*[a-zA-Z0-9_-]{24,}/,
  /RESEND_API_KEY/,
  /YAHOO_CLIENT_SECRET/,
  /CLOUDFLARE_API_TOKEN/,
];

function scanDirectory(dir: string): {
  totalFiles: number;
  violations: { file: string; pattern: string }[];
} {
  let totalFiles = 0;
  const violations: { file: string; pattern: string }[] = [];

  if (!fs.existsSync(dir)) {
    throw new Error(
      `Output directory does not exist: ${dir}. Run 'pnpm build' first.`,
    );
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const subResult = scanDirectory(fullPath);
      totalFiles += subResult.totalFiles;
      violations.push(...subResult.violations);
    } else if (entry.isFile()) {
      // バイナリファイル（画像等）は除外
      const ext = path.extname(entry.name).toLowerCase();
      if (
        [".png", ".jpg", ".jpeg", ".webp", ".ico", ".woff", ".woff2"].includes(
          ext,
        )
      ) {
        continue;
      }

      totalFiles++;
      const content = fs.readFileSync(fullPath, "utf-8");

      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(content)) {
          violations.push({
            file: path.relative(OUTPUT_DIR, fullPath),
            pattern: pattern.toString(),
          });
        }
      }
    }
  }

  return { totalFiles, violations };
}

console.log("🔍 Scanning extension bundle for unintended secrets...");

try {
  const { totalFiles, violations } = scanDirectory(OUTPUT_DIR);

  if (violations.length > 0) {
    console.error(
      `❌ Security Violation! Found ${violations.length} secret pattern(s) in bundle:`,
    );
    for (const v of violations) {
      console.error(`   - File: ${v.file} matched ${v.pattern}`);
    }
    process.exit(1);
  }

  console.log(
    `✅ Bundle safety verification passed! Scanned ${totalFiles} file(s). No secrets found.`,
  );
  process.exit(0);
} catch (error) {
  console.error("❌ Failed to verify bundle safety:", error);
  process.exit(1);
}
