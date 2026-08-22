# 家族間アカウント管理アプリ「PoohMa」詳細設計書

**プロジェクト:** PoohMa (プーマ)

## 0. 本書について

本書は「PoohMa 要件定義書」に対応する設計書である。
実際のアーキテクチャ決定記録（ADR）等が別途存在する場合はそちらを優先する。

> **命名についての注記：** リポジトリ内には本書と同名の `design.md` というファイルが別途存在するが、それはビジュアルデザイン仕様書（配色・タイポグラフィ・コンポーネントスタイリング等）であり、本書（システムアーキテクチャ・DB・API設計を扱う設計書）とは別物である。
> 混同を避けるため、本書では前者を「UIデザインシステム仕様書」と呼び、8.5章で概要を参照する。

## 1. システムアーキテクチャ概要

PoohMaは、フロントエンドとサーバーサイド処理を単一のTanStack Startアプリケーションで統合しつつ、データベース・ビジネスロジックの大部分をConvex（BaaS）に委譲する構成である。
認証はFirebase Authenticationを用い、コンテンツ管理はmicroCMS、メール送信はResendを利用する。

```
[ブラウザ]
  │  E2EE暗号化/復号 (Web Crypto API)
  │  WebAuthn (生体認証)
  │  Service Worker / IndexedDB (オフラインキャッシュ)
  ▼
[TanStack Start アプリ (Vercel)]
  ├─ SSR / ルーティング (TanStack Router)
  ├─ Server Functions
  │    ├─ syncUser / getAuthUser / logout  → Firebase Admin SDK でIDトークン検証・セッションCookie発行
  │    └─ getDashboardPrefsFn 等            → Cookieベースのユーザー設定
  ├─ ConvexReactClient (クライアント→Convexへの認証済みアクセス)
  └─ microCMS SDK 経由でFAQ／規約コンテンツ取得
  │
  ▼
[Convex Cloud]
  ├─ Query / Mutation (families / users / records)
  ├─ Action (actions.ts: OGP取得, ふりがな取得, メール送信)
  ├─ HTTP Action (http.ts: getUserByFirebaseUid ─ 内部シークレット認証)
  ├─ Cron (crons.ts: 期限切れ家族移行データの定期クリーンアップ)
  └─ 外部連携
       ├─ Resend (メール送信)
       ├─ Yahoo!テキスト解析API (ふりがな取得)
       └─ 任意の外部Webサイト (OGP取得, SSRF対策あり)

[Firebase Authentication]
  └─ auth.config.ts の Issuer (securetoken.google.com/poohma) を
     Convex側でも信頼するIDプロバイダとして設定し、
     クライアントから渡るFirebase IDトークンをConvex側でも直接検証する。
```

### 1.1 オフライン対応（PWA, FR-PWA-03）

```
Service Worker (Workbox等):
  - 静的アセット（JS/CSS/フォント）はCache Firstで配信
  - Convexへの getRecords / getRecordDetail 等の読み取り系レスポンスは、
    取得成功のたびにIndexedDB（暗号化済みのまま）へミラーリング保存する
    （passwordHintはE2EE暗号化済み、サービス名・URL・メモ・タグ・ログインID等のメタデータは
    平文としてIndexedDBへ永続化される。復号処理はブラウザメモリ上でのみ行う。6章の鍵階層は据え置き）

オフライン時の閲覧フロー:
  1. ネットワーク不通を検知（Network First失敗 or navigator.onLine）
  2. IndexedDBにミラーリングされた暗号化済みレコード一覧・詳細を表示
  3. パスコード入力 or 生体認証によりマスターキーをブラウザメモリ上に展開
     （オフライン中もPBKDF2/WebAuthn処理はローカルで完結するため実行可能）
  4. 復号したヒントを表示（新規登録・編集・共有範囲変更等の書き込み系操作は
     オフライン中は無効化し、オンライン復帰まで待機する）

オンライン復帰時:
  - Convexの最新データで IndexedDBミラーを差分更新
  - 復帰前にオフライン専用の書き込みキューは持たない（Read-onlyキャッシュとして
    設計し、書き込み競合の複雑化を避ける）
```

## 2. 技術スタック一覧

| 分類             | 技術・ライブラリ                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| フロントエンドフレームワーク | React 19, TanStack Start（SSR）                                                                                                |
| ルーティング         | TanStack Router（ファイルベースルーティング、(app)/(public)のルートグループ分割）                                                                      |
| スタイリング         | Tailwind CSS v4, shadcn/ui（radix-ui ベース）、Geist Sans／Geist Mono（ `@fontsource/geist-sans`, `@fontsource/geist-mono` 。8.5参照）   |
| 状態管理・データ取得     | TanStack Query, Convex React SDK（リアルタイムQuery/Mutation）。責務分離は8.4参照                                                            |
| 日本語処理          | budoux（禁則処理・分かち書き、和文の適切な折り返し）                                                                                                |
| UI補助           | next-themes（ライト/ダーク/システムテーマ切替）、cmdk（コマンドパレット系UI）、@icons-pack/react-simple-icons（サービスロゴアイコン）、html-react-parser（CMSリッチテキストの描画） |
| バックエンド／DB      | Convex（サーバーレス関数＋リアクティブDB）                                                                                                    |
| 認証             | Firebase Authentication（Google OAuth）＋ firebase-admin（サーバー側検証）＋ httpOnlyセッションCookie                                          |
| CMS            | microCMS（microcms-js-sdk）                                                                                                    |
| メール送信          | Resend                                                                                                                       |
| 外部API          | Yahoo!テキスト解析API（ふりがな）、任意サイトのOGPスクレイピング（cheerio）                                                                              |
| CSV処理          | papaparse                                                                                                                    |
| QRコード          | qrcode.react                                                                                                                 |
| PWA            | Web App Manifest、iOS standalone判定ロジック（自前実装）、Service Worker（Workbox等）＋IndexedDB（オフラインキャッシュ、FR-PWA-03）                         |
| PDF生成          | クライアントサイドPDF生成ライブラリ（例: jsPDF等）＋qrcode.react（リカバリーキー印刷用、FR-CRYPT-06）                                                          |
| 暗号             | Web Crypto API（AES-GCM, PBKDF2）、WebAuthn（PRF拡張）                                                                              |
| バリデーション        | zod, convex-helpers（customQuery/customMutation）                                                                              |
| 監視             | Vercel Analytics, Vercel Speed Insights                                                                                      |
| テスト            | Vitest, @testing-library/react, convex-test, Playwright（ブラウザモード）                                                             |
| コンポーネントカタログ    | Storybook                                                                                                                    |
| Lint／フォーマット    | Biome                                                                                                                        |
| デプロイ           | Vercel（フロントエンド）、Convex Cloud（バックエンド）                                                                                         |

## 3. ディレクトリ構成（抜粋）

```
convex/
  _generated/           … Convexが自動生成する型・APIクライアント
  actions.ts             … OGP取得・ふりがな取得・メール送信 (Node runtime)
  auth.config.ts          … Firebase IDトークンの信頼プロバイダ設定
  crons.ts                … 定期バッチ定義
  customBuilders.ts       … 認証・認可レベル別のQuery/Mutationビルダー
  families.ts              … 家族グループ・参加申請・家族移行ロジック
  http.ts                  … 内部HTTPエンドポイント (getUserByFirebaseUid)
  records.ts                … サービスレコードCRUD・検索・タグ・一括操作
  rls.ts                     … レコード単位アクセス制御 (requireRecordAccess)
  schema.ts                  … DBスキーマ定義
  users.ts                    … ユーザー同期・プロフィール・退会

src/
  components/            … 共通UIコンポーネント (AppHeader, PasscodeProvider 等)
  env/                    … クライアント/サーバー環境変数スキーマ (t3-env)
  hooks/                  … usePersistentQuery, useConvexFirebaseAuth, use-export-csv 等
  lib/                    … crypto.ts (E2EE), biometric.ts (WebAuthn), cms.server.ts
  routes/
    (app)/                … 認証必須ルート群 (dashboard, records, family, settings)
    (public)/              … 公開ルート群 (LP, usage, faq, login, 規約等)
    __root.tsx              … 全体レイアウト・グローバルProvider
  services/                … サーバー関数 (auth.functions.ts, cms.functions.ts, prefs.functions.ts,
                                firebase-admin.server.ts)
  utils/                    … schemas.ts (zod), url-safety.ts (SSRF対策), csv-sanitize.ts,
                                index-group.ts (五十音インデックス), chunk-processor.ts
```

