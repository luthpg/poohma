# PoohMa（プーマ）

家族専用の、パスワードを預からないアカウント管理アプリ。

PoohMaは、家族間でアカウント情報を共有・管理するためのWebアプリケーションです。実際のパスワードはどこにも保存せず、家族だけが分かる「パスワードのヒント」を、ブラウザ側で暗号化してから保存します。利用には「家族グループ」の作成、または既存の家族グループへの参加が必須です。

## 目次

- [PoohMaとは](#poohmaとは)
- [主な特徴](#主な特徴)
- [技術スタック](#技術スタック)
- [セキュリティ設計の概要](#セキュリティ設計の概要)
- [関連ドキュメント](#関連ドキュメント)
- [セットアップ](#セットアップ)
- [利用可能なスクリプト](#利用可能なスクリプト)
- [ディレクトリ構成](#ディレクトリ構成)
- [テスト](#テスト)
- [デプロイ](#デプロイ)
- [コントリビューション](#コントリビューション)
- [ライセンス](#ライセンス)

## PoohMaとは

動画配信サービスやWi-Fi、各種サブスクリプションなど、家族で共有しているアカウントは多くあります。しかし「実際のパスワードをそのまま教え合う」ことには心理的な抵抗があり、メモに書いて紛失するリスクもあります。

PoohMaは、実際のパスワードではなく「パスワードのヒント」を家族間で共有することで、この課題を解決します。パスワードヒントは、ブラウザ側でエンドツーエンド暗号化（E2EE）され、サーバーには暗号化済みの状態でのみ送信されます。サービス名・URL・メモ・タグ・ログインIDなどのメタデータは暗号化されず平文で保存されます。

## 主な特徴

- **パスワードそのものを扱わない** ：保存するのはヒントのみ。運用者を含め、誰もヒントの平文を見られません。
- **エンベロープ暗号化** ：家族共通の合言葉（パスコード）で保護されたマスターキーが、サービスアカウントごとの鍵（DEK）をそれぞれ保護する、二重構造の暗号化を採用しています。
- **マルチアカウント・マルチファミリー対応** ：1つのログイン（Firebase Auth）で用途や所属家族に応じた複数のPoohMaアカウントを作成・安全に切り替え可能。非公開（個人用）レコードの所有権・所属ファミリー・E2EE暗号化境界がアカウント単位で分離されます。
- **家族グループ単位の共有** ：招待コード・QRコードによる招待と、既存メンバーによる承認制で、意図しない第三者の参加を防ぎます。
- **生体認証対応** ：WebAuthn（PRF拡張）により、対応端末では指紋・顔認証でロック解除できます。
- **CSVエクスポート／インポート** ：ロックインしない設計。登録データはいつでも書き出せます。
- **PWA対応** ：ホーム画面に追加してアプリのように利用できます。

より詳しい機能一覧は [要件定義書](#関連ドキュメント) を参照してください。

## 技術スタック

| 分類          | 技術                                                             |
| ----------- | -------------------------------------------------------------- |
| フロントエンド     | React 19, TanStack Start（SSR）, TanStack Router, TanStack Query |
| スタイリング      | Tailwind CSS v4, shadcn/ui                                     |
| バックエンド／DB   | Convex（サーバーレス関数＋リアクティブDB）                                      |
| 認証          | Firebase Authentication（Google OAuth）＋ セッションCookie             |
| CMS         | microCMS（FAQ・利用規約・プライバシーポリシー）                                  |
| メール送信       | Resend                                                         |
| 暗号化         | Web Crypto API（AES-GCM, PBKDF2）, WebAuthn（PRF拡張）               |
| バリデーション     | zod                                                            |
| テスト         | Vitest, @testing-library/react, convex-test, Playwright        |
| Lint／フォーマット | Biome                                                          |
| デプロイ        | Vercel（フロントエンド）, Convex Cloud（バックエンド）                          |
| バックアップ     | Cloudflare Workers（定時自動実行）, Cloudflare R2（ZIP保存・90日保持）         |

技術的な詳細（DBスキーマ、API一覧、暗号鍵の階層構造など）は [設計書](#関連ドキュメント) を参照してください。

## セキュリティ設計の概要

PoohMaの暗号化は、次の3層構造になっています。

1. 家族の合言葉（パスコード）は、サーバーにもブラウザにも保存されません。家族メンバーの頭の中だけにあります。
2. パスコードから導出した鍵が、家族共通の「マスターキー」を保護（ラップ）します。
3. マスターキーが、サービスアカウントごとに生成される「DEK」を保護し、DEKがパスワードヒント本体を暗号化します（エンベロープ暗号化）。

サーバーが保持するのは、常に暗号化済みのデータのみです。詳しい鍵階層の図解は、後述の暗号化アーキテクチャ図を参照してください。

脆弱性を発見した場合の報告方法については、 `SECURITY.md` に従ってください。

## 関連ドキュメント

| ドキュメント | 内容 |
| ------------ | --------------------------------------------------------------------------------- |
| [要件定義書](.docs/requirements.md) | 機能要件・非機能要件、画面一覧、制約事項 |
| [詳細設計書](.docs/code-design.md) | アーキテクチャ、DBスキーマ、API設計、主要シーケンス |
| [アーキテクチャ概要](.docs/architecture.md) | コンポーネント構成、データフロー、外部連携の全体像 |
| [データモデル](.docs/architecture/data-model.md) | 主要エンティティとリレーション（ER図） |
| [セキュリティモデル](.docs/security/security-model.md) | 認証・認可・E2EE境界、セッション、WebAuthn仕様 |
| [E2EE 設計書](.docs/security/e2ee.md) | 鍵階層（Key Hierarchy）、暗号化・復号・ローテーションの詳細 |
| [脅威モデル](.docs/security/threat-model.md) | 保護対象資産、信頼境界、攻撃者モデルと防御・残存リスク |
| [テスト戦略](.docs/testing.md) | テストレイヤー、Vitest/convex-test/Playwright の責務と方針 |
| [アーキテクチャ決定記録 (ADR)](.docs/adr/001-e2ee.md) | E2EE、鍵管理、リカバリー、認可、モノレポ等の設計判断の背景・理由 |


## セットアップ

### 前提条件

- Node.js 20以上（正確なバージョンは `package.json` の `engines` フィールドに従ってください）
- pnpm
- Convexアカウント（ `npx convex login` でログイン）
- Firebaseプロジェクト（Authentication > Sign-in method で Google を有効化しておく）
- microCMSアカウント（FAQ・利用規約・プライバシーポリシー用のコンテンツAPI）
- Resendアカウント（通知メール送信用）
- Yahoo!デベロッパーネットワークのアプリケーションID（ふりがな取得用）

WebAuthn（生体認証）はHTTPS環境でのみ動作するため、ローカル開発では自己署名証明書によるHTTPSが必要です（ `vite.config.ts` に設定済み）。

### 1. 依存関係のインストール

プロジェクトルートで実行します。pnpm workspace により全ワークスペースの依存が一括インストールされます。

```
pnpm install
```

### 2. 環境変数の設定

`.env` ファイル（または `.env.local` ）に、以下の値を設定してください。

クライアント（ `VITE_` プレフィックス、ブラウザに露出する値）：

| 変数名                             | 必須 | 説明                                         |
| ------------------------------- | -- | ------------------------------------------ |
| VITE\_APP\_TITLE                | 任意 | アプリタイトル                                    |
| VITE\_FIREBASE\_API\_KEY        | 必須 | Firebase APIキー                             |
| VITE\_FIREBASE\_AUTH\_DOMAIN    | 必須 | Firebase Authドメイン                          |
| VITE\_FIREBASE\_PROJECT\_ID     | 必須 | FirebaseプロジェクトID                           |
| VITE\_FIREBASE\_STORAGE\_BUCKET | 必須 | Firebase Storageバケット                       |
| VITE\_CONVEX\_URL               | 必須 | ConvexデプロイURL（ `npx convex dev` 実行時に発行される） |

サーバー（TanStack Startのサーバー関数用）：

| 変数名                            | 必須 | 説明                                              |
| --------------------------------- | -- | ------------------------------------------------- |
| SERVER\_URL                       | 任意 | サーバーURL                                         |
| MICROCMS\_SERVICE\_DOMAIN         | 必須 | microCMSサービスドメイン                                |
| MICROCMS\_API\_KEY                | 必須 | microCMS APIキー                                  |
| CONVEX\_INTERNAL\_SECRET          | 必須 | Convex内部API保護用シークレット（下記Convex環境変数と同じ値を設定） |
| ABSTRACT\_IP\_GEOLOCATION\_API\_KEY | 任意 | Abstract API GeoIP（ログイン・監査メール位置情報取得用） |

Convex実行環境（ `npx convex env set` 等でConvex側に設定）：

| 変数名                                                            | 説明                          |
| -------------------------------------------------------------- | --------------------------- |
| FIREBASE\_SERVICE\_ACCOUNT または FIREBASE\_ADMINSDK\_CREDENTIALS | Firebase Admin初期化用サービスアカウント |
| RESEND\_API\_KEY / RESEND\_MAIL\_FROM                          | メール送信設定                     |
| YAHOO\_CLIENT\_ID                                              | ふりがな取得API用アプリケーションID        |
| CONVEX\_INTERNAL\_SECRET                                       | サーバー側の値と一致させる内部API保護用シークレット |

### 3. Convexのセットアップ

初回のみ、Convexへのログインとプロジェクトのリンクが必要です。

```
npx convex login
npx convex dev
```

`npx convex dev` はスキーマの反映とローカル開発用の同期を行い、そのまま起動しておくことでコード変更が自動反映されます（別ターミナルで起動したままにしておいてください）。

### 4. 開発サーバーの起動

別ターミナルでフロントエンドの開発サーバーを起動します（プロジェクトルートから実行）。

```
pnpm dev
```

## 利用可能なスクリプト

| コマンド              | 内容                                    |
| ----------------- | ------------------------------------- |
| `pnpm dev`        | Turborepo 経由で Web アプリの開発サーバーを起動       |
| `pnpm build`      | Turborepo 経由で全ワークスペースの本番ビルド      |
| `pnpm typecheck`  | Turborepo 経由で全ワークスペースの型チェック     |
| `pnpm check`      | Biomeによる静的解析・フォーマット（自動修正）       |
| `pnpm test`       | Turborepo 経由でテスト実行               |

実際のスクリプト名・オプションは `package.json` を正としてください。

## ディレクトリ構成

```
poohma/           … プロジェクトルート（Turborepo / pnpm workspace）
apps/
  web/            … @poohma/web（TanStack Start + Convex）
    convex/       … Convexのスキーマ・Query/Mutation/Action定義
    src/
      components/ … 共通UIコンポーネント
      routes/      … TanStack Routerのファイルベースルーティング
      lib/          … 暗号化（crypto.ts）・生体認証（biometric.ts）等のコアロジック
      hooks/        … カスタムフック
      utils/         … バリデーションスキーマ・SSRF対策等のユーティリティ
    tests/        … Vitest テスト
workers/
  backup/         … @poohma/backup（定期自動バックアップ用Cloudflare Worker）
```

詳細なディレクトリ構成は設計書の「ディレクトリ構成」章を参照してください。

## テスト

- 単体・結合テスト： `pnpm test` （Vitest）
- Convex関数のテスト：convex-testを使用
- ブラウザE2E：Playwright（暗号化・WebAuthn等、実ブラウザ挙動に依存する部分）
- コンポーネントカタログ：Storybook（a11yアドオンを含む）

暗号鍵の生成・ラップ／アンラップ処理など、セキュリティ上重要なロジックを変更した場合は、対応するテストの追加・更新を必須とします。

## デプロイ

- フロントエンドはVercelにデプロイされます。
- バックエンド（Convex）はConvex Cloudにデプロイされます。
- 自動バックアップ（Worker）はCloudflare Workersにデプロイされます（日次Cron実行、R2に90日間保持）。
- Firebase Authのリダイレクト処理は、Firebase Hostingへのリライト設定を経由します。

本番デプロイ前に、環境変数がすべて本番用の値に設定されていること、Convexのスキーマ変更が既存データと後方互換であることを確認してください。

## コントリビューション

Issue・Pull Requestを歓迎します。パスワードや暗号鍵を扱うプロジェクトの性質上、以下の点にご協力ください。

- 認証・認可・暗号化ロジックに関わる変更は、必ずテストを添えてください。
- 新しいConvex関数を追加する場合は、 `customBuilders.ts` の認可レベル（ `authenticatedQuery` / `familyBoundQuery` 等）を必ず経由してください。生のQuery/Mutationを直接使わないでください。
- UIの変更は、スマートフォンでの片手操作・タップ領域を意識してください。

## ライセンス

本プロジェクトのライセンスは未定です。利用・配布条件についてはプロジェクト管理者にご確認ください。
