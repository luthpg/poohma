# Security Model

## 概要

本ドキュメントは、PoohMa の認証・認可・E2EE境界を含むセキュリティモデルを、実装済みの制御を中心に整理したものである。未実装の対策は「未対応」として明示し、実装済みであるかのようには記載しない。攻撃者ごとの防御と残存リスクの詳細は `THREAT_MODEL.md` を参照。

## Authentication

- ログイン手段は Firebase Authentication（Google OAuth）のみ。クライアントは `signInWithRedirect` でログインし、取得した Firebase ID トークンをサーバー関数 `syncUser` に送信する。
- サーバー側（`firebase-admin.server.ts`）が `verifyIdToken` で ID トークンを検証したうえで Convex の `users.syncUser` にユーザー情報を同期する。
- 検証後、`createSessionCookie` により httpOnly セッション Cookie（有効期限14日、本番では secure、SameSite=Lax）を発行する。以後のページロードでは `__root.tsx` の `beforeLoad` がこの Cookie を毎回検証する。
- クライアントから Convex への認証済みアクセスは、`useConvexFirebaseAuth` が現在の Firebase ID トークンをそのまま供給し、Convex 側は `auth.config.ts` の Issuer 設定（`securetoken.google.com/poohma`）でこれを直接信頼・検証する仕組みであり、Convex 独自のセッション機構は持たない。
- ログアウト時は、Firebase Admin SDK の `revokeRefreshTokens` によりリフレッシュトークンを即時失効させたうえでセッション Cookie を削除し、TanStack Query / `usePersistentQuery` のキャッシュを全クリアする。

## Authorization

- Convex 側の生の `query` / `mutation` を直接エクスポートすることを禁止し、`customBuilders.ts` の3段階のビルダーを必ず経由する運用ルールとしている。
  - `identityVerifiedQuery/Mutation`：Firebase Identity の存在のみ検証（新規ユーザー同期など）
  - `authenticatedQuery/Mutation`：Identity検証に加え `resolveAccount` による所有権検証（下記IDOR対策）
  - `familyBoundQuery/Mutation`：上記に加え、対象アカウントが家族グループに所属していることを検証
- `resolveAccount` は、呼び出し側が任意で渡す `accountId` について、その `users` レコードの `userId`（Firebase UID）が現在ログイン中の `identity.subject` と一致するかを必ず照合し、不一致であれば `Unauthorized` を送出する（他人のアカウントIDを指定してのなりすまし＝IDORの防止）。
- 上記はコード規約として徹底しており、Lint等による機械的な強制ではない。新規関数追加時のレビュー観点として `THREAT_MODEL.md` 6章にも明記している。

## Family boundary

- レコード単位のアクセス制御は `convex/rls.ts` に集約している。
  - `requireContentAccess`：レコードの `familyId` とユーザーの `familyId` が一致することに加え、個人所有（`ownerType: "user"` かつ `accountId` 一致）または家族共有（`ownerType: "family"` かつ `ownerFamilyId` 一致）のいずれかであることを検証する。
  - `requireAdminAccess`：削除・共有解除・管理者変更には、個人レコードなら本人、共有レコードなら `admins` 配列に含まれるメンバーであることを要求する。
- 現行スキーマは1ユーザー1家族グループ（`users.familyId` が単一値）を前提としており、複数家族の並行所属には対応していない。

## E2EE boundary

- サーバーはパスワードヒント・マスターキー・DEK・家族パスコード・リカバリーコードのいずれも平文では受け取らない。詳細な鍵階層・暗号化フローは `docs/security/e2ee.md` を参照。
- サービス名・URL・メモ・タグ・ログインID等のメタデータは暗号化対象外であり、E2EE境界の外側にある。これは意図的な設計判断であり、脆弱性ではない（`SECURITY.md` 「既知の設計上の非対象事項」参照）。

## Server trust model

