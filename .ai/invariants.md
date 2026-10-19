# PoohMa Invariants

変更によって絶対に破壊してはいけない設計上・セキュリティ上・データ整合性上の不変条件（Invariants）を整理する。

---

## 1. E2EE & 暗号鍵管理の不変条件

### パスワードヒントの機密性

- **平文ヒントをサーバーへ絶対に送信・保存しない**。暗号化・復号はすべてクライアント（ブラウザ）の Web Crypto API で完結する。
- サーバーに永続化されるのは暗号化済みヒント（`passwordHint`）と IV、ラップされた DEK（`passwordHintDekEncrypted`）と IV のみ。
- メタデータ（サービス名、URL、メモ、タグ、ログインID）は暗号化対象外であり平文で保存される（意図的な設計仕様）。

### 鍵階層とエンベロープ暗号化

- すべてのパスワードヒント暗号化・復号において**必ず DEK（AES-GCM 256）を用いたエンベロープ暗号化**を必須とする。マスターキーによるヒントの直接暗号化・復号へのフォールバックは行わない。
- **マスターキーは平文でサーバーに保存しない**。`families.masterKeyEncrypted`（パスコード鍵でラップ）および `families.recoveryMasterKeyEncrypted`（リカバリーキーでラップ）の暗号化状態でのみ保存される。
- クライアント側でも、マスターキーは `PasscodeProvider` の揮発性メモリ（React State）上にのみ一時保持し、`localStorage` や `sessionStorage`、IndexedDB 等へ平文・永続化してはならない。
- **Web Crypto API の `extractable` 最小権限化**: ヒント復号専用コンテキスト（`PasscodeProvider.decryptHint` 等）では `unwrapDEK(..., false)` を指定し、鍵の再ラップを要しない場面で `crypto.subtle.exportKey` による鍵材料の抽出を遮断する。

### 家族パスコード

- **家族パスコードはサーバーにもブラウザストレージにも平文保存しない**。
- 生体認証（WebAuthn PRF）利用時も、PRF 出力鍵で暗号化されたパスコードがローカル IndexedDB に保存されるのみで、サーバーには一切関与しない。

### 暗号パラメータの後方互換性

- `packages/crypto/src/index.ts` の `KDF_VERSIONS` は**追記のみ許可**。既存のバージョン定義（反復回数・ハッシュアルゴリズム）を変更・削除してはならない（既存データの復号が不可能になるため）。
- 復号時は各ファミリーレコードに記録された `kdfIterations` / `cryptoVersion` を動的に適用する（未設定時はレガシーデフォルト値 `300_000` / `version: 1`）。

---

## 2. 認証・認可とアクセス制御の不変条件

### Convex カスタムビルダーの強制

- 生の Convex `query` / `mutation` を直接 export してはならない。
- 必ず `convex/customBuilders.ts` のビルダー（`authenticatedQuery/Mutation`, `familyBoundQuery/Mutation`, `identityVerifiedQuery/Mutation`, `systemAdminQuery/Mutation/Action`）を経由する。

### システム管理者権限（System Admin）のフェイルセーフ保護

- システム管理者向け操作（お問い合わせ閲覧/更新、システム統計、ユーザー/ファミリー照会、microCMS管理、デモ環境リセット等）は、必ず `assertSystemAdmin`（`systemAdminQuery/Mutation/Action`）を経由する。
- 認可判定は「Firebase 認証済み」かつ「確認済みメールアドレス（`emailVerified: true`）」かつ「環境変数 `ADMIN_EMAILS` ホワイトリストに含まれること」を必須とする。`ADMIN_EMAILS` が未設定または空の場合はフェイルセーフとして全アクセスを拒否する。
- **E2EE 不変条件の維持**: システム管理者であっても、ユーザーの E2EE 暗号化ヒント（`passwordHint`）やマスターキー（`masterKeyEncrypted`）の復号鍵は保持しておらず、一切閲覧・復号できない。運営者権限によるプライバシー侵害を技術的に不可能とする。

### IDOR（Insecure Direct Object Reference）の完全防止

- クエリ・ミューテーションに渡される `accountId`（PoohMa Account ID）は、`resolveAccount` 内で `user.userId === identity.subject`（ログイン中 Firebase UID）であることが必ず検証される。
- 他人の `accountId` を偽装したリクエストは即座に `Unauthorized` 例外で拒否されなければならない。

### レコード所有権と RLS の二層防御（Drive型 ACL）

