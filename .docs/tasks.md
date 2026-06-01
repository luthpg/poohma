# プロジェクト実装状況レポート：進捗と今後のタスク

本ドキュメントは、現在のコードベースの実装状況を整理し、未完了のタスクおよび品質向上のための改善案をまとめたものです。現在、バックエンドインフラを Prisma/PostgreSQL から **Convex** へ完全移行する作業が進行中です。

## 1. 実装済み事項 (Done)

- **レコード管理の基本機能 (UI)**:
  - 新規作成画面 (`/records/new`): OGP自動取得・バリデーション対応。
  - 詳細・編集画面 (`/records/$id`): インライン編集・削除・詳細表示。
  - ダッシュボード: 検索・タグフィルタリング・レスポンシブ対応（モバイルでの横長カード化）。
- **家族（Family）管理機能 (UI/旧バックエンド)**:
  - 家族の作成・参加・メンバー表示機能。
- **基盤・セキュリティ**:
  - グローバルなエラーハンドリング (`errorComponent`, `notFoundComponent`)。
  - TanStack Router による型安全な `searchParams` のパース。
  - クライアントサイドE2E暗号化 (E2EE) の実装 (`lib/crypto.ts` および `PasscodeProvider`)。
- **Convex移行（一部完了）**:
  - スキーマの定義 (`convex/schema.ts`)。
  - Firebase Authとの連携設定 (`ConvexProviderWithAuth`, `useConvexFirebaseAuth.ts`)。
  - レコード一覧取得 (`getRecords`) および新規作成 (`createRecord`) 、OGP取得 (`getOgpInfo` action) の Convex 化とフロントエンド（`/dashboard`, `/records/new`）の繋ぎ込み。

---

## 2. 現在の残タスク (To-Do)

Convexへの完全移行と未完了の機能追加を最優先で行います。

### 2.1. Convex への完全移行 (バックエンドの置き換え)
- [x] **家族管理機能の Convex 化**:
  - `src/services/family.server.ts` の処理（作成、参加、メンバー取得、変更・脱退時のマスターキー再暗号化）を Convex の `mutation` / `query` に移行し、`/family` ページを改修する。
- [x] **CSVインポート・エクスポート機能の Convex 化**:
  - `exportOwnedRecordsCsv`, `importRecordsCsv` などを Convex 側（件数が多い場合は `action` や `mutation`）で再実装する。
  - インポート時の制限事項（最大500件など）を維持した形での設計。
- [x] **レコード詳細・編集画面の Convex 化完了**:
  - `/records/$id` 内の削除 (`deleteRecord`) や編集機能 (`updateRecord`) が完全に Convex の API を叩くようにし、旧関数 (`records.functions.ts`) への依存を無くす。
- [ ] **旧インフラ（Prisma / PostgreSQL）の撤去**:
  - `prisma` 関連のコード、依存パッケージ、および `src/services/*.server.ts` 系ファイルを削除する。

### 2.2. 機能・UIの拡張
- [ ] **ダッシュボードの Infinite Scroll (ページネーション) の再実装**:
  - 課題：現在の `getRecords` クエリは、インメモリでのソート・フィルタリング（タグ、フリーワード、複数条件のOR等）を行っており、Convex標準の `usePaginatedQuery` がそのままでは使いにくい。
  - 対応方針：
    - **アプローチA (インメモリベース)**: Convexクエリ内で Limit / Offset (または Array slice) を用いた簡易ページネーションを実装し、フロントエンドから `limit` 引数等を渡して徐々に取得件数を増やす。
    - **アプローチB (DB最適化)**: `serviceRecords` テーブルのインデックス設計を大幅に見直し、アクセス権限用の統合フィールドなどを追加した上で、標準の `.paginate()` に対応させる。
    - （※実装コストと現在のデータ量感から、まずはアプローチAでフロントエンドのInfinite ScrollのUIを成立させることを検討）