- Convex（DB・ビジネスロジック実行基盤）、Firebase（認証）、microCMS（コンテンツ）、Resend（メール送信）、Yahoo!テキスト解析API（ふりがな取得）、Cloudflare Workers/R2（バックアップ）を、可用性・運用インフラとして信頼している。
- ただしこれらのサービスに対しても、パスワードヒント平文・鍵材料そのものは送信しない設計とし、信頼の範囲を「暗号化済みデータとメタデータの保管・配送」に限定している。
- サーバー内部のみで完結すべき通信（`getUserByFirebaseUid`）は、共有シークレット（`CONVEX_INTERNAL_SECRET`）をヘッダーで検証する内部専用エンドポイントとして分離している。
- XSS が成立しブラウザ内で任意コードが実行可能になった場合、展開済みのマスターキーや画面表示中の平文ヒントは保護できない（クライアント実行環境の健全性を前提とするため）。CSP（NFR-SEC-12）は `THREAT_MODEL.md` の時点で「部分対応・未導入」とされており、本ドキュメントでもその状態のまま記載する。

## Recovery

- パスコード忘却時の復元は、リカバリーコード（高エントロピーなランダム文字列、発行時に一度だけ提示・サーバー非保存）と、登録メールアドレスへの6桁ワンタイムパスワード（Email OTP）の2要素で構成される。
- OTP は平文で保存せず SHA-256 ハッシュのみ保持し、有効期限10分・最大試行5回・再送インターバル60秒を課す。
- OTP 検証成功時に短命なワンタイム認可セッショントークン（`recoverySessions`）を発行し、新パスコードでのマスターキー再ラップを完了した時点でこのトークンを原子的に消費（削除）する。
- リカバリーキットの発行・再発行・パスコード復元完了時は、家族メンバー全員へ通知メールを送信する。

## Session

- クライアントは Firebase ID トークンとサーバー発行のセッション Cookie という2種類の認証情報を持つ。
- セッション失効を検知した書き込み系操作は、フォーム入力を保持したまま再ログインモーダルを表示し、同一の idempotency key で自動再実行することで、二重送信や入力ロストを防ぐ（`FR-AUTH-07`）。
- アカウント切り替え時は、展開済みのマスターキーを揮発性メモリから即時破棄し、TanStack Query / IndexedDB キャッシュを連動してクリアすることで、アカウント間のデータ混用を防止する。

## WebAuthn

- 生体認証は WebAuthn の PRF 拡張を利用し、`isBiometricSupported()` で対応可否を事前判定したうえで（非対応端末では通常のパスコード入力へ自然にフォールバック）、`navigator.credentials.create()` を PRF 拡張付きで実行する。
- PRF の出力を AES-GCM 鍵としてインポートし、その鍵で平文パスコードを暗号化した結果（`credentialId` / `encryptedPasscode` / `iv` / `prfSalt`）を端末の IndexedDB にのみ保存する。サーバーへは送信しない。
- ロック解除時は同一の `prfSalt` を指定して認証器から再度 PRF 出力を取得し、保存済みの暗号化パスコードを復号したうえで通常のパスコード解除フロー（PBKDF2以降）に合流する。

## 招待・Family membership のセキュリティ

- 招待コードは恒久的な `families._id` から完全に分離した別テーブル（`familyInvites`）のランダム文字列として発行し、有効期限（15分〜30日、既定7日）を必須とする。既存メンバーはいつでも手動失効できる。
- 招待コードはあくまで「参加申請を送信する権利」であり、正式な家族参加には既存メンバーによる明示的な承認（`joinRequests` の approve）が必須の二段階構成になっている。
- どの招待コード経由で申請が行われたかを `joinRequests.invitedByCode` に記録し、`familyInvites.useCount` で使用回数を追跡できる。

## 関連ドキュメント

- Architecture Overview: `docs/architecture.md`
- E2EE Design: `docs/security/e2ee.md`
- Threat Model: `THREAT_MODEL.md`
- Security Policy: `SECURITY.md`