## 4. データベース設計（Convexスキーマ）

### 4.1 ER概要（テキスト表現）

```
families 1 ── * users            (users.familyId → families._id)
families 1 ── * serviceRecords    (serviceRecords.familyId → families._id)
families 1 ── * joinRequests       (joinRequests.familyId → families._id)
families 1 ── * familyMigrations    (familyMigrations.targetFamilyId / sourceFamilyId → families._id)
users     1 ── * serviceRecords      (serviceRecords.userId = users.userId, 文字列参照)
users     1 ── * joinRequests         (joinRequests.userId = users.userId, 文字列参照)
serviceRecords 1 ── * credentials(内包配列)
```

### 4.2 テーブル定義

#### families

| フィールド                      | 型                | 説明                                                                                |
| -------------------------- | ---------------- | --------------------------------------------------------------------------------- |
| name                       | string           | 家族グループ名                                                                           |
| masterKeyEncrypted         | string(optional) | パスコード由来鍵でラップされたマスターキー（Base64）                                                     |
| masterKeyIv                | string(optional) | 上記ラップ処理のIV（Base64）                                                                |
| masterKeySalt              | string(optional) | パスコードからの鍵導出（PBKDF2）に使うソルト（Base64）                                                 |
| kdfIterations              | number           | パスコード鍵導出（PBKDF2）の反復回数。作成・パスコード変更時点の値を記録し、復号時はこの値を動的に適用する（NFR-SEC-14）。デフォルト300,000 |
| masterKeyRecoveryEncrypted | string(optional) | リカバリーキー由来鍵でラップされたマスターキー（Base64、FR-CRYPT-06）                                       |
| masterKeyRecoveryIv        | string(optional) | 上記ラップ処理のIV（Base64）                                                                |
| recoveryKeyIssuedAt        | number(optional) | リカバリーキー発行・再発行日時                                                                   |
| updatedAt                  | number           | 更新日時（epoch ms）                                                                    |

#### users

1つのFirebase User (`userId`) に対して複数のPoohMa Account（`_id: Id<"users">`）を保持可能（1:N）。各レコードが独立した所属家族（`familyId`）・表示名・プロファイル・暗号化境界を持ちます。

| フィールド       | 型                      | 説明                                                                  |
| ----------- | ---------------------- | ------------------------------------------------------------------- |
| userId      | string                 | Firebase UID（複数のusersレコードで同一の値を取りうる）                          |
| email       | string                 | メールアドレス                                                             |
| displayName | string(optional)       | 表示名（アカウント識別子としても機能。createAccountで必須、syncUserでは初期補完に使用） |
| photoURL    | string(optional)       | プロフィール画像URL                                                         |
| familyId    | Id<families>(optional) | 所属家族グループ（アカウントごとに独立）                                                |
| createdAt   | number(optional)       | 作成日時                                                                |
| updatedAt   | number                 | 更新日時                                                                |

インデックス: by\_userId, by\_email, by\_familyId

#### familyMigrations

| フィールド                   | 型                                                   | 説明                                                                                                   |
| ----------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| userId                  | string                                              | 移行を実行したユーザー                                                                                          |
| sourceFamilyId          | Id<families>(optional)                              | 移行元家族（未所属からの移行時はnull）                                                                                |
| targetFamilyId          | Id<families>                                        | 移行先家族                                                                                                |
| serviceRecordIds        | Id<serviceRecords>\[]                               | 移行対象レコードIDのスナップショット                                                                                  |
| recordUpdatedAtSnapshot | {recordId, updatedAt}\[](optional)                  | 各レコードのfetch時点のupdatedAtを保持する配列（楽観的ロック用のバージョンスナップショット。要素は{recordId: Id<serviceRecords>, updatedAt: number}） |
| processedRecordIds      | Id<serviceRecords>\[](optional)                     | 処理済みレコードIDの配列（バッチ失敗時の再開カーソル。未処理レコードはserviceRecordIds差分で特定し、レジューム可能にする）                              |
| status                  | "PREPARED" \| "COMPLETED" \| "EXPIRED" \| "ABORTED" | 移行処理の状態                                                                                              |
| createdAt               | number                                              | 作成日時                                                                                                 |
| expiresAt               | number                                              | 有効期限（作成から30分後）                                                                                       |

インデックス: by\_userId, by\_status

#### joinRequests

| フィールド                 | 型                                     | 説明                    |
| --------------------- | ------------------------------------- | --------------------- |
| familyId              | Id<families>                          | 申請対象の家族               |
| userId                | string                                | 申請者の Firebase UID     |
| accountId             | Id<users>(optional)                   | 申請元の PoohMa Account ID |
| status                | "pending" \| "approved" \| "rejected" | 申請状態                  |
| createdAt / updatedAt | number                                | 作成・更新日時               |

インデックス: by\_familyId\_status, by\_userId\_status, by\_familyId\_userId, by\_accountId\_status, by\_familyId\_accountId

#### serviceRecords

| フィールド                       | 型                                   | 説明                                                                                                                                               |
| --------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| title                       | string                              | サービス名                                                                                                                                            |
| titleReading                | string(optional)                    | 読み仮名（五十音インデックス用）                                                                                                                                 |
| sortKey                     | string(optional)                    | 五十音順・アルファベット順ソートキー（グループ順位 2 桁ゼロ埋めプレフィックス + NFKC/ひらがな正規化文字列）。backfill 完了までは optional |
| url                         | string(optional)                    | サービスURL                                                                                                                                          |
| ogpImage / ogpDescription   | string(optional)                    | OGP自動取得結果                                                                                                                                        |
| customIcon                  | string(optional)                    | ファビコン取得失敗時のフォールバック表示（絵文字＋カラーコード等、FR-REC-19）                                                                                                      |
| memo                        | string(optional)                    | メモ（最大10,000文字）                                                                                                                                   |
| ownerType                   | ("user" \| "family")(optional)      | 所有者種別（"user": 個人所有, "family": 家族共有）。backfill 完了までは optional                                                                   |
| ownerFamilyId               | Id<families>(optional)              | 共有レコードが属する家族ID（ownerType === "family" の場合）                                                                                        |
| admins                      | Id<users>[](optional)               | レコード管理者（PoohMa accountId）配列。共有解除や削除、管理者変更権限を持つ。backfill 完了までは optional                                         |
| userId                      | string                              | 作成者の Firebase UID                                                                                                                                |
| accountId                   | Id<users>                           | 作成者の PoohMa Account ID（所有権・個人レコード境界）                                                                                                     |
| familyId                    | Id<families>(optional)              | 暗号化スコープ・所属家族ID                                                                                                                          |
| credentials                 | object\[]                           | 認証情報配列（下記、最大10件）                                                                                                                                 |
| tags                        | string\[]                           | タグ                                                                                                                                               |
| isPinned                    | boolean                             | ピン留め状態（デフォルトfalse、FR-REC-18）                                                                                                                     |
| isArchived                  | boolean                             | アーカイブ（非表示）状態（デフォルトfalse、FR-REC-23）                                                                                                               |
| needsUpdate                 | boolean                             | 「要更新」フラグ（デフォルトfalse、FR-REC-17）                                                                                                                   |
| updateRequestedBy           | string(optional)                    | 更新リクエストを送ったユーザーID                                                                                                                                |
| updateRequestedAt           | number(optional)                    | 更新リクエスト日時                                                                                                                                        |
| lastViewedAt / lastViewedBy | number(optional) / string(optional) | 直近の閲覧日時・閲覧者（FR-REC-16、簡易サマリ用。詳細な履歴は recordAccessLog を参照）                                                                                         |
| updatedAt                   | number                              | 更新日時                                                                                                                                             |

インデックス: by\_family\_sortKey, by\_ownerType\_accountId, by\_ownerType\_ownerFamilyId, by\_userId, by\_accountId

credentials要素：

| フィールド                    | 型                | 説明                                       |
| ------------------------ | ---------------- | ---------------------------------------- |
| id                       | string           | UUID                                     |
| label                    | string(optional) | 認証情報ラベル（平文）                              |
| loginId                  | string(optional) | ログインID（平文でサーバーに保存される）                   |
| passwordHint             | string(optional) | 暗号化済みパスワードヒント（Base64、E2EE暗号化対象）          |
| passwordHintIv           | string(optional) | 上記暗号化のIV                                |
| passwordHintDekEncrypted | string(optional) | マスターキーでラップされたDEK                         |
| passwordHintDekIv        | string(optional) | DEKラップ処理のIV                             |

