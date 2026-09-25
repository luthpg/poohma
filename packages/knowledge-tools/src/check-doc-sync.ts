import { execSync } from "node:child_process";
import { findRepoRoot } from "./repo-root.js";

const ROOT_DIR = findRepoRoot();

interface Rule {
  name: string;
  pattern: RegExp;
  level: "REQUIRED" | "RECOMMENDED" | "CHECK_IF_SPEC_CHANGED";
  docs: string[];
  description: string;
}

const RULES: Rule[] = [
  {
    name: "スキーマ・テーブル構成",
    pattern: /^apps\/web\/convex\/(schema\.ts|.*schema.*\.ts)$/,
    level: "REQUIRED",
    docs: [".docs/code-design.md", ".ai/domain.md"],
    description: "テーブル定義、フィールド追加、型変更、インデックス変更",
  },
  {
    name: "Convex 関数 / Server Functions",
    pattern:
      /^(apps\/web\/convex\/(?!schema\.ts).*\.ts|apps\/web\/src\/.*\.function\.ts)$/,
    level: "RECOMMENDED",
    docs: [".docs/code-design.md", ".ai/architecture.md"],
    description: "API/関数の追加・改名、認可ビルダー、クエリ変更",
  },
  {
    name: "暗号化・鍵階層・E2EE",
    pattern:
      /^(apps\/web\/src\/lib\/crypto\/.*|apps\/web\/src\/features\/e2ee\/.*)$/,
    level: "REQUIRED",
    docs: [
      ".docs/code-design.md",
      ".docs/security/e2ee.md",
      ".docs/security/security-model.md",
      ".docs/security/threat-model.md",
      ".ai/invariants.md",
      ".ai/pitfalls/crypto-e2ee.md",
    ],
    description: "鍵導出、DEK/MasterKey、E2EE境界、暗号化ストレージ",
  },
  {
    name: "認証イベント・セッション・ログイン",
    pattern:
      /^(apps\/web\/src\/features\/auth\/.*|apps\/web\/convex\/auth\/.*|apps\/web\/src\/routes\/\(auth\)\/.*)$/,
    level: "REQUIRED",
    docs: [
      ".docs/code-design.md",
      ".docs/security/security-model.md",
      ".ai/invariants.md",
      ".ai/pitfalls/auth-session.md",
    ],
    description:
      "Firebase Auth、Session Cookie、トークン更新、ログイン/ログアウト",
  },
  {
    name: "UI体験・画面・ルーティング",
    pattern: /^apps\/web\/src\/(routes|components)\/.*$/,
    level: "CHECK_IF_SPEC_CHANGED",
    docs: [
      ".docs/features.md",
      ".docs/requirements.md",
      ".docs/DESIGN.md",
      ".ai/pitfalls/ui-and-misc.md",
    ],
    description: "画面構成、ボタン配置、ユーザー操作フロー、UX要件",
  },
  {
    name: "CI/CD ワークフロー",
    pattern: /^\.github\/workflows\/.*\.ya?ml$/,
    level: "REQUIRED",
    docs: [".ai/invariants.md", ".ai/pitfalls/workflow-ci.md"],
    description: "GitHub Actions、テスト・デプロイパイプライン、Actionlint",
  },
  {
    name: "テスト・E2E",
    pattern: /^(apps\/web\/(tests|e2e)\/.*|.*vitest.*|.*playwright.*)$/,
    level: "CHECK_IF_SPEC_CHANGED",
    docs: [".ai/testing.md", ".ai/pitfalls/e2e-testing.md"],
    description: "テスト構造、E2Eテストケース、テストハーネス",
  },
];

function getChangedFiles(): string[] {
  try {
    // 未コミットの変更ファイル一覧（ステージング済み + 未ステージング + 未追跡）
    const output = execSync("git status --porcelain -uall", {
      cwd: ROOT_DIR,
      encoding: "utf-8",
    });
    const files = new Set<string>();

    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // status line: "XY path" or "XY path -> newpath"
      const parts = trimmed.substring(3).trim();
      const actualPath = parts.includes("->")
        ? parts.split("->")[1]?.trim()
        : parts;
      if (actualPath) {
        // Windowsのバックスラッシュをスラッシュに正規化
        files.add(actualPath.replace(/\\/g, "/"));
      }
    }

    return Array.from(files);
  } catch (_error) {
    console.warn(
      "⚠️ Failed to execute git command. Falling back to empty diff.",
    );
    return [];
  }
}

function runDocSyncCheck(): void {
  console.log("📋 Checking Doc-Sync requirements for current git changes...\n");

  const changedFiles = getChangedFiles();

  if (changedFiles.length === 0) {
    console.log("✨ No working tree changes detected.");
    return;
  }

  console.log(
    `Found ${changedFiles.length} modified/untracked file(s) in working tree.\n`,
  );

  const requiredDocs = new Map<string, { level: string; reasons: string[] }>();

  for (const file of changedFiles) {
    for (const rule of RULES) {
      if (rule.pattern.test(file)) {
        for (const doc of rule.docs) {
          const existing = requiredDocs.get(doc);
          if (!existing) {
            requiredDocs.set(doc, {
              level: rule.level,
              reasons: [`${rule.name} (${file})`],
            });
          } else {
            // REQUIRED は CHECK_IF_SPEC_CHANGED より優先
            if (
              rule.level === "REQUIRED" ||
              existing.level === "CHECK_IF_SPEC_CHANGED"
            ) {
              existing.level = rule.level;
            }
            if (existing.reasons.length < 3) {
              existing.reasons.push(`${rule.name} (${file})`);
            }
          }
        }
      }
    }
  }

  if (requiredDocs.size === 0) {
    console.log(
      "ℹ️ No specific document synchronization triggers matched for these changes.",
    );
    return;
  }

  console.log("=== Doc-Sync Analysis Matrix ===");

  let hasRequiredPending = false;

  for (const [doc, info] of requiredDocs.entries()) {
    const isModified = changedFiles.includes(doc);
    const statusIcon = isModified ? "✅ [同期済み]" : "⏳ [未更新]";

    let levelBadge = "";
    if (info.level === "REQUIRED") {
      levelBadge = "🔴 【更新が必須】";
      if (!isModified) hasRequiredPending = true;
    } else if (info.level === "RECOMMENDED") {
      levelBadge = "🟡 【更新を推奨】";
    } else {
      levelBadge = "⚪ 【仕様変更時は要確認】";
    }

    console.log(`\n${statusIcon} ${levelBadge}: ${doc}`);
    console.log(`   理由: ${info.reasons.join(", ")}`);
  }

  console.log("\n================================");

  if (hasRequiredPending) {
    console.log(
      "\n⚠️ 注意: 更新が必須と指定されているドキュメントに変更が含まれていません。",
    );
    console.log(
      "仕様変更や不変条件への影響がないか確認し、必要に応じてドキュメントを同期してください。",
    );
  } else {
    console.log(
      "\n✨ すべての必須ドキュメントが更新されているか、または軽微な変更のみです。",
    );
  }
}

runDocSyncCheck();
