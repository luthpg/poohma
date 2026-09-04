# PoohMa Domain Models & Status Transitions

PoohMa における主要ドメインエンティティの関係性、ライフサイクル、状態遷移ルールを整理する。

---

## 1. エンティティ相関図 (Entity Relationships)

```mermaid
flowchart TD
    FirebaseUser["Firebase User (userId)"] -->|"1:N"| PoohMaAccount["PoohMa Account (users._id)"]
    PoohMaAccount -->|"N:1 (familyId)"| Family["Family (families._id)"]
    
    PoohMaAccount -->|"1:N owner"| RecUser["serviceRecords (ownerType: user)"]
    PoohMaAccount -.->|"1:N admin"| RecFamily["serviceRecords (ownerType: family)"]
    
    RecUser -->|"1:N"| CredsUser["credentials (by_recordId)"]
    RecFamily -->|"1:N"| CredsFamily["credentials (by_recordId)"]
    
    Family -->|"1:N scope"| RecFamily
    Family -->|"1:N"| Invites["familyInvites"]
    Family -->|"1:N"| JoinReqs["joinRequests"]
```

---

## 2. 状態遷移とライフサイクル (State Transitions)

### 2.1 家族招待 (`familyInvites`) と参加申請 (`joinRequests`) のライフサイクル

```mermaid
flowchart TD
    Issue["既存家族メンバーが招待コード発行<br/>(familyInvites: UUID, TTL)"]
    Issue -->|"期限切れ / 手動失効 (revokedAt)"| Invalid["無効化 (申請不可)"]
    Issue -->|"有効な招待コードを共有"| Apply["申請者が参加申請を作成<br/>(joinRequests: pending)"]
    
    Apply --> Pending["pending"]
    Pending -->|"既存メンバーが承認 (approveJoinRequest)"| Approved["approved<br/>(user.familyId 更新)"]
    Pending -->|"既存メンバーが拒否 / 申請者が取り下げ"| Rejected["rejected<br/>(アクセス権なし)"]
    
    Approved --> Unlock["家族パスコード入力でマスターキー解除"]
```

- **招待コード発行**: 既存家族メンバーが有効期限（15分〜30日）を指定して発行（`createInviteCode`）。いつでも手動失効（`revokeInviteCode`）可能。
- **参加申請トリガー**: 申請者が有効な招待コード（リンク/QR）を入力して申請を作成（`createJoinRequestWithInvite`）。
- **承認時**: 既存家族メンバーのいずれかが承認（`approveJoinRequest`）すると、対象アカウントの `user.familyId` が更新され、申請者に通知。
- **拒否・取り下げ時**: 既存メンバーによる拒否（`rejectJoinRequest`）または申請者自身によるキャンセル（`cancelJoinRequest`）により `rejected` となり、家族へのアクセス権は付与されない。
- **参加完了後**: 申請者は家族パスコードを入力してマスターキーをロック解除し、家族内での利用を開始する。

---

### 2.2 家族移行トランザクション (`familyMigrations`)

```mermaid
flowchart TD
    Start["ユーザーが移行を開始 (prepareFamilyMigration)"] --> Prepared["PREPARED<br/>(移行対象レコードのスナップショット保持)"]
    Prepared -->|"30分タイムアウト / クリーンアップ"| Expired["EXPIRED"]
    Prepared -->|"手動中断 (abortFamilyMigration)"| Aborted["ABORTED"]
    Prepared -->|"クライアント側でDEK再ラップ完了<br/>(commitFamilyMigration)"| Completed["COMPLETED<br/>(所属家族・全レコードのfamilyId一括更新)"]
```

- **ステータス**:
  - `PREPARED`: 移行準備完了。移行対象のレコード一覧とスナップショットを保持。
  - `COMPLETED`: 再暗号化データの保存と `familyId` の付け替えが正常完了。
  - `EXPIRED`: 30 分以内に完了せず失効（Crons による定期クリーンアップ対象）。
  - `ABORTED`: ユーザーによる手動中断。

