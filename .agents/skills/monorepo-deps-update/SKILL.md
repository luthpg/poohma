---

name: monorepo-deps-update
description: Update dependencies across PoohMa monorepo packages iteratively (one package at a time) with strict full-repo verification (pnpm verify and local E2E) and protection rules for pinned/aligned libraries.
---

# PoohMa モノレポ依存関係更新プロトコル (monorepo-deps-update)

本スキルは、PoohMa モノレポにおけるパッケージ依存関係（dependencies / devDependencies）を安全かつ計画的に最新化（latest update）するための標準手順書です。

---

## 1. コア原則 (Core Principles)

1. **子プロジェクト単位の自己完結イテレーション（原因箇所の特定性維持）**:
   - `pnpm -r update --latest` のような全モノレポ一括更新は **固く禁止** する。
   - 依存グラフの上流（共通基盤ライブラリ）から下流（アプリケーション）へ、**必ず 1 パッケージずつ閉じて更新** を実施し、不具合やビルド・テスト失敗が発生した際に原因箇所を即座に特定できるようにする。
2. **検証は常にモノレポ「全体チェック」を実行（波及破損の即時検知）**:
   - 1 パッケージを更新するごとに、部分テストのみで済ませず、必ずモノレポ全体の完全パイプライン（`pnpm verify` および `pnpm test:e2e:local`）を実行する。
   - これにより、「パッケージ A を更新した結果、それに依存するパッケージ B や全体のビルド・E2E が壊れた」というモノレポ特有の波及バグを即時に検知・遮断する。
3. **合格ごとにコミット**:
   - 1 パッケージの更新と全体チェック合格が確認できたら、その単位で Git コミットを作成する（例: `chore(deps): update dependencies in @poohma/shared`）。問題発生時のロールバックや二分探索（git bisect）を容易にする。

---

## 2. バージョン固定・保護・同一化ルール（不変条件）

以下のライブラリ群は、インフラ連携・コンテナ整合性・ランタイム互換性のため、自動一括更新（`-L`）の対象外とするか、特別ルールを適用する。

| 対象ライブラリ                                                                                     | 適用パッケージ       | ルール内容                                                 | 理由・背景                                                                                                                                                                                                                                                  |
| :------------------------------------------------------------------------------------------------- | :------------------- | :--------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`@playwright/test`**                                                                             | `apps/web`           | **指定バージョン完全固定**<br>（例: `"1.64.1"`、`^` なし） | GitHub Actions で Playwright 公式 Docker コンテナ（`mcr.microsoft.com/playwright:v<ver>-noble`）を動的読み込みして E2E を実行しているため、コンテナタグと実パッケージを 100% 一致させる必要がある。コンテナタグ提供確認とセットで計画的にのみ手動更新する。 |
| **`firebase-admin`**                                                                               | `apps/web`<br>その他 | **`^13.x` 系に上限固定**<br>（`~13.10.0` または `^13.x`）  | Convex / Node.js ランタイム要件および Firebase Auth ID トークン検証の互換性を担保し、14.x 系への不用意なメジャー更新による破壊を防止する。                                                                                                                  |
| **`vitest` 関連エコシステム**<br>(`vitest`, `@vitest/coverage-v8`, `@vitest/ui`, `@vitest/spy` 等) | 全対象パッケージ     | **全パッケージ間で完全同一バージョンに統一**               | モノレポ内の複数パッケージ（backend, web, extension, admin 等）でバージョンが食い違うと、モック機構や型定義の不整合によるランタイムクラッシュを招くため、必ず全パッケージ同時に同一バージョンへ引き上げる。                                                 |

---

## 3. モノレポ全対象パッケージと更新順序（トポロジカル順）

依存関係の上流（他パッケージに依存しない共通基盤）から順に、以下の 9 単位を 1 つずつ更新する：

```text
[Step 1] packages/crypto          (@poohma/crypto)          : 暗号化コア
[Step 2] packages/shared          (@poohma/shared)          : 共通型・スキーマ・メール部品
[Step 3] packages/knowledge-tools (@poohma/knowledge-tools) : AI・ドキュメント同期ツール
[Step 4] workers/backup           (@poohma/backup)          : Cloudflare Workers バックアップ
[Step 5] packages/backend         (@poohma/backend)         : Convex バックエンド
[Step 6] apps/web                 (@poohma/web)             : メイン Web フロントエンド
[Step 7] apps/admin               (@poohma/admin)           : 管理画面フロントエンド
[Step 8] apps/extension           (@poohma/extension)       : Chrome 拡張機能
[Step 9] . (root)                 (poohma)                  : ルート（Turbo, Biome 等ツールチェイン）
```