- レコードのコンテンツ閲覧には `requireContentAccess`（`convex/rls.ts`）を必ず経由する:
  - 個人所有（`ownerType === "user"`）: `record.accountId === user._id` の本人のみ。
  - 家族共有（`ownerType === "family"`）: 同一家族メンバー（`record.ownerFamilyId === user.familyId`）全員（閲覧専用メンバー `viewer` 含む）。ヒント復号も全メンバーに許可される。
- レコードの管理操作および編集（レコード更新、削除、共有解除、管理者変更、一括タグ更新 `bulkUpdateRecords`、同時編集セッション `startEditingSession` / `heartbeatEditingSession`）には `requireAdminAccess` を必ず経由する:
  - 個人所有: `record.accountId === user._id` の本人のみ。
  - 家族共有: 同一家族メンバーかつ「ファミリー管理者（`getEffectiveFamilyRole(user) === "admin"`）」または `admins` 配列に含まれる個別管理者（`record.admins.includes(user._id)`）のみ。一般メンバー（`viewer`）による誤操作・破壊的変更・排他制御の妨害を確実に防止する。
- 家族境界チェック: レコードの `familyId` とユーザーの `familyId` が不一致の場合は即座に拒否。

### マルチアカウント境界の隔離

- 1つの Firebase UID に複数の PoohMa アカウントが紐づく場合でも、**個人レコード・所属家族・マスターキーはアカウントごとに完全に隔離**される。
- アカウント切り替えが発生した際は、直ちに前アカウントの MasterKey をメモリから破棄し、ローカルメモリキャッシュの削除（`clearQueryCache()`）と TanStack Query の無効化・再取得（`queryClient.invalidateQueries()`）を実行して再パスコードロック状態へ遷移しなければならない。

### 長期ログイン状態の Source of Truth とセッション Cookie の位置付け

- **長期ログイン状態の本体はブラウザ側の Firebase Auth（LOCAL 永続性）** であり、ユーザーが明示的にログアウトしない限り数ヶ月単位で維持される。
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

### アカウント削除・退会時の整合性とカスケード削除の完全性

- レコード削除時（単一削除 `deleteRecord`、一括削除 `deleteRecords`、退会時 `deleteAccount` / `deleteAllAccounts`、孤立共有レコード掃除）は必ず共通ヘルパー `cascadeDeleteRecord` を経由する。
- 対象レコードの `serviceRecords` エンティティ本体だけでなく、紐づく `credentials`、`recordEditingSessions`（同時編集セッション）、および `viewLogs`（閲覧ログ）を漏れなく確実に物理削除し、孤立レコードや未解決ログの残存を防止する。
- 退会時は、ユーザーが個人所有する全レコード（共有設定の有無に関わらず）を上記カスケード削除により削除する。
- 退会ユーザーが家族の最後の 1 人であった場合、孤立した家族グループ（`families`）レコード自体も必ず削除する。

### メンバーキックと Export Vault の不変条件

- **共有レコード（`ownerType: "family"`）の不可侵性**: 家族共有レコードは家族全体の資産であり、キックされたユーザーが持ち出したり削除することは絶対に許されない。キックされたユーザーが共有レコードの唯一の管理者であった場合は、`reconcileAdminsOnLeave` により残存メンバーへ管理者権限が自動移譲されなければならない。
- **個人所有レコード（`ownerType: "user"`）の持ち出し保証**: 被キックユーザーの個人所有レコードは作成者の個人資産として保護される。キック実行時に Convex サーバーは旧家族の暗号化マスターキー情報（`masterKeyEncrypted`, `masterKeyIv`, `masterKeySalt`, `kdfIterations`, `cryptoVersion`）を `pendingExportVaults` へ原子的に退避する。
- **平文非保持の徹底**: `pendingExportVaults` に保存されるのは暗号化されたマスターキー情報のみであり、サーバーはマスターキーやパスコードの平文を一切受け取らない・保存しない。
- **Export Vault の確実な破棄**: `pendingExportVaults` は 30日の有効期限（`expiresAt`）を持ち、移行完了時（`commitFamilyMigration`）、ユーザーによる明示的破棄（`abandonPendingExportVault`）、または定期クロンジョブ（`cleanupExpiredExportVaultsInternal`）によって確実に物理削除されなければならない。

### 家族ロールと最後の管理者保護

