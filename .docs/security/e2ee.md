# E2EE Design

## 概要

PoohMa の E2EE は「実際のパスワードではなく、家族だけがわかるパスワードのヒントを守る」ことを目的とする。サービス名・URL・メモ・タグ・ログインID等のメタデータは暗号化対象外であり、これは設計上の意図的な非対象である（詳細は [Threat Model](./threat-model.md) 5章、Issue #2で確認済み）。

鍵管理はエンベロープ暗号化（封筒暗号化）方式で、家族パスコード・マスターキー・DEK（Data Encryption Key）の三層構造を持つ。実装は `apps/web/src/lib/crypto.ts`（Web Crypto API, AES-GCM / PBKDF2）による。

## Key Hierarchy

```mermaid
flowchart TB
    %% ==========================================
    %% Theme & Class Definitions (Dark/Light Safe)
    %% ==========================================
    classDef inputNode fill:#4338ca,stroke:#3730a3,stroke-width:2px,color:#ffffff;
    classDef derivedNode fill:#0284c7,stroke:#0369a1,stroke-width:2px,color:#ffffff;
    classDef masterNode fill:#d97706,stroke:#b45309,stroke-width:2px,color:#ffffff;
    classDef dekNode fill:#059669,stroke:#047857,stroke-width:2px,color:#ffffff;
    classDef hintNode fill:#e11d48,stroke:#be123c,stroke-width:2px,color:#ffffff;

    subgraph PasscodeFlow["🔑 通常アクセス経路（パスコード認証）"]
        Passcode["<b>家族パスコード</b><br/>(ユーザー記憶 / サーバー非保存)"]:::inputNode
        KEK["<b>パスコード導出鍵 (KEK)</b><br/>AES-GCM 256<br/>PBKDF2-SHA256 (300k iter)"]:::derivedNode
    end

    subgraph RecoveryFlow["🆘 緊急復元経路（リカバリーキット）"]
        RecoveryCode["<b>リカバリーコード</b><br/>(高エントロピー文字列 / サーバー非保存)"]:::inputNode
        RK["<b>リカバリー導出鍵</b><br/>AES-GCM 256<br/>HKDF-SHA256"]:::derivedNode
    end

    subgraph MasterKeyLayer["🏛️ 家族マスターキー層"]
        MK["<b>家族マスターキー</b><br/>AES-GCM 256<br/>(families.masterKeyEncrypted)"]:::masterNode
    end

    subgraph DataEncryptionLayer["📄 データ暗号化層 (レコード単位)"]
        DEK["<b>個別 DEK (Data Encryption Key)</b><br/>AES-GCM 256<br/>(credentials[].passwordHintDekEncrypted)"]:::dekNode
        Hint["🔒 <b>暗号化済みパスワードヒント</b><br/>(credentials[].passwordHint)"]:::hintNode
    end

    Passcode -->|PBKDF2 導出| KEK
    KEK -->|unwrapKey| MK

    RecoveryCode -->|HKDF 導出 + OTP検証| RK
    RK -->|unwrapKey| MK

    MK -->|wrapKey / unwrapKey<br/>クレデンシャル毎に生成| DEK
    DEK -->|AES-GCM encrypt / decrypt| Hint

    %% Subgraph Styling
    style PasscodeFlow fill:#4338ca15,stroke:#4338ca,stroke-width:1.5px,stroke-dasharray: 4 2;
    style RecoveryFlow fill:#0284c715,stroke:#0284c7,stroke-width:1.5px,stroke-dasharray: 4 2;
    style MasterKeyLayer fill:#d9770615,stroke:#d97706,stroke-width:1.5px,stroke-dasharray: 4 2;
    style DataEncryptionLayer fill:#05966915,stroke:#059669,stroke-width:1.5px,stroke-dasharray: 4 2;
```

### 家族パスコード

- 家族メンバーの記憶のみに存在し、サーバー・ブラウザいずれにも保存しない。

### パスコード導出鍵（KEK相当）

- `deriveKeyFromPasscode(passcode, salt)` により PBKDF2-SHA256 で導出する。反復回数は既定 300,000 回で、`families.kdfIterations` としてスキーマ管理し、将来の反復回数引き上げ後も旧パラメータで作成された既存データを復号できるようにしている（Issue #140）。
- この鍵で `families.masterKeyEncrypted` / `masterKeyIv` を unwrap し、マスターキーを得る。

### マスターキー

- 家族グループ共通の AES-GCM 256 鍵。`families.masterKeyEncrypted` / `masterKeyIv` / `masterKeySalt` として保存される（常に暗号化済みの状態のみ）。
- 認証情報（クレデンシャル）を1件登録するたびに `generateDEK()` で新規生成した DEK をこのマスターキーで wrap する。

### DEK（Data Encryption Key）

