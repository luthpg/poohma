# ADR-005: Monorepo

## Status

Accepted（Issue #53「データ層をPrisma+SupabaseからConvexへ移行」、#228「Convex データを Cloudflare Workers + R2 で定時自動バックアップする環境構築」を実装の裏付けとして参照し、事後的に整理したADR）

## Context

PoohMa は Webアプリケーション（`apps/web`）と、日次バックアップ用のCloudflare Worker（`workers/backup`）という、デプロイ先の異なる2つの実行体を持つ。Worker はIssue #228で新設された比較的新しいコンポーネントであり、両者のリポジトリ構成をどうするか（単一リポジトリか、分割リポジトリか）を決める必要があった。

なお、データ層自体もIssue #53でPrisma+SupabaseからConvexへ移行しており、インフラ構成が過去に一度大きく変化した経緯がある。

## Decision

pnpm workspace（`pnpm-workspace.yaml`：`apps/*` / `workers/*`）とTurborepo（`turbo.json`）による単一リポジトリのモノレポ構成を採用する。Lint/Format（Biome）、CI（GitHub Actions の単一ワークフロー）をリポジトリ全体で共通化する。なお、現時点では `packages/*` に相当する共有ライブラリのワークスペースは作成していない。

## Alternatives

- **マルチリポジトリ（`apps/web`と`workers/backup`を別リポジトリに分割）**：デプロイの独立性は高まるが、個人／小規模開発のポートフォリオ用途としては、CI・Lint設定の二重管理やスキーマ変更時の同期コストの方が負担が大きいと判断し不採用。
- **npm/yarn workspacesのみ（Turborepoなどのタスクランナーなし）**：pnpm workspaceによる依存関係の共有は可能だが、ビルド・テストのキャッシュやタスク間の依存関係解決（`dependsOn: ["^build"]`）が手薄になるため、Turborepoを採用した。
- **`packages/*`に暗号化ロジック等を共有パッケージとして先行分離**：現状、暗号化ロジック（`crypto.ts`）等の主要ロジックを利用するのは`apps/web`のみであり、`workers/backup`はConvex Export APIから暗号化済みデータをそのまま扱うだけでアプリケーションロジックを共有していないため、時期尚早な抽象化（premature abstraction）を避け見送った。

## Consequences

- 現状、`apps/web`と`workers/backup`の間でコード共有は発生しておらず、`packages/*`が存在しないシンプルな構成になっている。
- 今後、複数のアプリケーションやWorkerが暗号化ロジックやスキーマ定義を共有する必要が生じた場合は、`packages/*`ワークスペースを追加する形で拡張することを想定している。加えて、Issue #218「Cloudflare Workers / Pagesへのアプリケーション移管」と #219「Cloudflare移行に伴う外部サービス・Runtime互換性対応」（いずれもopen）が実現すると、`apps/web`のデプロイ先自体が変わり、モノレポ内の構成見直しが必要になる可能性がある。
- CIは単一ワークフロー（`ci.yml`）でLint・型チェック・ビルド・テストを一括実行しており、`apps/web`と`workers/backup`のどちらか一方の変更でも全体のCIが走る（変更検知によるジョブの絞り込みは現状導入していない）。

## 関連ドキュメント

- [Architecture Overview](../architecture.md)