- **最低1名のファミリー管理者保持**: 家族グループ内には常に最低1名のファミリー管理者（`familyRole === "admin"`）が存在しなければならない。最後の管理者の降格（`updateMemberRole`）およびキック（`kickMember`）はサーバー側で厳格に拒否する。
- **管理者限定操作の保護**: 家族設定変更、招待発行、参加申請の承認・却下、メンバーロール更新、メンバーキックはファミリー管理者（`familyAdminMutation`）に限定される。
- **安全な初期ロール**: 家族新規作成者は `"admin"`（ファミリー管理者）となるが、招待承認による新規参加者は安全のため `"viewer"`（メンバー）として初期化される。

---

## 4. リカバリー（2段階復元）の不変条件

### リカバリーコードの非保存

- リカバリーコード平文はサーバーに一切保存しない。サーバー側には SHA-256 ハッシュ値（`recoveryCodeHash`）のみを保持し、一致検証に用いる。

### 2段階復元の厳格性

1. 第1段階: 正規化リカバリーコードのハッシュ照合 + 登録メールアドレス宛の 6 桁 OTP（有効期限10分、最大5回試行、ハッシュ保存）検証。
2. 第2段階: OTP 検証成功時にワンタイムの認可セッショントークン（`recoverySessions`）を発行。
3. パスコード再設定・マスターキー再ラップ（`redeemRecoveryAndRotatePasscode`）実行時にセッショントークンを検証し、**即時消費（削除）** する。再利用を許してはならない。

### 秘密値・ハッシュ値の定数時間比較（タイミング攻撃防止）

- リカバリーコードハッシュ、OTPハッシュ、リカバリーセッショントークンハッシュ、内部共有シークレット（`CONVEX_INTERNAL_SECRET`）などの検証には、**必ず固定長走査による定数時間比較（`timingSafeEqual`）を使用する**。
- `===` や `!==` による文字列直接比較は早期リターンによるタイミングサイドチャネル情報漏洩（CWE-208）を引き起こすため禁止する。
- また、秘密値の長さや入力値の長さに引きずられてループ回数が変動することを防ぎ、秘密値の長さ漏洩（CWE-208）および巨大入力による CPU 枯渇 DoS（CWE-400）を防止するため、走査ステップ数は固定長（`FIXED_COMPARE_LENGTH = 256`）に完全に固定されていなければならない。

---

## 5. フロントエンドにおける機密情報非露出とエラーハンドリングの不変条件

### クライアントログ（console.*）への機密情報漏洩の禁止

- **ブラウザ環境で動作するフロントエンドコード（components, hooks, routes, lib/utils）で `console.error`, `console.warn`, `console.log` を使って生のエラーオブジェクトや例外、秘密情報を出力してはならない**。
- PoohMa は E2EE（エンドツーエンド暗号化）を採用しており、例外オブジェクトのコンテキストやスタックトレース、通信パラメータ等に暗号鍵、パスコード、認可トークン等のセンシティブ情報が含まれるリスクがあるため、ブラウザ DevTools や拡張機能、クライアントログ収集への漏洩を完全に排除する。
- 例外発生時は `catch (_error) {}` 等で安全に握るか、ユーザー向けに設計された安全な固定メッセージへフォールバックさせる。

### トースト（toast.error）での生エラーメッセージ直接露出の禁止

- `toast.error(error.message)` や `toast.error(String(error))` など、**例外インスタンスのメッセージを生のままトースト表示してはならない**。
- ユーザー（非技術者・ご家族）にとって内部スタックトレースや英語エラーメッセージは混乱・不安の元であり、かつ内部情報の露出に繋がる。
- 必ず事前に定義された親切で安全な固定日本語メッセージ（例: `「パスコードの更新に失敗しました」`、`「招待コードが無効です。内容をご確認ください。」` 等）を表示する。
- 例外として、`BiometricPrfNotSupportedError` 等の明示的にエンドユーザー通知用に設計されたカスタムエラーのみ、メッセージ内容を安全に判定（例: `error.message?.includes("PRF")`）して表示することを許可する。

---

## 6. 設計・アーキテクチャの不変原則（Single Source of Truth と「念のため二重にする」精神の完全排除）

### Single Source of Truth（唯一の信頼できる情報源）の断定と一本化

- 状態、永続化データ、認可判定、キャッシュ等において、**「念のため二重に保存する」「念のため両方でチェックする」といった保険・不安解消目的の冗長化コードは固く禁ずる**。
- これは安全策ではなく、設計上の責任所在とライフサイクルの見極めを放棄した思考停止である。二重化されたデータは必ず更新・削除のズレを生み、ゾンビデータや原因不明のバグ、コード複雑化の最大の温床となる。
- 必ず「どのストレージ・レイヤーが真の責任を持つべきか」を技術的・論理的に突き詰め、**責任の所在を1つに断定・一本化**し、その1本を堅牢に作り切ること。