#### recordAccessLog（新設、FR-REC-16）

| フィールド     | 型                     | 説明        |
| --------- | --------------------- | --------- |
| recordId  | Id<serviceRecords>    | 対象レコード    |
| userId    | string                | 操作者       |
| action    | "VIEWED" \| "UPDATED" | 閲覧か更新かの区分 |
| createdAt | number                | 発生日時      |

インデックス: by\_recordId（新しい順に取得しタイムラインを表示）。一定期間分（例：直近50件）を超えたログは、レコード削除時と合わせてバッチで間引く運用を想定。

#### recordEditingSessions（新設、FR-REC-15）

| フィールド           | 型                  | 説明         |
| --------------- | ------------------ | ---------- |
| recordId        | Id<serviceRecords> | 編集中のレコード   |
| userId          | string             | 編集中のユーザー   |
| lastHeartbeatAt | number             | 最終ハートビート日時 |

インデックス: by\_recordId。編集画面を開いている間、クライアントが一定間隔（例：15秒）でハートビートを送信して行を作成・更新し、画面を離れる・一定時間ハートビートが途絶えた場合はレコードを削除する。他メンバーはこのテーブルをConvexのリアクティブクエリで購読し、「編集中」表示に用いる（詳細は9.6）。

## 5. 認証・認可設計

### 5.1 ログイン〜セッション確立フロー

```
1. ユーザーが /login で「Googleでログイン」をクリック
2. Firebase Authentication (signInWithRedirect) によりGoogle認証画面へ遷移
3. リダイレクト復帰後、onAuthStateChangedでFirebase Userを検知
4. ID トークンを取得し、Server Function `syncUser` へ送信
5. サーバー側 (firebase-admin.server.ts) がIDトークンを検証 (adminAuth().verifyIdToken)
6. Convex Mutation `users.syncUser` によりConvex usersテーブルへユーザー情報を同期
   (同一UIDが無く同一emailが既存の場合、かつそのメールアドレスが確認済み(emailVerified)の場合に限り、
    旧UIDのserviceRecordsのuserIdを新UIDへ一括付け替える。emailVerifiedがfalseの場合はマージせず、
    新規ユーザーとして作成する)
7. `createSessionCookie` によりFirebaseセッションCookie(14日間, httpOnly, secure(本番), SameSite=Lax) を発行
8. 以後の各ページロード時、__root.tsx の beforeLoad が Server Function `getAuthUser` を呼び出し、
   セッションCookieの検証 → Convex HTTP Action `getUserByFirebaseUid` (内部シークレット認証) で
   最新のユーザー情報・所属家族情報を取得し、ルーターコンテキストへ格納する。
```

### 5.2 クライアント→Convexの認証連携

```
ConvexReactClient は ConvexProviderWithAuth でラップされ、
useConvexFirebaseAuth フックが fetchAccessToken として Firebase の
現在の IDトークン (auth.currentUser.getIdToken) を供給する。
Convex 側は auth.config.ts の Issuer 設定 (securetoken.google.com/poohma) により
渡されたトークンを直接検証する。
```

### 5.3 認可レベル（Convexカスタムビルダー: convex/customBuilders.ts）

| ビルダー                             | チェック内容                                    | 用途                        |
| -------------------------------- | ----------------------------------------- | ------------------------- |
| identityVerifiedQuery / Mutation | Firebase Identity の存在のみ検証                 | ユーザー新規同期処理など              |
| authenticatedQuery / Mutation    | Identity検証 + `resolveAccount` によるアカウント解決（所有権検証） | 一般的な認証必須API               |
| familyBoundQuery / Mutation      | 上記 + 対象アカウントの `user.familyId` が設定されていること | 家族所属が前提の機能（招待承認、家族固有クエリ等） |

#### アカウント解決（resolveAccount）の仕組み
`authenticatedQuery` / `authenticatedMutation` / `familyBoundQuery` / `familyBoundMutation` は共通引数として `accountId?: v.optional(v.id("users"))` をサポートします。
1. `accountId` が明示的に渡された場合：
   - DB から当該 `users` レコードを取得。
   - `user.userId === identity.subject`（ログイン中 Firebase UID）であることを検証（IDOR 防止）。不一致の場合は `Unauthorized` 例外を送出。
2. `accountId` が省略された場合：
   - ログイン中 Firebase UID に紐づく先頭の `users` レコードへ自動フォールバック（下位互換性確保）。

生のConvex `query` / `mutation` を直接エクスポートすることは禁止し、必ず上記のカスタムビルダーを経由する。実装例（ `convex/records.ts` の `updateRecord` ）：

```
export const updateRecord = familyBoundMutation({
  args: { id: v.id("serviceRecords"), data: ConvexRecordInputSchema },
  handler: async (ctx, args) => {
    // 認証と家族所属チェック・対象アカウント解決は familyBoundMutation により自動化済み
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");

    // RLSバリデーターによる認可検証（5.4）
    requireRecordAccess(ctx.user, record);

    await ctx.db.patch(args.id, { ...args.data, updatedAt: Date.now() });
  },
});
```

### 5.4 レコード単位アクセス制御（convex/rls.ts）

```
requireContentAccess(user, record):
  // 家族境界チェック（レコードが家族に属している場合、ユーザーも同一家族でなければならない）
  if record.familyId !== undefined && record.familyId !== user.familyId:
    Access denied エラーを送出

  // 閲覧・編集権限チェック: 家族共有レコード、または本人の個人レコード
  isOwner = record.ownerType === "user" && record.accountId === user._id
  isFamilyShared = record.ownerType === "family" && record.ownerFamilyId === user.familyId
  isOwner または isFamilyShared でなければ Access denied エラーを送出

requireAdminAccess(user, record):
  // 削除・共有解除・管理者変更権限チェック
  if record.ownerType === "user":
    if record.accountId !== user._id:
      Access denied エラーを送出
  else: // ownerType === "family"
    if record.ownerFamilyId !== user.familyId || !(record.admins ?? []).includes(user._id):
      Access denied エラーを送出

サーバー側の getRecordDetail / updateRecord は requireContentAccess、
deleteRecord / deleteRecords / unshareRecord / addRecordAdmin / removeRecordAdmin は requireAdminAccess を必ず経由する。
```

### 5.5 セッション失効時の入力保護（FR-AUTH-07）

```
ConvexReactClient / TanStack Query の Mutation実行を共通ラッパーでインターセプトし、
認証エラー（セッションCookie失効・IDトークン失効）を検知した場合：
  1. 実行しようとしていたMutationの引数（フォーム入力内容）とクライアント生成の
     idempotency key（UUID等）をReact State上に保持したまま、
     画面を覆う再ログインモーダルを表示する（入力欄はアンマウントしない）
  2. 再ログイン（Firebase再認証 → syncUser → セッションCookie再発行）が完了した時点で、
     保持しておいた引数と同一のidempotency keyを用いて元のMutationを自動的に再実行する
  3. サーバー側は、createRecord / updateRecord / importRecords 等の書き込みMutationに対して
     idempotency keyを受け取り、既に同一キーで処理済みの場合は再実行せず既存結果を返却する
     （初回リクエストがサーバー到達前にタイムアウトした場合のみ再実行し、
     サーバー処理済み・レスポンス欠落の場合は既存結果を再利用して重複作成・通知を防ぐ）
  4. 再実行が成功した時点でモーダルを閉じ、通常のフィードバック（トースト等）を表示する

本フローはフォーム保存系Mutation（createRecord / updateRecord / importRecords 等）に対して
共通的に適用できるよう、Mutation呼び出しの共通フックとして実装する。
```

### 5.6 ログアウトとセッション復元制御（FR-AUTH-04）

