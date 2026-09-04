# Security Model

## 概要

本ドキュメントは、PoohMa の認証・認可・E2EE境界を含むセキュリティモデルを、実装済みの制御を中心に整理したものである。未実装の対策は「未対応」として明示し、実装済みであるかのようには記載しない。攻撃者ごとの防御と残存リスクの詳細は [Threat Model](./threat-model.md) を参照。

## Authentication

- ログイン手段は Firebase Authentication（Google OAuth）のみ。クライアントは `signInWithRedirect` でログインし、取得した Firebase ID トークンをサーバー関数 `syncUser` に送信する。
- サーバー側（`firebase-admin.server.ts`）が `verifyIdToken` で ID トークンを検証したうえで Convex の `users.syncUser` にユーザー情報を同期する。別UIDへの引き継ぎ時に `serviceRecords.userId`、`joinRequests`、`familyMigrations` が孤児化する不具合はIssue #188で修正済み（所有権を示す `serviceRecords.accountId` は維持）。
- 検証後、`createSessionCookie` により httpOnly セッション Cookie（有効期限14日、本番では secure、SameSite=Lax）を発行する。セッション Cookie は SSR 初期表示用キャッシュおよびサーバー処理用の補助セッションであり、以後のページロードでは `__root.tsx` の `beforeLoad` がこの Cookie をローカル公開鍵検証（`checkRevoked: false`）して初期ユーザー情報を取得する。Cookie が失効していてもブラウザの Firebase Auth 永続セッションが生きていれば自動で再同期・ローリング延長（`refreshSessionCookie` 内で失効検証を実施）され、意図しないログアウトを防止する。
- クライアントから Convex への認証済みアクセスは、`useConvexFirebaseAuth` が現在の Firebase ID トークンをそのまま供給し、Convex 側は `auth.config.ts` の Issuer 設定（`securetoken.google.com/poohma`）でこれを直接信頼・検証する仕組みであり、Convex 独自のセッション機構は持たない。
- ログアウト時は、Firebase Admin SDK の `revokeRefreshTokens` によりリフレッシュトークンを即時失効させたうえでセッション Cookie を削除し、TanStack Query / `usePersistentQuery` のキャッシュを全クリアする。またクライアント側でも `signOut` と、`localStorage` へのログアウトフラグ（`LOGOUT_FLAG_KEY`）設定・クロス多タブ通知（`storage` イベント）により、他タブでの再認証やリカバリー処理（`getCustomTokenFromSession` における `checkRevoked: true` 検証）による意図しないセッション復元を確実に遮断する。

## Authorization

- Convex 側の生の `query` / `mutation` を直接エクスポートすることを禁止し、`customBuilders.ts` の3段階のビルダーを必ず経由する運用ルールとしている。
  - `identityVerifiedQuery/Mutation`：Firebase Identity の存在のみ検証（新規ユーザー同期など）
  - `authenticatedQuery/Mutation`：Identity検証に加え `resolveAccount` による所有権検証（下記IDOR対策）
  - `familyBoundQuery/Mutation`：上記に加え、対象アカウントが家族グループに所属していることを検証
- `resolveAccount` は、呼び出し側が任意で渡す `accountId` について、その `users` レコードの `userId`（Firebase UID）が現在ログイン中の `identity.subject` と一致するかを必ず照合し、不一致であれば `Unauthorized` を送出する（他人のアカウントIDを指定してのなりすまし＝IDORの防止）。
- 上記はコード規約として徹底しており、Lint等による機械的な強制ではない。新規関数追加時のレビュー観点として [Threat Model](./threat-model.md) 6章にも明記している。

## Family boundary

- レコード単位のアクセス制御は `convex/rls.ts` に集約している。
  - `requireContentAccess`：レコードの `familyId` とユーザーの `familyId` が一致することに加え、個人所有（`ownerType: "user"` かつ `accountId` 一致）または家族共有（`ownerType: "family"` かつ `ownerFamilyId` 一致）のいずれかであることを検証する。
  - `requireAdminAccess`：削除・共有解除・管理者変更には、個人レコードなら本人、共有レコードなら `admins` 配列に含まれるメンバーであることを要求する。共有レコードの公開設定（visibility）改ざんによるIDORはIssue #186で修正済み。非管理者でも誰が管理者かは閲覧可能（Issue #211）。
  - なお `serviceRecords.visibility` フィールドは `ownerType` モデル導入前のレガシー値であり、`ownerType` を持たない旧データに対する読み取り専用の後方互換フォールバックとしてのみ参照される（`docs/architecture/data-model.md` 参照）。
- 現行スキーマは1ユーザー1家族グループ（`users.familyId` が単一値）を前提としており、複数家族の並行所属には対応していない（複数家族対応はIssue #34で一度closeされているが、現行スキーマの制約としては単一家族が前提）。