---

## 7. CI/CD・GitHub Actions ワークフローの不変条件

### コミット前ローカル静的検証の義務付け

- ワークフローファイル（`.github/workflows/*.yml`）を変更・新規作成した際は、**必ずコミット前にローカルで `pnpm lint:workflows`（Docker 経由の actionlint + shellcheck）を実行し、エラー 0 件であることを確認**しなければならない。静的検証を未実施のままコミット・プッシュしてはならない。

### シェルスクリプト引数・変数の完全防護

- **`jq` 内でのシェル変数直接参照の禁止**:
  - `jq '.key // $VAR'` のようにシングルクォート内でシェル環境変数を直接参照してはならない（未定義 jq 変数エラーとなり bash `-e` で即死する）。
  - 必ず `jq --arg var "$VAR" '.key // $var'` のように `--arg` または `--argjson` を経由すること。
- **変数クォートの徹底（SC2086 防止）**:
  - `$GITHUB_OUTPUT` や `$GITHUB_STEP_SUMMARY` へのリダイレクト、およびシェル変数展開時は必ずダブルクォートで保護する（例: `>> "$GITHUB_OUTPUT"`, `>> "$GITHUB_STEP_SUMMARY"`）。

### 可用性とサプライチェーン保護

- **外部 HTTP 通信のタイムアウト必須化**:
  - ワークフロー内で `curl` を用いて外部エンドポイント（Convex, Discord Webhook 等）へ通信する際は、必ず有限のタイムアウト（`--connect-timeout`, `--max-time`）を設定し、ネットワーク障害時の最長6時間ハングを防止する。
- **生 URL パイプ実行（`curl | bash`）の禁止**:
  - 実行時に未検証スクリプトをパイプ実行することはサプライチェーンリスク（CWE-829）となるため禁止する。バージョン固定された公式 Action または公式 Docker イメージを使用すること。
- **内部シークレット送信時の HTTPS 検証**:
  - `CONVEX_INTERNAL_SECRET` などの高権限シークレットを送信する際は、送信先 URL が `https://` で始まっていることを事前に検証し、誤設定による平文送信（CWE-319）を防止すること。

### パッケージ分離・スクリプト移管時のワークフロー参照整合性

- モノレポ内のパッケージ分離やスクリプト移管時、`.github/workflows/*.yml` 内で旧パッケージのスクリプト（`pnpm --filter <old-pkg> run <old-script>`）を参照したまま放置してはならない。
- 必ずワークフロー定義内のコマンドも新パッケージ（例: `pnpm --filter @poohma/backend run preview:setup`）へ即時追従させ、未定義スクリプトによる CI ジョブ即死を防止すること。

### CI での Knowledge・ドキュメント同期（Doc-Sync Gate）の強制

- **完全履歴チェックアウト（`fetch-depth: 0`）**:
  - PR 時の差分検知や base ブランチとのドキュメント同期判定のため、CI の `actions/checkout` には必ず `fetch-depth: 0` を指定する。
- **Knowledge 参照検証と Doc-Sync Gate**:
  - `check-and-test` ジョブ内で `pnpm check:knowledge` および `pnpm check:doc-sync -- --base "origin/$GITHUB_BASE_REF" --ci` を実行し、参照切れや REQUIRED レベルのドキュメント未更新が残存する状態でのマージを CI 側で厳格にブロックする。
- **CI 実行コマンドのスクリプト集約（Single Source of Truth）**:
  - CI ワークフローで実行する検証・デプロイコマンド（Convex dry-run 等）は、個別の生コマンドではなくルート `package.json` のスクリプト（`pnpm run <script-name>`）に集約し、ローカル開発と CI での実行オプションの Single Source of Truth を維持する。

### デプロイキーと環境選択の厳格な分離（フォールバック排除）

- **環境間シークレットの完全分離**:
  - 本番ワークフロー（`deploy-production.yml`）とステージングワークフロー（`deploy-staging.yml`）で同一の `CONVEX_DEPLOY_KEY` を共有してはならない。
  - 本番環境は `CONVEX_DEPLOY_KEY`、ステージング環境および CI ワークフロー（`ci.yml` の `convex-dry-run`）は `CONVEX_STAGING_DEPLOY_KEY` をそれぞれ専用にバインドする（ジョブレベル `env:` およびステップレベルの双方で徹底し、PR 時の本番キー露出を防止）。
