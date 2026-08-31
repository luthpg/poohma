# Data Model

## 概要

`apps/web/convex/schema.ts` に定義された Convex スキーマをもとに、主要エンティティとリレーションを整理したものである。Convex はスキーマレスに近い柔軟な構造を許容するが、本書は現行の `schema.ts` の定義に忠実に記載する。

## ER Diagram

```mermaid
erDiagram
    FAMILIES ||--o{ USERS : "has members"
    FAMILIES ||--o{ SERVICE_RECORDS : "owns (family-shared)"
    FAMILIES ||--o{ FAMILY_INVITES : "issues"
    FAMILIES ||--o{ JOIN_REQUESTS : "receives"
    FAMILIES ||--o{ FAMILY_MIGRATIONS : "is source/target of"
    FAMILIES ||--o{ RECOVERY_OTPS : "scopes"
    FAMILIES ||--o{ RECOVERY_SESSIONS : "scopes"
    USERS ||--o{ SERVICE_RECORDS : "owns (personal)"
    USERS ||--o{ LOGIN_EVENTS : "logs in from"
    USERS ||--o{ JOIN_REQUESTS : "submits"
    USERS ||--o{ FAMILY_MIGRATIONS : "initiates"
    USERS ||--o{ RECOVERY_OTPS : "requests"
    USERS ||--o{ FAMILIES : "issues recovery kit for"
    SERVICE_RECORDS ||--o{ CREDENTIALS : "embeds"
    FAMILY_INVITES ||--o{ JOIN_REQUESTS : "is referenced by"

    FAMILIES {
        string name
        string masterKeyEncrypted
        string masterKeyIv
        string masterKeySalt
        number kdfIterations
        number cryptoVersion
        string recoveryMasterKeyEncrypted
        string recoveryMasterKeyIv
        string recoveryMasterKeySalt
        string recoveryCodeHash
        number recoveryKdfIterations
        number recoveryCryptoVersion
        number recoveryIssuedAt
        id recoveryIssuedByAccountId
        number updatedAt
    }
    USERS {
        string userId
        string email
        string displayName
        string photoURL
        id familyId
        number createdAt
        number updatedAt
    }
    SERVICE_RECORDS {
        string title
        string titleReading
        string url
        string ogpImage
        string ogpDescription
        string memo
        string userId
        id accountId
        id familyId
        string visibility
        string ownerType
        id ownerFamilyId
        array admins
        array credentials
        array tags
        number updatedAt
    }
    CREDENTIALS {
        string id
        string label
        string loginId
        string passwordHint
        string passwordHintIv
        string passwordHintDekEncrypted
        string passwordHintDekIv
    }
    FAMILY_INVITES {
        id familyId
        string code
        string createdBy
        number createdAt
        number expiresAt
        number revokedAt
        number useCount
    }
    JOIN_REQUESTS {
        id familyId
        string userId
        id accountId
        id invitedByCode
        string status
        number createdAt
        number updatedAt
    }
    FAMILY_MIGRATIONS {
        string userId
        id accountId
        id sourceFamilyId
        id targetFamilyId
        array serviceRecordIds
        string status
        number createdAt
        number expiresAt
    }
    RECOVERY_OTPS {
        id accountId
        id familyId
        string codeHash
        number expiresAt
        number attempts
        number lastSentAt
    }
    RECOVERY_SESSIONS {
        id accountId
        id familyId
        string sessionTokenHash
        number expiresAt
    }
    LOGIN_EVENTS {
        id accountId
        string userId
        string deviceId
        string deviceName
        string ipAddress
        string location
        boolean isNewDevice
        number loginAt
    }
```

## エンティティ補足

### FAMILIES