## メンバーキックと Export Vault（E2EEデータ保護・持ち出し境界）

- **メンバーキック**: 家族メンバーは他メンバーを強制除名（キック）できる（`kickMember`）。キックされたユーザーの `users.familyId` は即時に未設定（`undefined`）となり、RLS（`convex/rls.ts`）によって旧家族の全共有レコードへのアクセス権が即座に遮断される。
- **共有レコードの保護と管理者調停**: 家族共有レコード（`ownerType: "family"`）は旧家族の不可侵資産として旧家族内に残存し、被キックユーザーが持ち出すことはできない。被キックユーザーが共有レコードの唯一の管理者であった場合は、`reconcileAdminsOnLeave` により旧家族の残存メンバーへ管理者権限が自動移譲される。
- **個人所有レコードの持ち出し保証（Export Vault）**: 被キックユーザーの個人所有レコード（`ownerType: "user"`）は、作成者個人の資産として保護される。キック実行時に Convex サーバーは旧家族の暗号化マスターキー情報（`masterKeyEncrypted`, `masterKeyIv`, `masterKeySalt`, `kdfIterations`, `cryptoVersion`）を `pendingExportVaults` テーブルへ原子的に退避する。
- **平文非保持と暗号学的隔離**: サーバーに保存されるのは暗号化されたマスターキー情報のみであり、サーバーはマスターキーやパスコードの平文を一切受け取らない。被キックユーザーは旧パスコードを入力することでクライアント側でのみ旧マスターキーをアンラップし、個人レコードのDEKを復号した上で新家族のマスターキーで再暗号化（DEK再ラップ）してマイグレーションを完了する。
- **有効期限（TTL）と確実な破棄**: `pendingExportVaults` には 30日間の有効期限（`expiresAt`）が設定され、1時間ごとのクロンジョブ（`cleanupExpiredExportVaultsInternal`）により期限切れレコードは自動で物理削除される。また、新家族へのマイグレーション完了時（`commitFamilyMigration`）またはユーザーによる明示的な破棄（`abandonPendingExportVault`）時にも即時物理削除される。
- **残存パスコードの無力化（ローテーション連携）**: 被キックユーザーは旧パスコードを知っているため、キック完了時に残存メンバーに対してパスコードローテーション（`FR-FAM-10`）の実施を強く推奨・誘導し、旧パスコードによる潜在的リスクを無力化する運用・UIフローを設けている。

## E2EE boundary

- サーバーはパスワードヒント・マスターキー・DEK・家族パスコード・リカバリーコードのいずれも平文では受け取らない。詳細な鍵階層・暗号化フローは [E2EE Design](./e2ee.md) を参照。
- サービス名・URL・メモ・タグ・ログインID等のメタデータは暗号化対象外であり、E2EE境界の外側にある。これは意図的な設計判断であり、脆弱性ではない（[`SECURITY.md`](../../SECURITY.md) 「既知の設計上の非対象事項」参照）。

## Server trust model

- Convex（DB・ビジネスロジック実行基盤）、Firebase（認証）、microCMS（コンテンツ）、Resend（メール送信）、Yahoo!テキスト解析API（ふりがな取得）、Cloudflare Workers/R2（バックアップ）を、可用性・運用インフラとして信頼している。
- ただしこれらのサービスに対しても、パスワードヒント平文・鍵材料そのものは送信しない設計とし、信頼の範囲を「暗号化済みデータとメタデータの保管・配送」に限定している。
- サーバー内部のみで完結すべき通信（`getUserByFirebaseUid`）は、共有シークレット（`CONVEX_INTERNAL_SECRET`）をヘッダーで検証する内部専用エンドポイントとして分離している。
- CSP（Content Security Policy）は `apps/web/src/start.ts` のサーバーミドルウェアで全GETリクエストに適用済み（Issue #128、closed）。`default-src 'none'` を基本に、`script-src` はリクエストごとに発行されるnonceと `strict-dynamic` のみを許可し、`frame-ancestors 'none'` でクリックジャッキングを防止する。あわせて `X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`、カメラ・マイク・位置情報を無効化しWebAuthn関連APIのみ自オリジンで許可する `Permissions-Policy` も同時に設定される。環境変数 `CSP_MODE` により、強制モードとレポートのみモード（`Content-Security-Policy-Report-Only`）を切り替えられる。
- XSS が成立しブラウザ内で任意コードが実行可能になった場合、展開済みのマスターキーや画面表示中の平文ヒントは保護できない（クライアント実行環境の健全性を前提とするため）。上記のCSPはこのリスクを軽減する主要な対策の一つだが、完全な防御を保証するものではない。
- **Google Drive / Google Picker（オプトイン機能）**：リカバリーキットPDFの保存先としてユーザーが任意で選択できる。Firebase Authentication を通じて `drive.file` スコープ（アプリが作成したファイル・フォルダ、および Google Picker を通じてユーザーが明示的に開く、選択する、またはアプリと共有する既存の Drive アイテムにアクセス可能）の追加同意を取得し、マイドライブ直下、新規作成フォルダ（「PoohMa」）、または Google Picker で選択したフォルダ（マイドライブ/共有ドライブ）へクライアントから直接アップロードする。PoohMa のサーバーはこの通信を一切中継せず、ユーザーの既存 Drive 全体への広範なアクセス権は要求しない。この機能を利用しない場合、Google Drive との通信は一切発生しない。

