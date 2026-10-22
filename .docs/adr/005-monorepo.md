# ADR-005: Monorepo

## Status

Accepted（Issue #53「データ層をPrisma+SupabaseからConvexへ移行」、#228「Convex データを Cloudflare Workers + R2 で定時自動バックアップする環境構築」を実装の裏付けとして参照し、事後的に整理したADR）

## Context

PoohMa は Webアプリケーション（`apps/web`）と、日次バックアップ用のCloudflare Worker（`workers/backup`）という、デプロイ先の異なる2つの実行体を持つ。Worker はIssue #228で新設された比較的新しいコンポーネントであり、両者のリポジトリ構成をどうするか（単一リポジトリか、分割リポジトリか）を決める必要があった。

なお、データ層自体もIssue #53でPrisma+SupabaseからConvexへ移行しており、インフラ構成が過去に一度大きく変化した経緯がある。

## Decision

pnpm workspace（`pnpm-workspace.yaml`：`apps/*` / `workers/*` / `packages/*`）とTurborepo（`turbo.json`）による単一リポジトリのモノレポ構成を採用する。Lint/Format（Biome）、CI（GitHub Actions の単一ワークフロー）をリポジトリ全体で共通化する。

現在では以下の構成で各層の関心事を分離・共有している：
- `apps/web`: エンドユーザー向け Web フロントエンド（TanStack Start, Vite）
- `apps/admin`: 運用管理者向けダッシュボード（TanStack Start, Cloudflare Pages）
- `packages/backend`: Convex バックエンド（スキーマ、ミューテーション、クエリ、RLS）
- `packages/crypto`: E2EE Web Crypto API ロジック（鍵導出・暗号化・復号・エンベロープ）
- `packages/shared`: 共通 Zod スキーマ、メールテンプレート、ユーティリティ
- `packages/knowledge-tools`: AI ドキュメント同期・ナレッジ検査スクリプト
- `workers/backup`: 日次自動バックアップ用 Cloudflare Worker

## Alternatives

- **マルチリポジトリ（`apps/web`と`workers/backup`等を別リポジトリに分割）**：デプロイの独立性は高まるが、個人／小規模開発のポートフォリオ用途としては、CI・Lint設定の二重管理やスキーマ変更時の同期コストの方が負担が大きいと判断し不採用。
- **npm/yarn workspacesのみ（Turborepoなどのタスクランナーなし）**：pnpm workspaceによる依存関係の共有は可能だが、ビルド・テストのキャッシュやタスク間の依存関係解決（`dependsOn: ["^build"]`）が手薄になるため、Turborepoを採用した。

## Consequences

- バックエンドロジック、暗号化処理、共通スキーマを `packages/*` として切り出したことで、`apps/web` と `apps/admin` の間での型安全な再利用性が担保され、関心事の明確な分離が実現した。
- CIは単一ワークフロー（`ci.yml`）でワークフロー静的解析（actionlint）・Biome Lint・型チェック・ビルド・テストを一括実行しており、変更検知（Turborepo キャッシュ）を活かしつつリポジトリ全体の整合性を保証している。

## 関連ドキュメント

- [Architecture Overview](../architecture.md)