```
ログアウトフロー：
  1. クライアント側（UserMenu / FamilyComponent 等）で sessionStorage にログアウトフラグ（LOGOUT_FLAG_KEY = "poohma_logout"）を設定
  2. Firebase Auth の signOut(auth) を実行
  3. サーバー関数 logout() を呼び出し：
     - 現在のセッションCookieから uid を検証し、Firebase Admin SDK の revokeRefreshTokens(uid) でリフレッシュトークンを即時失効
     - 発行時と同一属性（path, httpOnly, secure, sameSite）でセッションCookieを削除（deleteCookie および maxAge: 0）
  4. クエリキャッシュ（clearQueryCache / queryClient）を全クリア

サイレント再認証・セッション復元制御（useConvexFirebaseAuth）：
  - 認証状態の監視において、未認証時にサーバー側セッションCookieを用いたサイレント再認証（getCustomTokenFromSession）を行う
  - ただし sessionStorage に LOGOUT_FLAG_KEY が存在する場合はログアウト状態と判定し、サイレント再認証をスキップして即時未認証状態（isAuthenticated=false）に確定させる
  - ユーザーが明示的に再ログインに成功した時点で LOGOUT_FLAG_KEY を削除する
```

## 6. 暗号化設計（E2EE）

### 6.1 鍵階層

```
家族パスコード（各メンバーが記憶する秘密情報。サーバー保存なし）
  │  PBKDF2 (SHA-256, iterations=families.kdfIterations（既定300,000。NFR-SEC-14により
  │           復号時は都度DBの値を動的に適用し、将来の反復回数引き上げ後も
  │           旧パラメータで作成された既存データを復号可能にする）,
  │           salt=families.masterKeySalt)
  ▼
パスコード導出鍵（AES-GCM 256, wrapKey/unwrapKey用途）
  │  unwrapKey（サーバーに保存された families.masterKeyEncrypted / masterKeyIv を復号）
  ▼
マスターキー（家族グループ共通, AES-GCM 256）
  │  認証情報ごとに generateDEK() で新規生成した鍵を wrapKey
  ▼
DEK（Data Encryption Key, 認証情報1件ごと, AES-GCM 256）
  │  encrypt(passwordHint, DEK)
  ▼
暗号化済みパスワードヒント（serviceRecords.credentials[].passwordHint / passwordHintIv として保存）

マスターキー自体は families.masterKeyEncrypted / masterKeyIv として保存され、
DEKは serviceRecords.credentials[].passwordHintDekEncrypted / passwordHintDekIv として保存される
（封筒暗号化 / Envelope Encryption 方式）。

【リカバリー経路（FR-CRYPT-06）】
同じマスターキーに対して、パスコード経路とは別に、リカバリーキー由来鍵でラップした
もう一つの入口を用意する（6.6参照）。
  リカバリーキー（高エントロピーなランダム文字列。サーバー保存なし・発行時に一度だけ提示） 
    │  HKDF-SHA256（高エントロピーなためPBKDF2の重い反復は不要）
    ▼
  リカバリーキー導出鍵
    │  unwrapKey（families.masterKeyRecoveryEncrypted / masterKeyRecoveryIv を復号）
    ▼
  マスターキー（パスコード経路と同一のものに到達する）
```

備考：DEKが存在しない旧形式のレコード（passwordHintDekEncrypted未設定）については、
decryptHint/encryptHint 側でマスターキー直接暗号化にフォールバックする実装になっている
（過去バージョンとの互換維持）。

### 6.2 実装関数（src/lib/crypto.ts, src/utils/passcode-strength.ts）

| 関数 / コンポーネント                               | 役割                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| deriveKeyFromPasscode(passcode, salt)       | PBKDF2でパスコード導出鍵を生成                                                                    |
| generateMasterKey() / generateDEK()         | AES-GCM鍵の新規生成                                                                         |
| wrapMasterKey / unwrapMasterKey             | マスターキーのラップ／アンラップ                                                                    |
| wrapDEK / unwrapDEK                         | DEKのラップ／アンラップ（マスターキーで）                                                                |
| encrypt / decrypt                           | AES-GCMによる汎用の暗号化／復号（IV自動生成）                                                           |
| generateSalt                                | PBKDF2用ソルトの生成                                                                         |
| evaluatePasscodeStrength(passcode)          | `@zxcvbn-ts` を用いたパスコード強度判定（最低10文字、zxcvbnスコア2以上、推測耐性チェック）                           |
| PasscodeStrengthMeter                       | パスコード入力時の強度メーターUI（プログレスバー・強度ラベル表示）                                                  |

#### パスコード誤入力時の指数バックオフと一時ロックアウト（`PasscodeProvider.tsx`）

- パスコード解除の誤入力を検知し、連続失敗回数（`failedAttempts`）をカウント。
- 3回以上連続で失敗した場合は指数バックオフ（$2^{n-3}$ 秒、最大30秒）による遅延（`lockoutUntil`）を適用し、ロックアウト期間中は送信ボタンを非活性化してトースト通知を表示。
- パスコード解除成功時に失敗カウントおよびロックアウト状態をリセット。

### 6.3 生体認証（WebAuthn PRF拡張, src/lib/biometric.ts）

登録フロー：

```
1. isBiometricSupported() でプラットフォーム認証器の利用可否を確認
   （PublicKeyCredential.isConditionalMediationAvailable 等によるバックグラウンド判定を含み、
    実際にWebAuthnの儀式（顔・指紋スキャン）を開始する前に非対応を検知する。FR-BIO-05）
   → 非対応の場合はエラー画面を出さず、案内メッセージとともにパスコード手入力の
     ダイアログへそのまま遷移する（同一のUIフローの入口を共有し、ユーザーからは
     「対応端末では生体認証、非対応端末ではパスコードが最初から出る」ように見える）
2. navigator.credentials.create() を PRF拡張 (extensions.prf.eval.first = ランダムsalt) 付きで実行
3. 取得したPRF出力をAES-GCM鍵としてインポート
4. 平文のパスコードをそのAES-GCM鍵で暗号化
5. { credentialId, encryptedPasscode, iv, prfSalt } を idb-keyval (IndexedDB) に
   ユーザーIDをキーとして保存（サーバーへは送信しない）
```

認証（ロック解除）フロー：

```
1. navigator.credentials.get() を、登録時と同一のprfSaltを指定して実行
2. 得られたPRF出力でAES-GCM鍵を復元
3. 保存済み encryptedPasscode を復号し、平文パスコードを取得
4. 通常の unlock(passcode) フロー（6.1のPBKDF2以降）に合流し、マスターキーを展開
```

### 6.4 家族移行時の再暗号化フロー

```
1. prepareFamilyMigration Mutation
   - 移行先家族ID (targetFamilyId) を確定 (新規作成 or 承認済み参加申請の家族)
   - 呼び出しユーザーの既存 serviceRecords ID一覧・各レコードの updatedAt をスナップショットし、
     familyMigrations レコードを status=PREPARED, expiresAt=作成+30分 で作成
     （recordUpdatedAtSnapshot フィールドに各レコードIDをキーとしたupdatedAtマッピングを保存し、
     後続のcommit時に楽観的ロックの前提条件として検証する）
   - 呼び出し時点で残っている自分の他のPREPARED移行は先にEXPIRED化しクリーンアップ

2. getMigrationForEncryption Query
   - 対象レコードの暗号化済みDEK・パスワードヒント・IV一覧をクライアントへ返却

3. クライアント側の再暗号化処理 (family.tsx)
   - DEKが存在する認証情報：旧マスターキーでDEKをunwrap → 新マスターキーでDEKを再wrap
     （パスワードヒント本体は再暗号化不要、DEKの付け替えのみ）
   - DEKが存在しない旧形式：旧マスターキーで直接ヒントを復号 → 新DEK生成 →
     新DEKでヒントを再暗号化 → 新マスターキーでDEKをwrap

4. commitFamilyMigration Mutation（NFR-AVAIL-03/04対応：バッチ分割・楽観的ロック）
   - 再暗号化済みcredentialsを、1回あたり20〜50件程度のバッチに分割して複数回のMutation呼び出しで送信する
     （通信断・Convexのペイロード／実行時間制限に対する耐性を確保。familyMigrationsに
      processedRecordIds を保持し、失敗時は未処理分から再送してレジューム可能にする）
   - 各バッチのレコード更新時、対象レコードの updatedAt が 1. のrecordUpdatedAtSnapshotで
     スナップショットされた値と一致することを前提条件として検証する（楽観的ロック）。
     不一致の場合は当該レコードの更新を拒否し、「移行中に他メンバーが更新したため再取得が必要」として
     呼び出し元へ返す
   - 各バッチ成功時、処理済みレコードIDを processedRecordIds へ追記し、
     次回レジューム時はserviceRecordIds との差分を未処理レコードとして特定する
   - 全バッチ成功後、ユーザーのfamilyIdを更新、参加申請があれば削除
   - 移行元家族が空（メンバー0・レコード0）になった場合は削除
   - familyMigrationsのstatusをCOMPLETEDに更新

5. 失敗時：abortFamilyMigration Mutationで明示的中断、または放置時はCronで自動EXPIRED化
   （バッチ途中で中断した場合、processedRecordIdsを参照し、serviceRecordIdsとの差分を
    未処理レコードとして再開する。未処理のレコードは旧familyId・旧鍵のまま残るため、
    レジューム時は差分のみを再暗号化・送信する）
```