---

## 4. 1 パッケージごとの標準更新ワークフロー

各パッケージの更新時は、必ず以下の手順（A 〜 D）を厳守する。

### Step A: 依存関係の更新（保護パッケージを除外）

対象パッケージのディレクトリまたは `--filter` を指定し、保護対象を除外して `update --latest` を実行する。

#### 例: `apps/web` の場合（playwright と firebase-admin を保護）

```bash
pnpm --filter @poohma/web update --latest "!@playwright/test" "!firebase-admin"
```

#### 例: 保護パッケージが存在しない通常パッケージの場合

```bash
pnpm --filter @poohma/shared update --latest
```

### Step B: ツール設定・スキーマのマイグレーション

特定のツールチェインが更新された場合は、検証前に設定ファイルやコード生成を追従させる。
1. **Biome 更新時（必須）**:
   `@biomejs/biome` が更新された場合は、設定ファイル `biome.json` を新バージョンのスキーマ・新ルール形式へ自動追従させるため、直ちに以下を実行する：

   ```bash
   pnpm exec biome migrate --write
   ```

   移行後、`pnpm check`（`biome check --write`）を実行して構文・整形が整っているか確認する。

2. **Convex 更新時**:
   `convex` や `convex-helpers` が更新された場合は、型定義の乖離を防ぐためコード生成を実行する：

   ```bash
   pnpm convex:codegen
   ```

### Step C: モノレポ全体チェック（全パイプライン完走）

更新後、直ちに以下の 2 大コマンドを実行し、モノレポ全体の整合性を確認する：
1. **静的・単体・ビルドの一括検証**:

   ```bash
   pnpm verify
   ```

   - `pnpm typecheck`（全 8 パッケージの型整合性）
   - `pnpm check`（Biome リント・フォーマット）
   - `pnpm test`（全単体・統合テスト）
   - `pnpm build`（全成果物のビルド整合性）
     すべてがグリーンであることを確認する。

2. **ローカル Convex E2E 動的検証**（Web, Backend, Extension に影響がある場合）:

   ```bash
   pnpm test:e2e:local
   ```

   - 全 18 テストの合格、およびコンテナ自動停止・クリーンアップを確認する。

### Step D: 不具合発生時の対応

- もし `pnpm verify` や `pnpm test:e2e:local` が失敗した場合：
  - 更新したばかりの対象パッケージの差分（`git diff apps/web/package.json`）を調査し、破壊的変更のあるライブラリを特定する。
  - 軽微なマイグレーション（API変更への追従）で修正可能なら修正して検証を再実行。
  - 大規模な破壊や未対応エコシステムが原因の場合は、そのパッケージのみバージョンを固定・ロールバックして記録する。

### Step E: コミット

全体チェック合格を確認後、対象パッケージ単体の更新としてコミットする：
```bash
git add <対象の package.json> pnpm-lock.yaml [関連コード]
git commit -m "chore(deps): update dependencies in <package-name>"
```

---

## 5. Vitest ファミリー統一更新手順

`vitest` およびその関連プラグイン（`@vitest/coverage-v8`, `@vitest/ui` 等）をバージョンアップする際は、個別パッケージごとではなく、モノレポ内のすべての参照箇所を一括で同一バージョンに引き上げる。

```bash
# 例: vitest 関連を最新安定版（例: 3.1.0）へ一斉に揃える
pnpm -r update "vitest@^3.1.0" "@vitest/coverage-v8@^3.1.0"
```
更新後は直ちに `pnpm verify` で全テストが動作することを確認する。

---

## 6. 全パッケージ更新完了時の最終確認ゲート

すべてのパッケージの更新が完了したら、最後に以下を一括実行して完全性を担保する：
1. `pnpm verify`（全ビルド・テスト通過）
2. `pnpm test:e2e:local`（E2E 動的検証通過）
3. `pnpm lint:workflows`（ワークフロー構文検証）
4. `pnpm check:doc-sync`（ドキュメント同期漏れなし）
5. `pnpm check:knowledge`（Knowledge Base 参照切れなし）
