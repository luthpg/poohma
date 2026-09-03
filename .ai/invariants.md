# PoohMa Invariants

変更によって絶対に破壊してはいけない設計上・セキュリティ上・データ整合性上の不変条件（Invariants）を整理する。

---

## 1. E2EE & 暗号鍵管理の不変条件

### パスワードヒントの機密性

- **平文ヒントをサーバーへ絶対に送信・保存しない**。暗号化・復号はすべてクライアント（ブラウザ）の Web Crypto API で完結する。
- サーバーに永続化されるのは暗号化済みヒント（`passwordHint`）と IV、ラップされた DEK（`passwordHintDekEncrypted`）と IV のみ。
- メタデータ（サービス名、URL、メモ、タグ、ログインID）は暗号化対象外であり平文で保存される（意図的な設計仕様）。

### 鍵階層とエンベロープ暗号化

- 新規作成・編集・家族移行における暗号化は**必ず DEK（AES-GCM 256）を用いたエンベロープ暗号化**とする。マスターキーによるヒントの直接暗号化はレガシー読み取り互換のみに限定し、新規暗号化でフォールバックしてはならない。
- **マスターキーは平文でサーバーに保存しない**。`families.masterKeyEncrypted`（パスコード鍵でラップ）および `families.recoveryMasterKeyEncrypted`（リカバリーキーでラップ）の暗号化状態でのみ保存される。
- クライアント側でも、マスターキーは `PasscodeProvider` の揮発性メモリ（React State）上にのみ一時保持し、`localStorage` や `sessionStorage`、IndexedDB 等へ平文・永続化してはならない。

### 家族パスコード

- **家族パスコードはサーバーにもブラウザストレージにも平文保存しない**。
- 生体認証（WebAuthn PRF）利用時も、PRF 出力鍵で暗号化されたパスコードがローカル IndexedDB に保存されるのみで、サーバーには一切関与しない。

### 暗号パラメータの後方互換性

- `apps/web/src/lib/crypto.ts` の `KDF_VERSIONS` は**追記のみ許可**。既存のバージョン定義（反復回数・ハッシュアルゴリズム）を変更・削除してはならない（既存データの復号が不可能になるため）。
- 復号時は各ファミリーレコードに記録された `kdfIterations` / `cryptoVersion` を動的に適用する（未設定時はレガシーデフォルト値 `300_000` / `version: 1`）。

---

## 2. 認証・認可とアクセス制御の不変条件

### Convex カスタムビルダーの強制

- 生の Convex `query` / `mutation` を直接 export してはならない。
- 必ず `convex/customBuilders.ts` のビルダー（`authenticatedQuery/Mutation`, `familyBoundQuery/Mutation`, `identityVerifiedQuery/Mutation`）を経由する。

### IDOR（Insecure Direct Object Reference）の完全防止

- クエリ・ミューテーションに渡される `accountId`（PoohMa Account ID）は、`resolveAccount` 内で `user.userId === identity.subject`（ログイン中 Firebase UID）であることが必ず検証される。
- 他人の `accountId` を偽装したリクエストは即座に `Unauthorized` 例外で拒否されなければならない。

### レコード所有権と RLS の二層防御（Drive型 ACL）

- レコードのコンテンツ閲覧・編集には `requireContentAccess`（`convex/rls.ts`）を必ず経由する:
  - 個人所有（`ownerType === "user"`）: `record.accountId === user._id` の本人のみ。
  - 家族共有（`ownerType === "family"`）: 同一家族メンバー（`record.ownerFamilyId === user.familyId`）全員。
- レコードの管理操作（削除、共有解除、管理者変更）には `requireAdminAccess` を必ず経由する:
  - 個人所有: `record.accountId === user._id` の本人のみ。
  - 家族共有: 同一家族メンバーかつ `admins` 配列に含まれるアカウント（`record.admins.includes(user._id)`）のみ。
- 家族境界チェック: レコードの `familyId` とユーザーの `familyId` が不一致の場合は即座に拒否。

### マルチアカウント境界の隔離

- 1つの Firebase UID に複数の PoohMa アカウントが紐づく場合でも、**個人レコード・所属家族・マスターキーはアカウントごとに完全に隔離**される。
- アカウント切り替えが発生した際は、直ちに前アカウントの MasterKey をメモリから破棄し、ローカルメモリキャッシュの削除（`clearQueryCache()`）と TanStack Query の無効化・再取得（`queryClient.invalidateQueries()`）を実行して再パスコードロック状態へ遷移しなければならない。

### 長期ログイン状態の Source of Truth とセッション Cookie の位置付け

- **長期ログイン状態の本体はブラウザ側の Firebase Auth（LOCAL 永続性）**であり、ユーザーが明示的にログアウトしない限り数ヶ月単位で維持される。
- **`session` Cookie は SSR 初期表示およびサーバー処理用の補助セッション・キャッシュ**に過ぎない。**Cookie の期限切れ（14日）のみを理由に未認証としてログアウトさせてはならない**。
- `(app)` ルートの保護等の画面アクセス判定は、Cookie 由来のデータではなくクライアントの Firebase Auth 状態（`useAuth().isAuthenticated`）を判定基準としなければならない。
- Session Cookie が未発行または失効している場合でも、Firebase Auth が認証中であればバックグラウンドで自動的に `refreshSessionCookie` を呼び出し、Cookie をローリング延長・再同期しなければならない（DB更新やログイン通知は行わない）。

---

## 3. 家族グループとライフサイクルの不変条件

### 家族招待（familyInvites）の安全性

- 招待コード（UUID）は恒久的な家族 ID（`families._id`）と完全に分離する。
- 招待コードには有効期限（`expiresAt`）が必須。期限切れまたは手動失効（`revokedAt`）済みのコードによる参加申請・情報照会はサーバー側で拒否する。
- 招待コードは「参加申請（`joinRequests`）を作成する権利」を与えるのみであり、既存家族メンバーによる明示的承認なしに家族へ所属させることはできない。

### 家族移行（familyMigrations）の原子性と安全性

- 家族移行は 2 段階（`PREPARED` → クライアント側で新マスターキーによる DEK 再ラップ → `COMPLETED`）で管理する。
- 移行完了時には、移行対象レコードの `familyId` および DEK ラップデータがすべて新家族のマスターキーに更新され、古い家族の鍵で復号不能な状態を残してはならない。

### アカウント削除・退会時の整合性

- 退会時は、ユーザーが個人所有する全レコード（共有設定の有無に関わらず）を削除する。
- 退会ユーザーが家族の最後の 1 人であった場合、孤立した家族グループ（`families`）レコード自体も必ず削除する。

---

## 4. リカバリー（2段階復元）の不変条件

### リカバリーコードの非保存

- リカバリーコード平文はサーバーに一切保存しない。サーバー側には SHA-256 ハッシュ値（`recoveryCodeHash`）のみを保持し、一致検証に用いる。

### 2段階復元の厳格性

1. 第1段階: 正規化リカバリーコードのハッシュ照合 + 登録メールアドレス宛の 6 桁 OTP（有効期限10分、最大5回試行、ハッシュ保存）検証。
2. 第2段階: OTP 検証成功時にワンタイムの認可セッショントークン（`recoverySessions`）を発行。
3. パスコード再設定・マスターキー再ラップ（`redeemRecoveryAndRotatePasscode`）実行時にセッショントークンを検証し、**即時消費（削除）**する。再利用を許してはならない。