### 6.5 パスコードのみのローテーション（FR-FAM-10）

```
家族グループを変えずにパスコードだけを変更する場合、マスターキー自体は変更しない
（6.4の家族移行のようにDEK・パスワードヒントの再暗号化は不要）。

1. 新パスコードを入力（確認一致・強度チェック、NFR-SEC-13）
2. クライアント側で新しいソルトを生成し、新パスコードから新しい導出鍵を生成
3. 展開済みの現在のマスターキー（アンロック済み前提。未展開の場合は旧パスコードでの
   アンロックを先に要求する）を、新しい導出鍵で再wrap
4. Mutation families.rotatePasscode を呼び出し、以下のみを更新する：
   masterKeyEncrypted / masterKeyIv / masterKeySalt / kdfIterations
   （各レコードのcredentials・DEK・passwordHintは一切変更しない。
   DEKはマスターキーでラップされており、マスターキー自体は不変であるため、
   パスコード由来鍵の変更はDEKに影響しない。O(1)で完了する軽量な操作）
5. リカバリーキーが発行済みの場合、masterKeyRecoveryEncrypted 等は
   同一マスターキーへの別経路のラップであるため、本操作による影響を受けず有効なまま残る

注記：現行実装では rotatePasscode Mutation は未実装であり、パスコード変更は
家族移行フロー（6.4）経由で新家族（同一家族ID）を作成する形で代替している。
```

### 6.6 リカバリーキー（復元コード, FR-CRYPT-06）

```
発行フロー：
  1. crypto.getRandomValues 等で高エントロピーなリカバリーキー（例：4〜6文字ブロック×5個の英数字）
     を生成し、画面上に一度だけ表示する（再表示不可。サーバーには平文はもちろん、
     導出可能な形でも一切送信しない）
  2. リカバリーキーからHKDF-SHA256でAES-GCM鍵（リカバリーキー導出鍵）を導出
  3. 展開済みのマスターキーをリカバリーキー導出鍵でwrapし、
     masterKeyRecoveryEncrypted / masterKeyRecoveryIv としてサーバーへ送信・保存
  4. リカバリーキーの文字列とQRコード（qrcode.react）をA4印刷用レイアウトのPDF
     （jsPDF等でクライアントサイド生成）としてダウンロードさせる
  5. PDF保存後、リカバリーキーの平文はサーバー・アプリのメモリ・IndexedDBからすべて消去され、
     再表示できないことを画面上で明示する。ダウンロードされたPDFのみが唯一の保管媒体となるため、
     安全な保管と管理はユーザーの責任範囲であることをUI上で案内する

利用（パスコード忘却時の復旧）フロー：
  1. 「パスコードを忘れた場合」導線からリカバリーキー入力画面へ
  2. 入力されたリカバリーキーからリカバリーキー導出鍵を導出
  3. families.masterKeyRecoveryEncrypted / masterKeyRecoveryIv をunwrapし、マスターキーを復元
  4. 復元したマスターキーを、新たに入力させたパスコードで再wrapし、6.5と同様の
     rotatePasscode 相当の処理でmasterKeyEncrypted等を更新する
     （リカバリーによって同時にパスコードの再設定も完了させる）

再発行：
  - リカバリーキーは使い切り前提とはせず、設定画面から任意のタイミングで再発行できる
  - 再発行時は、展開済みマスターキーを新しいリカバリーキー由来鍵で再wrapし、
    masterKeyRecoveryEncrypted等を上書きする（旧リカバリーキーは以後無効になる）
```

## 7. API設計（Convex Functions一覧）

### 7.1 convex/users.ts

| 関数                   | 種別            | 認可               | 概要                                                                                                    |
| -------------------- | ------------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| syncUser             | Mutation      | identityVerified | ログイン時のユーザー情報同期（新規作成／UID引き継ぎ／プロフィール更新）。別UID引き継ぎ時は `joinRequests` や `familyMigrations` も新UIDへ付け替えて孤児化を防止する |
| updateProfile        | Mutation      | authenticated    | 表示名の更新                                                                                                |
| deleteAccount        | Mutation      | authenticated    | 退会処理（所有レコード削除、家族最終メンバー時は家族も削除）                                                                          |
| getUserByFirebaseUid | InternalQuery | 内部限定             | UIDからユーザー＋所属家族情報を取得（HTTP Action経由）                                                                    |
| getUserById          | InternalQuery | 内部限定             | Convex内部IDからユーザー＋家族情報を取得                                                                                |

### 7.2 convex/families.ts

| 関数                                     | 種別               | 認可            | 概要                                                                                                                    |
| -------------------------------------- | ---------------- | ------------- | --------------------------------------------------------------------------------------------------------------------- |
| getFamilyMembers                       | Query            | authenticated | 自分の所属家族のメンバー一覧取得                                                                                                      |
| createFamily                           | Mutation         | authenticated | 家族グループ新規作成＋通知メール送信                                                                                                    |
| joinFamily                             | Mutation         | authenticated | 承認済み参加申請をもとに家族へ参加確定                                                                                                   |
| getFamilyInfoByInviteCode              | Query            | authenticated | 招待コードから家族の暗号鍵情報を取得（メンバー or 承認済み申請者のみ）                                                                                 |
| getFamilyPublicInfo                    | Query            | authenticated | 招待コードから家族名等の公開情報のみ取得                                                                                                  |
| createJoinRequest                      | Mutation         | authenticated | 参加申請の送信＋既存メンバーへの通知メール                                                                                                 |
| cancelJoinRequest                      | Mutation         | authenticated | 自分の保留中申請のキャンセル                                                                                                        |
| getMyJoinRequest                       | Query            | authenticated | 自分の申請状況取得                                                                                                             |
| dismissRejectedRequest                 | Mutation         | authenticated | 却下された申請の削除（確認）                                                                                                        |
| getPendingRequests                     | Query            | familyBound   | 自家族への保留中申請一覧                                                                                                          |
| approveJoinRequest / rejectJoinRequest | Mutation         | familyBound   | 申請の承認／却下＋通知メール                                                                                                        |
| prepareFamilyMigration                 | Mutation         | authenticated | 家族移行の準備（PREPARED状態の作成とレコード更新スナップショットの保持）                                                                               |
| getMigrationForEncryption              | Query            | authenticated | 移行対象データ（暗号化済みDEK等）の取得                                                                                                 |
| commitFamilyMigration                  | Mutation         | authenticated | 移行の確定（再暗号化データの反映）。prepare時点とcommit時点のレコード一覧を照合する楽観的ロック（競合検知）を適用                                                         |
| abortFamilyMigration                   | Mutation         | authenticated | 移行の中断                                                                                                                 |
| changeFamily                           | Mutation         | authenticated | 準備・確定を一括で行う簡易版の家族変更                                                                                                   |
| rotatePasscode                         | Mutation         | familyBound   | パスコードのみの変更（masterKeyEncrypted/Iv/Salt/kdfIterationsのみ更新、6.5）                                                            |
| issueRecoveryKey                       | Mutation         | familyBound   | リカバリーキーの発行／再発行（masterKeyRecoveryEncrypted等を保存、6.6）                                                                    |
| recoverWithRecoveryKey                 | Mutation         | authenticated | リカバリーキー経由でのマスターキー復元後、新パスコードでの再wrap結果を保存（6.6）                                                                          |
| getRecordsForReEncryption              | Query            | familyBound   | 再暗号化対象データ取得（家族所属前提）                                                                                                   |
| cleanupExpiredMigrationsInternal       | InternalMutation | 内部限定（Cron）    | 期限切れ移行データの自動クリーンアップ                                                                                                   |

### 7.3 convex/records.ts