- 認証情報1件ごとに生成される AES-GCM 256 鍵。`serviceRecords.credentials[].passwordHintDekEncrypted` / `passwordHintDekIv` としてマスターキーでラップされた状態で保存される。
- このDEKでパスワードヒント本体を暗号化し、`credentials[].passwordHint` / `passwordHintIv` として保存する。
- DEK が存在しない旧形式のレコード（移行期のデータ）は、読み取り時のみマスターキーで直接復号する互換パスを持つが、新規の暗号化・再暗号化では常に DEK を必須とする。
- なお `credentials` は現状 `serviceRecords` の埋め込み配列であり、独立テーブルへの分離は計画段階（Issue #139, open）にある。

## Encryption / Decryption Flow

```mermaid
sequenceDiagram
    autonumber
    actor U as 👤 ユーザー (Client)
    participant B as 💻 ブラウザ暗号化 (crypto.ts)
    participant S as ☁️ バックエンド (Convex)

    Note over U,B: クレデンシャル登録・暗号化フロー
    U->>B: 家族パスコード入力
    B->>B: PBKDF2 で導出鍵 (KEK) 生成
    B->>B: 導出鍵で masterKeyEncrypted を unwrap (マスターキー展開)
    B->>B: generateDEK() で新規 DEK (AES-GCM 256) 生成
    B->>B: マスターキーで DEK を wrapKey
    B->>B: DEK でパスワードヒントを encrypt
    B->>S: 暗号化済みDEK・暗号化済みヒント・平文メタデータを送信 (createRecord)
    S->>S: 復号せず暗号文のまま DB 保存

    Note over U,S: ※ サーバーは常に暗号化データのみを扱い、平文ヒント・鍵材料は到達しない
```

## Key Lifecycle

### Passcode 変更（パスコードのみのローテーション）

- マスターキー自体は変更しない。展開済みのマスターキーを、新しいパスコードから導出した新しい鍵で再 wrap するのみ。
- `families.rotatePasscode` は `masterKeyEncrypted` / `masterKeyIv` / `masterKeySalt` / `kdfIterations` / `cryptoVersion` のみを更新する（Issue #138）。各レコードの DEK・パスワードヒントは一切変更されない（マスターキーが不変のため）。
- Compare-And-Swap により複数端末・複数メンバーからの同時更新の競合を防止する。
- リカバリーキーが発行済みの場合、`recoveryMasterKeyEncrypted` は同一マスターキーへの別経路のラップであるため、このパスコード変更による影響を受けず有効なまま残る。

### Key Rotation（家族移行に伴う再暗号化）

- 家族グループそのものを移る（家族移行）場合はマスターキーが変わるため、DEK の再ラップが必要になる。
- クライアント側で旧マスターキーにより各 DEK を unwrap し、新マスターキーで再 wrap する（パスワードヒント本体は再暗号化不要、DEK の付け替えのみ）。
- 処理はチャンク（バッチ）単位に分割して送信し、各チャンクはレコードの `updatedAt` を前提条件とした楽観的ロックで検証する（Issue #174, #190、いずれもclosed）。
- **未実装の拡張**：処理途中でのタブクローズ等からのより堅牢な中断・再開を目的とした、Web Worker + IndexedDB ベースの専用アーキテクチャ（Issue #111）は、本稿執筆時点で open（計画中）であり、まだ実装されていない。現状はメインスレッド上でのチャンク処理として動作している。

### Recovery

- パスコードとは別に、リカバリーコード（高エントロピーなランダム文字列、サーバー非保存・発行時に一度だけ提示、Issue #134「致命的なデータ喪失を防ぐ『リカバリーキット（復元コード）』の発行」、closed）経由の入口を用意する。
- リカバリーコードから HKDF-SHA256 で導出した鍵で `families.recoveryMasterKeyEncrypted` / `recoveryMasterKeyIv` を unwrap すると、パスコード経路と同一のマスターキーに到達する。
- 復元時はリカバリーコード単体では成立せず、登録メールアドレスへの6桁 Email OTP（SHA-256ハッシュ保存、有効期限10分、最大5回試行、60秒レート制限）の検証が必須の2要素構成になっている。
- 再発行のたびに旧リカバリー暗号情報は完全上書き・破棄され、旧コードは即座に無効化される。

## サーバーが参照可能な情報 / できない情報

| 区分 | 参照可能 | 参照不可 |
| --- | --- | --- |
| パスワードヒント平文 | | 不可（`credentials[].passwordHint` は常に暗号化済み） |
| マスターキー・DEK平文 | | 不可（`masterKeyEncrypted` / `passwordHintDekEncrypted` は常に暗号化済み） |
| 家族パスコード・リカバリーコード | | 不可（サーバーに送信されない） |
| サービス名・URL・メモ・タグ・ログインID | 可（平文保存） | |
| 家族構成（メンバー一覧、招待コードのメタデータ） | 可 | |
| リカバリーコード自体 | | 不可（`recoveryCodeHash` としてハッシュのみ保存） |

## 関連ドキュメント

- [Architecture Overview](../architecture.md)
- [Threat Model](./threat-model.md)
- [Security Model](./security-model.md)
- [Security Policy](../../SECURITY.md)