- 家族グループ単位のレコードで、E2EEの鍵材料（マスターキー・リカバリーマスターキーの暗号化済み値、ソルト、反復回数、暗号化スキームバージョン）を保持する。
- `kdfIterations` / `cryptoVersion` をレコード単位で保持することで、将来 PBKDF2 の反復回数を引き上げた場合でも、旧パラメータで作成された既存データを後方互換的に復号できる（Issue #140）。
- `recoveryIssuedAt` / `recoveryIssuedByAccountId` は、リカバリーキットを最後に発行したメンバーと日時を記録する。家族設定画面で「誰がいつリカバリーキットを発行したか」を他メンバーに表示するために用いられる。

### USERS

- Firebase UID（`userId`）に紐づくアプリケーション内アカウント。`familyId` は単一値であり、現行スキーマは「1ユーザー1家族グループ」を前提とする（複数家族の並行所属は現行スキーマでは未対応）。

### SERVICE_RECORDS

- クレデンシャル管理の中心となるエンティティ。`ownerType`（`"user"` | `"family"`）により個人所有か家族共有かを切り替え、`ownerFamilyId` と `admins` は共有時のみ意味を持つ（Drive型ACLモデル、Issue #137）。
- `titleReading` はサービス名のふりがな（自動取得または手動編集）で、ダッシュボードの五十音順ソートに利用される（Issue #118「nameソートに読み仮名が使われていない」の修正で追加）。`ogpImage` / `ogpDescription` は登録時に自動取得したOGPメタデータのキャッシュで、いずれも平文で保存される（暗号化対象外のメタデータ）。
- `visibility`（`"PRIVATE"` | `"SHARED"`）は、`ownerType` / `ownerFamilyId` / `admins` による所有権モデル（Issue #137）導入前の**レガシーフィールド**である。新規作成・更新時は明示的に未設定へ戻され、`rls.ts` 側では `ownerType` が存在しない旧データのみを対象にした後方互換フォールバック（`legacy.visibility === "SHARED"`）としてのみ参照される。新規実装では参照しないこと。
- `credentials` は独立したテーブルではなく、`serviceRecords` 内の埋め込み配列（オブジェクト配列）フィールドとして保持される。1レコードあたり最大10件（`MAX_CREDENTIALS_PER_RECORD`）。この埋め込み配列を独立テーブルへ分離する変更（Issue #139）は本稿執筆時点で open（計画段階）であり、実現した場合は本ER図の見直しが必要になる。
- インデックス：`by_userId`, `by_accountId`, `by_family_sortKey`（家族内の並び順取得）, `by_ownerType_accountId`, `by_ownerType_ownerFamilyId`（フルテーブルスキャンを避けた効率的な取得に利用）。

### FAMILY_INVITES / JOIN_REQUESTS

- 招待コード（`familyInvites`）と参加申請（`joinRequests`）は明確に分離されたテーブルであり、招待コード自体は「参加申請を送る権利」のみを表す（Issue #132）。実際の参加確定には `joinRequests.status` が `approved` になった上での別操作（`joinFamily`）が必要。

### FAMILY_MIGRATIONS

- 家族グループの乗り換え（同一ユーザーが別の家族グループへ移る操作）を、準備（PREPARED）→確定（COMPLETED）／中断（ABORTED）／失効（EXPIRED）の状態遷移で管理する。
- `serviceRecordIds` に移行対象レコードのスナップショットを保持し、チャンク単位の再暗号化処理と楽観的ロック検証（Issue #174, #190）に用いる。

### RECOVERY_OTPS / RECOVERY_SESSIONS

- リカバリー時の2要素目（Email OTP）とその検証後に発行される短命な認可セッションを、それぞれ別テーブルとして分離している（Issue #134）。OTPコード・セッショントークンはいずれも平文ではなくハッシュのみ保存する。

### LOGIN_EVENTS

- ログイン通知・新規端末検知のための監査ログ。`isNewDevice` により初回端末からのログインを判定する。

## 関連ドキュメント

- [Architecture Overview](../architecture.md)
- [E2EE Design](../security/e2ee.md)
- [Threat Model](../security/threat-model.md)
- [Security Model](../security/security-model.md)