| 関数                                                                | 種別           | 認可            | 概要                                                                                                                                                      |
| ----------------------------------------------------------------- | ------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| getRecords                                                        | Query        | authenticated | 一覧取得。家族所属時は by\_family\_sortKey インデックスで同一家族レコードを取得し、非所属時は by\_ownerType\_accountId で個人レコードを取得。フルテーブルスキャンを完全排除（Issue #137）。検索・タグ・所有者フィルタ・並び替えに対応。既定でisArchived=falseのみ返す |
| getArchivedRecords                                                | Query        | authenticated | アーカイブ済みレコードの一覧取得（FR-REC-23）                                                                                                                             |
| getRecordDetail                                                   | Query        | authenticated | 詳細取得（rls.tsによるrequireContentAccess制御）。取得時にrecordAccessLogへVIEWEDを記録し、lastViewedAt/Byを更新                                                                     |
| getAvailableTags                                                  | Query        | authenticated | 閲覧可能レコードから使用中タグ一覧を抽出（by\_family\_sortKey経由）                                                                                                    |
| getOwnedRecords                                                   | Query        | authenticated | 自分が管理可能な全レコード取得（個人レコード＋自分が管理者の共有レコード、CSVエクスポート用）                                                                                       |
| shareRecord                                                       | Mutation     | familyBound   | ワンタップで個人レコードを家族共有レコード（ownerType: "family", admins: [user._id]）に昇格                                                                                  |
| unshareRecord                                                     | Mutation     | familyBound   | ワンタップで共有レコードを個人レコード（ownerType: "user", admins: []）に戻す（管理者限定）                                                                                 |
| addRecordAdmin / removeRecordAdmin                                | Mutation     | familyBound   | 共有レコードの共同管理者の追加・解除（管理者限定）                                                                                                                           |
| bulkShareRecords / bulkUnshareRecords                             | Mutation     | familyBound   | 選択した個人レコードの一括共有 / 共有レコードの一括共有解除                                                                                                                 |
| previewCsvImport                                                  | Query/Action | familyBound   | インポート予定のCSV行と既存データ（URL＋タイトルで突合）を比較し、行ごとに新規／上書き／スキップを判定して返す（FR-CSV-07、9.7参照）                                                                             |
| createRecord                                                      | Mutation     | familyBound   | レコード新規作成（zodによるサーバー再検証、sortKey自動算出、ownerType: "user" \| "family"、credentials最大10件チェック）                                                                   |
| updateRecord                                                      | Mutation     | familyBound   | レコード更新（rls.tsチェック、sortKey再算出、共有解除時は管理者権限を要求）                                                                                                 |
| deleteRecord / deleteRecords                                      | Mutation     | familyBound   | 単体／一括削除（requireAdminAccessチェック、非管理者の共有レコード削除を防止）                                                                                              |
| importRecords                                                     | Mutation     | familyBound   | CSVインポート（最大500件、家族内メールアドレスの厳格突合、行ごとのバリデーション結果を返却）                                                                                |
| bulkUpdateRecords                                                 | Mutation     | familyBound   | 一括タグ付与／所有設定変更（所有設定変更は確認モーダルを経由）                                                                                                              |
| togglePin                                                         | Mutation     | familyBound   | isPinnedの切り替え（FR-REC-18）                                                                                                                                |
| archiveRecord / unarchiveRecord                                   | Mutation     | familyBound   | isArchivedの切り替え（FR-REC-23）                                                                                                                              |
| requestUpdate                                                     | Mutation     | familyBound   | needsUpdate等を設定し、オーナーへ通知メールを送信（FR-REC-17）                                                                                                               |
| resolveUpdateRequest                                              | Mutation     | familyBound   | レコード編集保存時にneedsUpdateを自動解除                                                                                                                              |
| mergeTags                                                         | Mutation     | familyBound   | 指定タグ名を持つ自分の閲覧可能レコード群のtags配列を一括置換（FR-REC-22）                                                                                                             |
| getRecordAccessLog                                                | Query        | authenticated | 対象レコードのrecordAccessLogをタイムラインとして取得（rls.tsチェック、FR-REC-16）                                                                                                |
| startEditingSession / heartbeatEditingSession / endEditingSession | Mutation     | familyBound   | recordEditingSessionsの作成・更新・削除（FR-REC-15）                                                                                                               |
| getActiveEditors                                                  | Query        | familyBound   | 対象レコードを編集中のユーザー一覧を取得（Convexのリアクティブクエリでクライアントが購読）                                                                                                        |

### 7.4 convex/actions.ts（Node runtime, "use node"）

| 関数                               | 種別               | 認可                   | 概要                                     |
| -------------------------------- | ---------------- | -------------------- | -------------------------------------- |
| getOgpInfo                       | Action           | 要ログイン（内部でidentity検証） | 指定URLのOGP情報取得（SSRF対策済みfetch＋cheerio解析） |
| getFurigana                      | Action           | 要ログイン                | Yahoo!テキスト解析APIによるふりがな取得               |
| sendEmailReq / sendEmailInternal | (Internal)Action | 内部限定                 | Resend経由のメール送信                         |

### 7.5 convex/http.ts

| エンドポイント               | メソッド | 認証                                               | 概要                                     |
| --------------------- | ---- | ------------------------------------------------ | -------------------------------------- |
| /getUserByFirebaseUid | POST | x-internal-secret ヘッダー（CONVEX\_INTERNAL\_SECRET） | サーバーサイド (getAuthUser) からのユーザー情報取得専用API |

## 8. 画面設計・ルーティング設計

### 8.1 ルートグループ構成（TanStack Router）

```
(public)/  … PublicLayout配下。ヘッダー・フッター共通、未ログインでも閲覧可
  index.tsx, usage.tsx, faq.tsx, login.tsx,
  terms-of-service.tsx, privacy-policy.tsx

(app)/     … 認証必須。beforeLoadで未ログイン時は /login へリダイレクト、
              家族未所属時は /family 以外を /family へ強制リダイレクト。
              家族所属済みの場合のみ AppHeader を表示。
  dashboard.tsx, records/new.tsx, records/$id.tsx, family.tsx, settings.tsx

__root.tsx … 全体のHTML/head/Provider階層を定義。
              beforeLoadでgetAuthUserを実行し、以降の全ルートで
              context.user としてユーザー情報を共有する。
```

### 8.2 グローバルProvider階層（\_\_root.tsx）

```
ConvexProviderWithAuth(useConvexFirebaseAuth)
  └ QueryClientProvider (TanStack Query)
      └ ThemeProvider (ライト/ダーク/システム)
          └ PasscodeProvider (E2EE鍵管理・パスコードダイアログ)
              └ 各ページコンポーネント + Analytics/SpeedInsights/Toaster
```

### 8.3 UI/UXガイドライン（NFR-UX-04〜07）

- 主要操作（新規登録等）・コピーボタン等の操作要素は、タップ領域44×44px以上を確保し、
  スマートフォンでの片手操作を考慮した位置（画面下部寄り）に配置する
- フォーム入力欄・危険操作（アカウント削除等）は、WCAG基準のコントラスト比を満たす配色とする
- 「自分のみ／個人」等の表記・共有／個人を示す配色は、コンポーネント共通のトークンとして
  画面全体で統一する。エラー時は原因と次の行動が分かる案内を表示する（無機質なトースト単体に頼らない）
- モーダル（パスコード解除・確認ダイアログ等）を閉じた際は、起動直前にフォーカスしていた
  要素へ自動的にフォーカスを戻す
- タグ入力欄は、ソフトウェアキーボード表示中でもよく使うタグを選択できるUI（入力欄直下に
  チップス形式で表示）とする（FR-REC-14）

### 8.4 状態管理・キャッシュ戦略（TanStack Query vs Convex）

TanStack QueryとConvexは双方がキャッシュ機構を持つため、責務の境界線を明確に分離し、二重フェッチやデータ不整合を防ぐ。

役割分担：

| 領域              | 担当技術             | 対象データ                                            | 役割                                              |
| --------------- | ---------------- | ------------------------------------------------ | ----------------------------------------------- |
| 認証状態・ルーティング・CMS | TanStack Query   | authUser、UI設定（Cookieベース）、CMSデータ（FAQ・規約等の静的コンテンツ） | セッション監視、SSR時の初期データ解決、低頻度更新の外部コンテンツのキャッシュ        |
| アプリケーションデータ     | Convex（useQuery） | serviceRecords、家族情報、参加申請状態など                     | リアルタイムデータ同期。信頼できる唯一の情報源（Single Source of Truth） |

基本原則：