- [x] **ユーザープロフィール管理**:
  - 表示名 (`displayName`) の変更用UIおよびバックエンド(Convex)処理。

### 2.3. セキュリティ・信頼性の強化
- [x] **Convex Data Access Rules / バリデーションの徹底**:
  - Prismaの RLS (Row Level Security) に代わる仕組みとして、すべての `query` / `mutation` の冒頭で厳密な認証・認可チェック（オーナーか、同じ家族の共有レコードか等）を実施し、不正アクセスを防止する。（※全クエリ/ミューテーションで徹底されていることを検証完了）
- [x] **OGP取得ロジックの堅牢化**:
  - 不正な HTML や特殊な文字コード（Shift_JIS/EUC-JP等）への自動エンコーディング検出デコード対応、HTMLエンティティの完全復号、画像の相対パス解決による堅牢化対応。

### 2.4. デザイン・UXの洗練
- [ ] **`DESIGN.md` の厳格な適用**:
  - [ ] タイポグラフィ: 負のレタースペーシング（`-2.4px` 等）の厳密な適用。
  - [ ] ボーダーの排除: すべての `border` を `box-shadow` による「Shadow-as-border」に置き換え。
- [ ] **インタラクションの向上**:
  - [ ] ローディング時のスケルトンスクリーンの適用範囲拡大。
  - [ ] `biome check` で指摘されているアクセシビリティ関連（a11y）の Lint エラー解消。

### 2.5. テストケースの Convex 移管 (テストの整備)
バックエンドの Convex 移行に伴い、既存の Prisma / PostgreSQL 依存のテストスイートを Convex 環境へ適合するよう書き換えます。
- [x] **テスティング環境の構築**:
  - [x] `convex-test` を導入し、`vitest.config.ts` で `inline: ["convex-test"]` 依存インライン化により `import.meta.glob` のトランスパイル問題を解決した上で、インメモリでの Convex 動作環境を Vitest と統合。
- [x] **データベース・セキュリティ（RLS）テストの Convex 移行**:
  - [x] `tests/convex-rls.spec.ts` を新規作成。未認証ユーザーのアクセス拒否、および他人の PRIVATE レコードに対するクエリ・更新・削除のアクセスブロック (RLS) を完全に検証。
- [x] **家族管理（鍵ローテーション・IDOR）テストの Convex 移行**:
  - [x] `tests/convex-family.spec.ts` を新規作成。家族グループ作成時の所属ユーザー自動紐付け、および家族グループ変更 (再暗号化) に伴う他人のレコードの IDOR 不正改ざんブロックを検証。
- [x] **レコード操作（CRUD）テストの Convex 移行**:
  - [x] `tests/convex-records.spec.ts` を新規作成。閲覧権限境界値 (PRIVATE / SHARED 家族内外の分離)、OGP取得処理のフォールバック・フェイルセーフ、CSVインポート時の部分成功と500行制限・家族未所属エラーのトランザクション動作を検証。
- [x] **テスト用データシード（Seed）の Convex 対応**:
  - [x] テスト実行前のセットアップにインメモリデータベース `t.run(async (ctx) => { ... })` を使用したクリーンで高速なモックデータベース構築を採用。

---

## 3. 推奨される次ステップ

1. **Convex移行の完遂**: 家族管理機能 (`/family`) とCSVインポート機能を Convex API に移行し、Prisma関連コードを削除する。
2. **テストケースの Convex 移管**: 旧インフラ撤去前に、セキュリティ（RLS）や家族管理のテストスイートを Convex 用に移植し、機能のデグレードやセキュリティホールの発生を防止する。
3. **Infinite Scrollの実装**: ダッシュボードの取得負荷軽減のため、インメモリスライスなどの簡易的な方法でページネーションを導入する。
4. **品質向上・デザイン調整**: アクセシビリティの修正、ローディングUIの改善、および `DESIGN.md` に沿ったUIのポリッシュを行う。
