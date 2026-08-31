# PoohMa Domain Models & Status Transitions

PoohMa における主要ドメインエンティティの関係性、ライフサイクル、状態遷移ルールを整理する。

---

## 1. エンティティ相関図 (Entity Relationships)

```text
[Firebase User] (userId)
       │ 1:N
       ▼
  [PoohMa Account] (users._id) ── 1:1 ── [Family] (families._id)
       │                                     │
       ├──────────────┐                      ├──────────────┐
       │ 1:N (owner)  │ 1:N (admin)          │ 1:N (scope)  │ 1:N
       ▼              ▼                      ▼              ▼
[serviceRecords] ◄── [serviceRecords]   [familyInvites]  [joinRequests]
 (ownerType: "user")  (ownerType: "family")
```

---

## 2. 状態遷移とライフサイクル (State Transitions)

### 2.1 家族参加申請 (`joinRequests`)

```text
   [招待コード利用 / 申請作成]
               │
               ▼
           [pending]
         /           \
[家族メンバー承認]   [家族メンバー拒否 / 取り下げ]
       │                   │
       ▼                   ▼
  [approved]          [rejected]
       │
[家族所属確定 (user.familyId 更新)]
```

- **トリガー**: 申請者が有効な `familyInvites` コードを用いて申請。
- **承認時**: 対象アカウントの `user.familyId` が更新され、既存家族メンバーに通知。
- **拒否時**: 申請レコードは `rejected` となり、家族へのアクセス権は付与されない。

---

### 2.2 家族移行トランザクション (`familyMigrations`)

```text
[ユーザーが移行を開始]
       │
       ▼
  [PREPARED] ── (30分タイムアウト / クリーンアップ) ──► [EXPIRED]
       │
       │ (クライアント側で全所有レコードの DEK を新マスターキーで再ラップ)
       ▼
 [COMPLETED] ── (ユーザーの所属家族・全レコードの familyId を新家族へ一括更新)
```

- **ステータス**:
  - `PREPARED`: 移行準備完了。移行対象のレコード一覧とスナップショットを保持。
  - `COMPLETED`: 再暗号化データの保存と `familyId` の付け替えが正常完了。
  - `EXPIRED`: 30 分以内に完了せず失効（Crons による定期クリーンアップ対象）。
  - `ABORTED`: ユーザーによる手動中断。

---

### 2.3 リカバリー 2 段階復元 (`recoveryOtps` / `recoverySessions`)

```text
[1. 復元要求] ──► recoveryOtps レコード作成 (有効期限10分, 最大5回試行)
       │
       ▼
[2. メール OTP (6桁) + リカバリーコード照合]
       │
       ├─ (試行失敗 < 5回) ──► attempts 加算
       ├─ (試行失敗 >= 5回) ──► recoveryOtps 削除 (失効・やり直し)
       │
       ▼ (照合成功)
[3. OTP レコード即時削除 + recoverySessions 発行] (有効期限10分)
       │
       ▼
[4. 新パスコードでマスターキー再ラップ (redeemRecoveryAndRotatePasscode)]
       │
       ▼
[5. recoverySessions レコード即時消費 (削除) + 家族メンバー全員へ通知]
```

---

## 3. レコード所有権モデルとアクセス権マトリクス

| 操作 | 個人レコード (`ownerType: "user"`) | 共有レコード (`ownerType: "family"`) |
| --- | --- | --- |
| **閲覧・復号** | 所有アカウント (`accountId === user._id`) のみ | 所属家族メンバー全員 |
| **編集 (タイトル/メモ/タグ等)** | 所有アカウントのみ | 所属家族メンバー全員 |
| **ヒント更新 (DEK再暗号化)** | 所有アカウントのみ | 所属家族メンバー全員 (家族マスターキーでDEK再ラップ) |
| **共有解除 (個人へ戻す)** | 対象外 | レコード管理者 (`admins.includes(user._id)`) のみ |
| **管理者変更 (admins追加/削除)** | 対象外 | レコード管理者のみ |
| **削除** | 所有アカウントのみ | レコード管理者のみ |

---

## 4. データ整合性・カスケード削除ルール

- **ユーザー退会時**:
  - 家族に残存メンバーがいる場合、退会者の個人レコード（`ownerType: "user"`）のみを削除する。共有レコード（`ownerType: "family"`）は元の家族に残し、`reconcileAdminsOnLeave` により残存メンバーへ管理権限を調整する。
  - 退会者が家族グループの最後の 1 人である場合、その家族に紐づく全 `serviceRecords`、参加申請（`joinRequests`）、招待（`familyInvites`）、および `families` レコードを削除する。
- **家族離脱時**:
  - 家族移行トランザクションの対象となる個人レコード（`ownerType: "user"`）は、新マスターキーで再暗号化されて移行先へ引き継がれる。
  - 共有レコード（`ownerType: "family"`）は元の家族グループに残留する。