1. **二重キャッシュの禁止** ：Convexが提供するアプリケーションデータは、ConvexのWebSocket経由のリアクティブ同期によって常に最新状態が保たれる。これをTanStack Queryで再度フェッチ・ラップしてキャッシュすることは、他端末での編集が即時反映されない等のデータ不整合と、不要なHTTPリクエストを招くため厳禁とする。
2. **描画品質（チラツキ防止）の担保** ：Convexのデータ取得が開始してから完了するまでの遷移期間に画面がちらつかないよう、コンポーネントは `usePersistentQuery` フックを介してメモリ上にフォールバックキャッシュ（直近取得結果、最大1,000件、NFR-PERF-02）を保持する。
3. **セッションクリーンアップ** ：ログアウト時は、TanStack Queryのキャッシュ（ `queryClient.clear()` ）と `usePersistentQuery` のインメモリキャッシュの両方を即時にクリアし、アカウント間でのデータ残存・露出を防ぐ。

### 8.5 ビジュアルデザインシステム（概要）

PoohMaのUIは、Vercelのデザインシステム（Geist）を参考にしたビジュアル仕様に基づく。詳細なトークン定義は別紙のUIデザインシステム仕様書（0章の命名注記を参照）を参照し、ここでは実装上の要点のみを示す。

- **タイポグラフィ** ：Geist Sans／Geist Mono（ `@fontsource/geist-sans`, `@fontsource/geist-mono` ）。見出しはネガティブなレタースペーシング（表示サイズで-2.4px〜-2.88px）を用いる。ウェイトは400（本文）／500（UI・操作）／600（見出し）の3段階に限定する。
- **Shadow-as-border技法** ：カード・ボタン等の境界線には、通常のCSS `border` ではなく `box-shadow: 0px 0px 0px 1px rgba(0,0,0,0.08)` （ゼロオフセット・ゼロブラーの1pxシャドウ）を用いる。
- **カラーパレット** ：基本はアクロマティック（ `#171717` 〜 `#ffffff` のグレースケール）とし、ブランドカラー（オレンジ系。LPデザイン定義書に別途規定）はCTA等の重要な操作にのみ点で使用する。
- **ボーダー半径** ：ボタン6px、カード8px、画像付きカード12px、バッジ9999px（フルピル）など、要素の種類ごとに固定のスケールを用いる。

## 9. 主要シーケンス

### 9.1 サービスレコード新規登録

```
1. ユーザーがURL欄入力→フォーカスアウト
   → Convex Action getOgpInfo 呼び出し → タイトル/画像/説明を自動反映
   → タイトルが確定した時点で Action getFurigana を呼び出し読み仮名を自動反映
2. パスワードヒントを含むフォームを送信
   → hasHintsToEncrypt かつ masterKey未展開の場合、requireUnlock() でパスコードダイアログ表示
   → PasscodeProvider.encryptHint() で 認証情報ごとにDEK生成→暗号化→DEKラップ
3. Mutation records.createRecord 呼び出し（zodスキーマによるサーバー側再検証）
4. 成功後、/dashboard へ遷移
```

### 9.2 CSVインポート

```
1. ユーザーがCSVファイルを選択 (user-menu.tsx)
2. papaparseでパース（ヘッダー行あり）
3. 行数（500件以下）・フィールド長（10,000文字以下）の早期バリデーション
4. パスワードヒントを含む行がある場合、requireUnlock() でロック解除
5. processInChunks() により10件単位でチャンク処理：
     各行についてOGP取得・ふりがな取得（未設定時のみ）→ パスワードヒント暗号化
6. Mutation records.importRecords 呼び出し（サーバー側で行ごとにzod再検証）
7. 成功件数・行ごとの失敗理由をトースト表示
```

### 9.3 家族グループ新規作成

```
1. 家族名・パスコード（8文字以上、確認一致）を入力
2. クライアント側でソルト生成 → PBKDF2でパスコード導出鍵生成
   → マスターキー生成 → マスターキーをパスコード導出鍵でラップ
3. Mutation families.createFamily 呼び出し（暗号化済みマスターキー・IV・ソルトを送信）
4. サーバー側でfamiliesレコード作成、ユーザーのfamilyIdを更新、
   Action経由で完了通知メールをスケジュール送信
5. authUserクエリを再検証し、AppHeader等の表示を更新
```

### 9.4 パスコードのみのローテーション（FR-FAM-10）

```
1. 設定画面で現在のパスコードによりロック解除（未解除の場合）
2. 新パスコード・確認入力を送信
3. クライアント側で6.5の手順によりマスターキーを新しい導出鍵で再wrap
4. Mutation families.rotatePasscode 呼び出し
5. 成功後、以後のロック解除は新パスコードで行われる（既存レコードは無変更）
```

### 9.5 リカバリーキーの発行・復旧（FR-CRYPT-06）

```
発行：
1. 設定画面から「リカバリーキーを発行」を選択（マスターキー展開済みであること）
2. クライアント側で6.6の手順によりリカバリーキーを生成しマスターキーを別経路でラップ
3. Mutation families.issueRecoveryKey 呼び出し
4. QRコード付きPDFをその場で生成しダウンロード（キーの値はこの時点以降サーバーにも
   ブラウザにも残らない。再表示不可であることを画面上で明示する）

復旧：
1. ログイン画面／パスコード解除画面から「パスコードを忘れた場合」を選択
2. リカバリーキーを入力
3. クライアント側で6.6の手順によりマスターキーを復元
4. 新しいパスコードを設定させ、rotatePasscode 相当の処理でmasterKeyEncrypted等を更新
5. Mutation families.recoverWithRecoveryKey 呼び出し、完了後は新パスコードでログイン可能になる
```

### 9.6 同時編集の検知（FR-REC-15）

```
1. ユーザーAがレコード編集画面を開く → Mutation startEditingSession
2. 編集画面を開いている間、15秒間隔で Mutation heartbeatEditingSession を送信
3. ユーザーBが同じレコードの編集画面を開く → Query getActiveEditors（リアクティブ）が
   ユーザーAの編集中セッションを検知し、「Aさんが編集中です」を表示
4. ユーザーAが保存 or 画面を離れる → Mutation endEditingSession
   （ハートビートが一定時間途絶えた場合はサーバー側で自動的に無効扱いとする）
5. 保存時、updateRecord は対象レコードの updatedAt を前提条件として検証し（楽観的ロック）、
   他ユーザーの保存と競合した場合は「他のメンバーが更新しました。再読み込みしてください」
   として保存を拒否する
```

### 9.7 CSVインポートのプレビュー（FR-CSV-07）

```
1. CSVファイル選択・パース後、確定ボタンを押す前に Query/Action previewCsvImport を呼び出す
2. サーバー側で、各行のURL＋タイトルを既存の自分のレコードと突合し、
   「新規／上書き／スキップ」を判定した結果を返す
3. クライアントは判定結果を一覧としてプレビュー表示し、ユーザーが行単位で
   インポート対象から除外できるようにする
4. ユーザーが確定操作を行った時点で、9.2のインポートフロー（ロック解除→暗号化→
   importRecords呼び出し）へ進む
```

## 10. SSRF対策設計（OGP取得機能, src/utils/url-safety.ts）

```
validateUrlSafety(url):
  1. URLスキームが http / https 以外なら拒否
  2. ホスト名が直接IPアドレス指定の場合、isPrivateIp()でプライベート/ループバック/
     リンクローカル/未指定アドレス範囲かを判定し、該当すれば拒否
  3. ドメイン名の場合、dns.resolve4 / resolve6 で名前解決し、
     解決された全アドレスに対してisPrivateIp()チェックを実施（1つでも該当すれば拒否）
  4. 安全と判定された解決済みIPアドレスを返す

fetchSafeBuffer() (convex/actions.ts):
  - 上記で得た「検証済みIPアドレス」に対して直接TCP接続し(Hostヘッダーのみ元のホスト名を付与)、
    アプリケーションレベルでのDNS Rebinding対策を行う
  - リダイレクト応答を受けた場合、リダイレクト先URLに対して再度 validateUrlSafety() を実行
    （毎回名前解決からやり直す）
  - 最大リダイレクト回数：1〜10回（デフォルト5回）、リダイレクトの循環を検出したら中断
  - レスポンスサイズ上限：5MB、リクエストタイムアウト：5秒

リソース枯渇対策の強化（NFR-SEC-11）：
  - レスポンスヘッダーの Content-Length を確認し、上限（5MB）を超える場合は
    ボディの読み込みを開始せず即座に中断する
  - Content-Length が存在しない、または実際の転送量が事前申告と異なる（chunked transfer等）
    ケースに備え、response.arrayBuffer() で一括読み込みせず、ストリームを逐次読み込みながら
    受信済みバイト数を積算し、上限（5MB）を超過した時点で接続を強制中断（AbortController）する
  - 上記のいずれかで中断した場合、OGP取得は失敗として扱い、フォームの当該項目は
    未入力のまま処理を継続する（登録自体は妨げない）
```