---

### 2.3 リカバリー 2 段階復元 (`recoveryOtps` / `recoverySessions`)

```mermaid
flowchart TD
    Req["1. 復元要求 (sendRecoveryOtp)"] --> OtpIssued["recoveryOtps 発行<br/>(有効期限10分, 最大5回試行)"]
    OtpIssued --> Verify["2. メールOTP (6桁) + リカバリーコード照合<br/>(verifyRecoveryOtpAndGetRecoveryData)"]
    
    Verify -->|"試行失敗 (< 5回)"| Retry["attempts 加算"] --> Verify
    Verify -->|"試行失敗 (>= 5回)"| Fail["recoveryOtps 削除 (失効・やり直し)"]
    
    Verify -->|"照合成功"| SessionIssued["3. OTP即時削除 + recoverySessions 発行<br/>(短命な認可セッショントークン, 有効期限10分)"]
    SessionIssued --> Rotate["4. 新パスコードでマスターキー再ラップ<br/>(redeemRecoveryAndRotatePasscode)"]
    Rotate --> Consumed["5. recoverySessions 即時消費 (削除)<br/>+ 家族メンバーへ通知"]
```

---

### 2.4 メンバーキックと Export Vault (`pendingExportVaults`) のライフサイクル

```mermaid
flowchart TD
    Kick["既存メンバーがメンバー除名実行 (kickMember)"] --> VaultCreated["pendingExportVaults 作成<br/>(旧MasterKey暗号文, TTL 30日)"]
    Kick --> FamilyCleared["被除名者の familyId を未設定（undefined）にクリア<br/>+ 共有レコード管理者調停 (reconcileAdminsOnLeave)<br/>+ 通知メール送信"]
    
    VaultCreated -->|"被除名者が旧パスコード入力<br/>(クライアントで旧MasterKeyアンラップ)"| Unlocked["移行準備完了<br/>(vaultUnlockedKey 保持)"]
    Unlocked -->|"新家族作成 / 参加時<br/>(commitFamilyMigration)"| Migrated["個人レコード (ownerType: user) のみDEK再ラップ<br/>+ pendingExportVaults 物理削除"]
    
    VaultCreated -->|"被除名者がデータ破棄を選択<br/>(abandonPendingExportVault)"| Abandoned["pendingExportVaults 物理削除<br/>(個人データは新家族へ持ち出さず破棄)"]
    VaultCreated -->|"30日タイムアウト / クローンジョブ<br/>(cleanupExpiredExportVaultsInternal)"| ExpiredVault["EXPIRED (物理削除)"]
```

- **キック実行**: 家族メンバーが他メンバーを除名（`kickMember`）。自己キックや別アカウントの指定は拒否。
- **データ分離**: 共有レコード（`ownerType: "family"`）は旧家族資産として残り、被キックユーザーの `familyId` を即時クリア。管理者であった場合は `reconcileAdminsOnLeave` で残存メンバーへ調停。
- **Export Vault 退避**: 個人レコード（`ownerType: "user"`）の持ち出しを可能にするため、旧家族の `masterKeyEncrypted`, `masterKeyIv`, `masterKeySalt`, `kdfIterations`, `cryptoVersion` を `pendingExportVaults` へ原子的に退避。
- **持ち出し完了または破棄**: 被キックユーザーが旧パスコードでアンラップして新家族へ持ち出し完了（`commitFamilyMigration`）するか、手動破棄（`abandonPendingExportVault`）、または 30日経過による自動クリーンアップ（1時間ごとの Cron）によって Vault は物理削除される。

---

## 3. レコード所有権モデルとアクセス権マトリクス

