# PoohMa Pitfalls & Gotchas

AI Agent が誤りやすい点、過去に問題となった点、実装上の罠を整理する。

---

## 1. 実行環境 & シェル (Windows PowerShell)

### `&&` 演算子の使用禁止

- **問題**: Windows PowerShell 7 未満では `&&` が構文エラーになる。
- **回避法**: コマンドの連続実行は避け、個別実行する。やむを得ず連続実行する場合は、各外部コマンドの直後に `$LASTEXITCODE` を確認し、非ゼロなら次のコマンドを実行する前に停止または失敗を報告する（例: `cmd1; if ($LASTEXITCODE -ne 0) { throw "cmd1 failed: $LASTEXITCODE" }; cmd2; if ($LASTEXITCODE -ne 0) { throw "cmd2 failed: $LASTEXITCODE" }`）。

### 丸括弧 `()` を含むパスの誤解釈

- **問題**: `src/routes/(app)/records/$id.tsx` のようなパスをクォートなしで渡すと PowerShell が式として解釈しエラーになる。
- **回避法**: パスは必ずクォートで囲み、`$id` のようなリテラルの `$` を含む場合はシングルクォートを使用する（例: `git add 'src/routes/(app)/records/$id.tsx'`）。

### 日本語コミットメッセージ・PR本文の文字化け

- **問題**: PowerShell の標準パイプライン（`|`）や `-m` 引数はエンコーディングにより日本語が `?` に化ける。
- **回避法**: 必ず **UTF-8 一時ファイルを経由** して `git commit -F $tmpMsgFile` や `gh pr create --body-file $tmpBodyFile` を実行する（GEMINI.md Rule 4, 5）。

---

## 2. Convex & バックエンド開発

### `convex dev` の常駐プロセス

- **問題**: `convex dev` はファイル変更監視モードで常駐するため、AI Agent のセッションが終了しなくなる。
- **回避法**: ワンショットで完了する `pnpm convex:sync`（デプロイ+codegen+フォーマット）または `pnpm convex:codegen` のみを使用する。

### ConvexHttpClient の共有による状態汚染

- **問題**: `ConvexHttpClient` に `setAuth(token)` を呼ぶとクライアント内部に認証状態が保持されるため、モジュールグローバルで共有するとマルチユーザー間で認証情報が混混する。
- **回避法**: Server Functions 内でリクエストごとに `new ConvexHttpClient()` を生成する。

### 生の Convex query / mutation の直接 export

- **問題**: 認可チェックや `resolveAccount` を通さずに Convex 関数を公開すると、未認証アクセスや IDOR 脆弱性の原因になる。
- **回避法**: 必ず `convex/customBuilders.ts` のビルダー（`authenticated*`, `familyBound*` 等）を使用する。

### レコード所有権判定の直接参照

- **問題**: `record.ownerType === "family"` や `record.admins` を直接参照すると、移行前の旧レコード（`visibility: "SHARED"`）で正しく判定できない。
- **回避法**: 必ず `convex/rls.ts` の `getEffectiveOwnerType(record)`, `getEffectiveAdmins(record)` ヘルパーを使用する。

---

## 3. 暗号化 (E2EE) & WebAuthn

### WebAuthn PRF 拡張の役割の誤解

- **問題**: PRF 拡張が生体認証によるマスターキー直接導出や認証バイパスを行っていると誤認しやすい。
- **実際**: PRF 拡張は「家族パスコードをローカル IndexedDB に暗号化保存し、次回以降のパスコード入力を生体認証で代行する」ためだけに利用されている。復号されたパスコードは通常の `unlock(passcode)`（PBKDF2 鍵導出）に渡される。

### CryptoKey の `extractable` と `keyUsages` の不整合

- **問題**: `generateDEK()` や `unwrapMasterKey()` で `extractable: false` に設定すると、後の再ラップ（`wrapKey`）や家族移行処理でエクスポートできずランタイムエラーになる。また DEK の usages に不要な `wrapKey` を含めると暗号化仕様の整合性を欠く。
- **回避法**: `apps/web/src/lib/crypto.ts` の既存関数（`generateDEK`, `wrapMasterKey`, `unwrapDEK`）のパラメータ設計を厳守し、独自に `crypto.subtle.generateKey` を呼ばない。

### `KDF_VERSIONS` の変更による既存データ復号不能

- **問題**: パスコード反復回数を引き上げる際に `KDF_VERSIONS[1]` の値を書き換えると、既存ファミリーのデータが復号できなくなる。
- **回避法**: `KDF_VERSIONS` は新しいバージョン番号（2, 3...）を追記し、既存エントリは絶対に変更しない。

---

## 4. モノレポ・品質検証・ドキュメント

### Biome の Markdown 非対応

- **問題**: `pnpm check` で `.ai/*.md` や `.docs/*.md` のフォーマットやリンク切れを検出しようとする。
- **実際**: Biome 2.x は Markdown をパース/チェックしない。ドキュメントの整合性確認は手動または専用スクリプトで行う。

### ドキュメント更新の失念

- **問題**: DB スキーマ、API 仕様、E2EE 方式、脅威モデルに関わるコード変更を行った後、`.docs/` や `docs/security/threat-model.md` の更新を忘れてコミットしてしまう。
- **回避法**: 実装計画時およびコミット前に必ずドキュメント更新要否を確認する（GEMINI.md Rule 6）。