## 11. 入力バリデーション設計（src/utils/schemas.ts, zod）

| スキーマ                      | 用途                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| AeadDataSchema            | IV（16文字Base64）・暗号文（Base64、最小長22）の形式チェック共通部品                                                               |
| CredentialInputSchema     | 認証情報の文字数上限、ヒント／IV／DEKの整合性チェック（片方のみ存在はエラー）                                                                 |
| RecordInputSchema         | サービスレコード全体（タイトル必須255文字以内、URL形式、メモ10,000文字以内、 `credentials` 配列は `MAX_CREDENTIALS_PER_RECORD = 10` で上限を明示、 `tags` 配列にも運用上妥当な上限を設定） |
| CreateFamilyInputSchema   | 家族名必須、マスターキー暗号化データ・ソルトの形式チェック、パスコード強度要件（最低文字数10文字・zxcvbnスコア2以上、NFR-SEC-13）はクライアント側の入力時点でも検証する                          |
| ChangeFamilyInputSchema   | create/joinで分岐する必須項目チェック、認証情報配列の整合性チェック                                                                   |
| RotatePasscodeInputSchema | 新パスコードの強度要件チェック、マスターキー再ラップデータの形式チェック（新設）                                                                  |

これらのスキーマは src/utils/schemas.ts に定義され、Convex側（records.ts）でも
convex用にID型を拡張した上でそのまま再利用し、クライアント・サーバーの二重検証を実現している。

## 12. バッチ・スケジューラ設計

```
convex/crons.ts:
  cronJobs().interval("cleanup expired family migrations", { hours: 1 },
    internal.families.cleanupExpiredMigrationsInternal)

cleanupExpiredMigrationsInternal:
  - status=PREPARED かつ expiresAt < 現在時刻 の familyMigrations を抽出
  - 各対象を status=EXPIRED に更新
  - 移行先家族(targetFamilyId)がメンバー0件・レコード0件であれば、
    その空家族グループ自体を削除する
```

## 13. 外部サービス連携設計

| サービス                    | 用途                           | 認証方式                                   |
| ----------------------- | ---------------------------- | -------------------------------------- |
| Firebase Authentication | Googleログイン、IDトークン発行          | クライアントSDK（Google OAuth）                |
| Firebase Admin SDK      | IDトークン検証、セッションCookie発行・検証    | サービスアカウント（環境変数 or JSONファイル）            |
| Convex                  | DB・ビジネスロジック実行基盤              | Firebase IDトークンをそのまま信頼（auth.config.ts） |
| microCMS                | FAQ・利用規約・プライバシーポリシーの コンテンツ管理 | APIキー（サーバーサイドのみ）                       |
| Resend                  | 通知メール送信                      | APIキー                                  |
| Yahoo!テキスト解析API         | サービス名からのふりがな自動生成             | アプリケーションID                             |

## 14. 環境変数一覧

### クライアント（src/env/client.ts, VITE\_プレフィックス）

| 変数名                             | 必須 | 説明                   |
| ------------------------------- | -- | -------------------- |
| VITE\_APP\_TITLE                | 任意 | アプリタイトル              |
| VITE\_FIREBASE\_API\_KEY        | 必須 | Firebase APIキー       |
| VITE\_FIREBASE\_AUTH\_DOMAIN    | 必須 | Firebase Authドメイン    |
| VITE\_FIREBASE\_PROJECT\_ID     | 必須 | FirebaseプロジェクトID     |
| VITE\_FIREBASE\_STORAGE\_BUCKET | 必須 | Firebase Storageバケット |
| VITE\_CONVEX\_URL               | 必須 | ConvexデプロイURL        |

### サーバー（src/env/server.ts）

| 変数名                       | 必須 | 説明                                 |
| ------------------------- | -- | ---------------------------------- |
| SERVER\_URL               | 任意 | サーバーURL                            |
| MICROCMS\_SERVICE\_DOMAIN | 必須 | microCMSサービスドメイン                   |
| MICROCMS\_API\_KEY        | 必須 | microCMS APIキー                     |
| CONVEX\_INTERNAL\_SECRET  | 必須 | Convex HTTP Action（内部API）保護用シークレット |

### その他（Convex実行環境）

| 変数名                                                          | 説明                                             |
| ------------------------------------------------------------ | ---------------------------------------------- |
| FIREBASE\_SERVICE\_ACCOUNT / FIREBASE\_ADMINSDK\_CREDENTIALS | Firebase Admin初期化用サービスアカウント（JSON文字列 or ファイルパス） |
| RESEND\_API\_KEY / RESEND\_MAIL\_FROM                        | メール送信設定                                        |
| YAHOO\_CLIENT\_ID                                            | ふりがな取得API用アプリケーションID                           |

## 15. デプロイ構成

- **フロントエンド** ：Vercelにデプロイ。vercel.json にて `/__/auth/*` へのアクセスをFirebase Hosting（poohma.firebaseapp.com）へリライトし、Firebase Authのポップアップ/リダイレクト処理を委譲している。
- **セキュリティヘッダー（NFR-SEC-12）** ：vercel.json の `headers` ブロックで全パスに対し以下を設定する。
  - `Content-Security-Policy` ： `default-src 'self'` を基本とし、 `connect-src` にConvexデプロイURL・Firebase・microCMS・Resend等の許可ドメインのみを列挙、 `script-src 'self'` （インラインスクリプトが必要な箇所はnonceを付与）、 `frame-ancestors 'none'`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Content-Type-Options: nosniff`
    導入時は、Firebase Authのリダイレクト（ `/__/auth/*` ）やmicroCMS/Resendへの通信がブロックされないよう、許可ドメインリストを実装済みの外部連携先（13章）と突き合わせてから有効化する。
- **開発環境** ：vite.config.ts にてFirebase Auth関連パスのプロキシ設定、および自己署名証明書（@vitejs/plugin-basic-ssl）によるローカルHTTPS対応（WebAuthn等はHTTPS必須のため）。
- **バックエンド** ：Convex Cloudにデプロイ（ `pnpm dev:convex` / Convexデプロイパイプライン）。
- **SSR注意事項** ： `ssr.external: ["papaparse"]` の設定により、papaparseはSSRバンドルから除外しクライアント専用として扱う。

## 16. テスト・品質管理

- **単体・結合テスト** ：Vitest ＋ @testing-library/react（UIコンポーネント）、convex-test（Convex関数のテスト）。
- **ブラウザテスト** ：@vitest/browser-playwright によるブラウザ実行モードのテスト。
- **コンポーネントカタログ** ：Storybook（a11yアドオン、テーマ切替アドオン等を含む）。
- **静的解析／フォーマット** ：Biome（ `check` / `check:ci` スクリプト）。
- **型チェック** ： `tsc --noEmit` 。

## 17. 今後の課題（技術的観点）

- DEKを持たない旧形式credentialへのフォールバック処理（マスターキー直接暗号化）の将来的な廃止・移行計画。
- 家族移行のPREPARED状態が複数端末から同時実行された場合の競合制御（現状は同一ユーザーの既存PREPAREDを都度EXPIRED化する方式）。
- オフラインキャッシュ（1.1）は読み取り専用として設計しているため、オフライン中の書き込み操作（新規登録・編集等）に対応する場合は、書き込みキューイングと競合解決（9.6の楽観的ロックとの整合）の設計が別途必要になる。
- 複数家族（マルチ・ワークスペース）対応：要件定義書10章の検討課題のとおり、現行は1ユーザー1家族グループ（users.familyIdが単一値）を前提としたスキーマ・認可設計（5.3のfamilyBoundQuery/Mutation等）となっている。対応する場合はusersテーブルの家族所属を配列化し、家族切替時にどのfamilyIdをコンテキストとして扱うか（アクティブ家族の概念）を含めた設計見直しが必要。