| 操作 | 個人レコード (`ownerType: "user"`) | 共有レコード (`ownerType: "family"`) |
| --- | --- | --- |
| **閲覧・復号** | 所有アカウント (`accountId === user._id`) のみ | 同一 Family に所属する PoohMa Account 全員 |
| **編集 (タイトル/メモ/タグ等)** | 所有アカウントのみ | 同一 Family に所属する PoohMa Account 全員 |
| **ヒント更新 (DEK再暗号化)** | 所有アカウントのみ | 同一 Family に所属する PoohMa Account 全員 (家族マスターキーでDEK再ラップ) |
| **共有解除 (個人へ戻す)** | 対象外 | レコード管理者 (`admins.includes(user._id)`) のみ |
| **管理者変更 (admins追加/削除)** | 対象外 | レコード管理者のみ |
| **削除** | 所有アカウントのみ | レコード管理者のみ |

---

## 4. データ整合性・カスケード削除ルール

- **レコード削除時**:
  - 親レコード（`serviceRecords`）削除時、または一括削除（`deleteRecords`）時、紐づくすべての `credentials` が `deleteCredentialsForRecord` ヘルパーによりカスケード削除される。
- **ユーザー退会時**:
  - 家族に残存メンバーがいる場合、退会者の個人レコード（`ownerType: "user"`）およびその配下の `credentials` のみを削除する。共有レコード（`ownerType: "family"`）は元の家族に残し、`reconcileAdminsOnLeave` により残存メンバーへ管理権限を調整する。
  - 退会者が家族グループの最後の 1 人である場合、その家族に紐づく全 `serviceRecords`、配下の全 `credentials`、参加申請（`joinRequests`）、招待（`familyInvites`）、および `families` レコードを削除する。
- **家族離脱時**:
  - 家族移行トランザクションの対象となる個人レコード（`ownerType: "user"`）とその `credentials` は、新マスターキーで再暗号化されて移行先へ引き継がれる。
  - 共有レコード（`ownerType: "family"`）は元の家族グループに残留する。離脱者がレコード管理者である場合、`reconcileAdminsOnLeave` が残存する家族メンバーの管理権限を調整する。
- **メンバーキック時**:
  - 被キックユーザーの個人レコード（`ownerType: "user"`）は削除されず、旧家族の暗号化マスターキー情報が `pendingExportVaults`（30日TTL）に退避され、新家族への移行（再暗号化）に備える。
  - 共有レコード（`ownerType: "family"`）は元の家族グループに残留し、被キックユーザーがレコード管理者である場合は `reconcileAdminsOnLeave` が残存メンバーの管理権限を自動調停する。
  - 移行完了時（`commitFamilyMigration`）またはユーザーによる手動破棄（`abandonPendingExportVault`）時に、`pendingExportVaults` は物理削除される。
- **同一 email アカウント再作成時のデータ引き継ぎ（`users.syncUser`）**:
  - メールアドレス未確認（`emailVerified: false`）の場合はエラーを送出して同期を拒否する。
  - 同一 email かつ別 UID の既存データが存在する場合、旧 UID の `serviceRecords.userId`、家族参加申請（`joinRequests`）、および家族移行データ（`familyMigrations`）を新 UID へ一括付け替えて引き継ぐ（所有権を示す `serviceRecords.accountId` は維持される）。

---

## 5. レコード制約・バリデーション境界 (Constraints & Limits)

巨大ドキュメント生成防止およびUI・DB・CSVインポート間の整合性担保のため、以下の制約を設けている。

- **認証情報項目数 (`credentials`)**: 最大 10 件 (`MAX_CREDENTIALS_PER_RECORD = 10`)
  - UI追加制御、Zodスキーマ、Convexミューテーション、CSVエクスポート・インポートの列定義（1〜10）で統一。
- **タグ数 (`tags`)**: 最大 20 個 (`MAX_TAGS_PER_RECORD = 20`)
  - UI入力制御、Zodスキーマ、Convex一括更新（`bulkUpdateRecords`）、CSVインポートで統一。
- **文字数上限**:
  - タイトル (`title`): 最大 255 文字（必須）
  - 読み仮名 (`titleReading`): 最大 255 文字
  - メモ (`memo`): 最大 10,000 文字
  - パスワードヒント平文: 最大 2,000 文字
  - 各タグ文字列: 最大 50 文字