## Recovery

- パスコード忘却時の復元は、リカバリーコード（高エントロピーなランダム文字列、発行時に一度だけ提示・サーバー非保存）と、登録メールアドレスへの6桁ワンタイムパスワード（Email OTP）の2要素で構成される（Issue #134）。
- OTP は平文で保存せず SHA-256 ハッシュのみ保持し、有効期限10分・最大試行5回・再送インターバル60秒を課す。
- OTP 検証成功時に短命なワンタイム認可セッショントークン（`recoverySessions`）を発行し、新パスコードでのマスターキー再ラップを完了した時点でこのトークンを原子的に消費（削除）する。
- リカバリーキットの発行・再発行・パスコード復元完了時は、家族メンバー全員へ通知メールを送信する。発行者・発行日時は `families.recoveryIssuedByAccountId` / `recoveryIssuedAt` に記録され、家族設定画面で他メンバーに開示される。
- リカバリーキットPDFの保存方法はローカル保存・印刷・Google Drive（オプトイン）から選択できる。いずれの方法を選んでもPDFの生成・暗号化された値自体はクライアント側で完結しており、PoohMaのサーバーはPDFの内容を受け取らない。

## Session

- 長期ログイン状態の本体（Single Source of Truth）はブラウザ側の Firebase Auth（LOCAL 永続性）であり、ユーザーが明示的にログアウトしない限り数ヶ月単位で維持される。
- サーバー発行のセッション Cookie は SSR キャッシュおよびサーバー処理用の補助セッションであり、14 日間有効。利用中のトークン更新時に自動ローリング延長される。
- 無操作タイムアウトが発生すると、展開済みのマスターキーと画面上に表示中のパスワードヒントの両方を自動的にクリアする（Issue #122）。タイムアウト時間はユーザーが変更可能（既定5分、0を指定すると無効化）。
- セッション失効を検知した書き込み系操作は、フォーム入力を保持したまま再ログインモーダルを表示し、同一の idempotency key で自動再実行することで、二重送信や入力ロストを防ぐ（`FR-AUTH-07`）。
- アカウント切り替え時は、展開済みのマスターキーを揮発性メモリから即時破棄し、TanStack Query / IndexedDB キャッシュを連動してクリアすることで、アカウント間のデータ混用を防止する。

## WebAuthn

- 生体認証は WebAuthn の PRF 拡張を利用し、`isBiometricSupported()` で対応可否を事前判定したうえで（非対応端末では通常のパスコード入力へ自然にフォールバック、Issue #146）、`navigator.credentials.create()` を PRF 拡張付きで実行する。Safari / iOS 向けには `residentKey: required` を指定する対応が別途行われている（Issue #193）。
- PRF の出力を AES-GCM 鍵としてインポートし、その鍵で平文パスコードを暗号化した結果（`credentialId` / `encryptedPasscode` / `iv` / `prfSalt`）を端末の IndexedDB にのみ保存する。サーバーへは送信しない。
- ロック解除時は同一の `prfSalt` を指定して認証器から再度 PRF 出力を取得し、保存済みの暗号化パスコードを復号したうえで通常のパスコード解除フロー（PBKDF2以降）に合流する。パスコード誤入力時は指数バックオフと一時ロックアウトが適用される（Issue #192）。

## 招待・Family membership のセキュリティ

- 招待コードは恒久的な `families._id` から完全に分離した別テーブル（`familyInvites`）のランダム文字列として発行し、有効期限（15分〜30日、既定7日）を必須とする（Issue #132）。既存メンバーはいつでも手動失効できる。
- 招待コードはあくまで「参加申請を送信する権利」であり、正式な家族参加には既存メンバーによる明示的な承認（`joinRequests` の approve）が必須の二段階構成になっている。
- どの招待コード経由で申請が行われたかを `joinRequests.invitedByCode` に記録し、`familyInvites.useCount` で使用回数を追跡できる。

## 関連ドキュメント

- [Architecture Overview](../architecture.md)
- [E2EE Design](./e2ee.md)
- [Threat Model](./threat-model.md)
- [Security Policy](../../SECURITY.md)
