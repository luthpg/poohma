import fs from "node:fs";
import path from "node:path";
import { findRepoRoot } from "./repo-root.js";

interface ReferenceError {
  filePath: string;
  lineNumber: number;
  rawRef: string;
  normalizedPath: string;
}

const ROOT_DIR = findRepoRoot();
const AI_DIR = path.join(ROOT_DIR, ".ai");

// Markdownファイルを再帰的に走査
function getMarkdownFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

// 参照パスの正規化（行番号、ハッシュ、末尾記号の除去）
function normalizeRef(raw: string): string {
  let clean = raw.trim();

  // 行番号・アンカーの除去 (:123, #L123, #section)
  clean = clean.replace(/#.*$/, "");
  clean = clean.replace(/:\d+(?::\d+)?$/, "");

  // 末尾の記号除去 (.,;:`'")] など)
  clean = clean.replace(/[.,;:`'")[\]]+$/, "");

  // 前後のクォートや括弧除去
  clean = clean.replace(/^[`'"]+|[`'"]+$/g, "");

  return clean.trim();
}

// リポジトリルート起点として扱う接頭辞
const ROOT_PREFIXES = [
  "apps/",
  "workers/",
  "packages/",
  ".docs/",
  ".ai/",
  ".github/",
  ".agents/",
];

function isRootRelative(ref: string): boolean {
  return ROOT_PREFIXES.some((prefix) => ref.startsWith(prefix));
}

// 対象となる参照パスのパターン（apps/, workers/, packages/, .docs/, .ai/, .github/, .agents/ 等）
const REF_PATTERNS = [
  // インラインコード: `apps/...` や `.docs/...`
  /`((?:apps|workers|packages|\.docs|\.ai|\.github|\.agents)\/[^`\s]+)`/g,
  // Markdownリンク: [...](path)
  /\[[^\]]*\]\(([^)\s]+)\)/g,
];

// 無視するキーワードやプレースホルダー
function shouldIgnore(ref: string): boolean {
  if (ref.includes("*") || ref.includes("<") || ref.includes(">")) return true;
  if (ref.includes("...") || ref.includes("${")) return true;
  if (
    ref.startsWith("http://") ||
    ref.startsWith("https://") ||
    ref.startsWith("mailto:") ||
    ref.startsWith("#")
  ) {
    return true;
  }
  return false;
}

function checkReferences(): void {
  console.log(
    "🔍 Scanning .ai/**/*.md for code and documentation references...",
  );

  if (!fs.existsSync(AI_DIR)) {
    console.error(`❌ .ai directory not found: ${AI_DIR}`);
    process.exit(1);
  }

  const files = getMarkdownFiles(AI_DIR);
  const errors: ReferenceError[] = [];
  let totalRefs = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      const lineNumber = i + 1;

      for (const pattern of REF_PATTERNS) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null = pattern.exec(line);

        while (match !== null) {
          const rawRef = match[1];
          if (rawRef && !shouldIgnore(rawRef)) {
            const cleanRef = normalizeRef(rawRef);
            if (cleanRef && !shouldIgnore(cleanRef)) {
              totalRefs++;

              let resolvedPath: string;
              if (isRootRelative(cleanRef)) {
                resolvedPath = path.resolve(ROOT_DIR, cleanRef);
              } else {
                // 通常の相対パス（workflows/..., pitfalls/..., ./..., ../... 等）はファイルのディレクトリ起点
                resolvedPath = path.resolve(path.dirname(file), cleanRef);
              }

              if (!fs.existsSync(resolvedPath)) {
                errors.push({
                  filePath: path.relative(ROOT_DIR, file),
                  lineNumber,
                  rawRef,
                  normalizedPath: path.relative(ROOT_DIR, resolvedPath),
                });
              }
            }
          }
          match = pattern.exec(line);
        }
      }
    }
  }

  console.log(
    `\nChecked ${totalRefs} references across ${files.length} markdown files in .ai/`,
  );

  if (errors.length > 0) {
    console.error(
      `\n❌ Found ${errors.length} broken reference(s) (potential knowledge staleness):\n`,
    );
    for (const err of errors) {
      console.error(
        `  ${err.filePath}:${err.lineNumber}\n    Reference: "${err.rawRef}"\n    Resolved:  "${err.normalizedPath}" (Not found)\n`,
      );
    }
    console.error(
      "Please update or remove broken references in .ai/ to prevent AI misdirection.",
    );
    process.exit(1);
  } else {
    console.log(
      "✅ All references in .ai/ are valid! No broken references found.\n",
    );
  }
}

checkReferences();