- **デプロイキーの曖昧なフォールバックの禁止（fail-fast 原則）**:
  - ステージングデプロイにおいて、「キーが未設定なら開発用や本番用キーを流用する」といったフォールバックコードを記述してはならない。環境の混同や本番への誤爆を防ぐため、未設定時は即座に失敗（fail-fast）させる。
- **本番デプロイワークフローの main ブランチ厳格制限**:
  - 本番デプロイジョブは手動実行（workflow_dispatch）を含め、必ず `github.ref == 'refs/heads/main'` かつリポジトリオーナーの一致を検証する実行条件を課し、未マージブランチからの本番反映を構造的に遮断する。

### 配布用リリース成果物（Release ZIP等）への環境変数注入

- **CI テスト用ダミー環境変数の流用禁止**:
  - GitHub Releases 等でエンドユーザーへ配布する成果物（Chrome 拡張機能 ZIP 等）のビルドには、CI テスト用のダミー環境変数（`dummy_key` やダミードメイン）を流用してはならない。成果物が実環境で動作しなくなるため、必ず GitHub Secrets / Variables を通じた正規の本番環境変数を注入してビルドすること。

### 拡張機能 ZIP ビルドの PR テストと GitHub Releases 配布の責務分離

- **PR テストビルドとタグリリースの分岐**:
  - `release-extension.yml` は、タグプッシュ（`v*`）だけでなく PR（`apps/extension/**` 等の変更時）でも起動し、動作検証用の ZIP を GitHub Actions Artifacts にアップロードする。
  - GitHub Releases へのアタッチ（`gh release create` / `upload`）はタグプッシュ時限定とし、PR では実行しない。
  - PR 時のアーティファクト名は `poohma-extension-pr<PR番号>` と命名し、PR 画面（Job Summary）にダウンロード・インストール手順を出力してレビュー容易性を担保する。
  - `actions/upload-artifact` は既定で隠しディレクトリ配下（`.output/` 等）を除外するため、無駄なステージングディレクトリを作ってファイルを二重化するのではなく、`include-hidden-files: true` を明示して正規出力先（`apps/extension/.output/*.zip`）を直接アップロードすること（KISS原則・Single Source of Truth）。

### Monorepo 内 postinstall による環境変数バリデーションと CI への環境変数供給

- **`pnpm install` 実行ジョブでの環境変数供給**:
  - Monorepo 内のパッケージ（`apps/extension` 等）の `postinstall` スクリプトで環境変数スキーマ（`@t3-oss/env-core` 等）が評価される場合、`pnpm install` を実行する全 CI/CD ジョブで必要な環境変数（テスト・ドライランジョブではダミー値、実ビルドジョブでは本番/Preview値）を確実に供給すること。未供給による `pnpm install` 異常終了を構造的に防止する。
- **環境変数の過剰スコープによるビルド設定上書きの禁止（Scoped Env 原則）**:
  - `postinstall` 等の事前バリデーションを通過させるための環境変数は、ジョブ全体のトップレベル（`env:`）ではなく、実行ステップ（`Install dependencies` 等）に局所配置すること。ジョブ全体に配置すると後続の `vercel build` や動的 Preview 設定注入ステップ、あるいは本番デプロイ（`deploy-production.yml` での Convex デプロイ等）を不要なダミー値が上書き・汚染し、デプロイ先環境の不整合や動的 URL の固定値化事故を招く。
- **書き込み権限（contents: write）付きワークフローでの GITHUB_TOKEN 永続化禁止（CWE-200）**:
  - `release-extension.yml` 等で `permissions: contents: write` を付与するワークフローでは、必ず `actions/checkout` に `persist-credentials: false` を明示すること。悪意ある依存関係やスクリプトがローカル `.git/config` からトークンを窃取するリスクを構造的に排除する。

### CI/CD における静的検証（Lint/Format）の副作用排除とローカル快適性の両立

- **ローカル `check`（`--write`）と CI `check:ci`（読み取り専用）の責務分離**:
  - CI パイプライン内で実行するコード品質検査（Biome 等）は、自動修正によって差分改変や偽陽性通過が発生する副作用を防ぐため、必ず副作用のない読み取り専用コマンド（`check:ci` / `biome ci`）を実行すること。
  - 一方でローカル開発環境の `check` スクリプトは、開発者の快適性とフォーマット自動適用を最大化するため `--write` を付与した構成を維持し、ローカルの開発生産性と CI の厳格な整合性検証を両立させる。



