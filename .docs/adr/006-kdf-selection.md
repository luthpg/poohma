# ADR-006: KDF Selection (PBKDF2 vs Argon2id)

## Status

Accepted

## Context

PoohMa では、家族パスコードからマスターキー暗号化用の鍵を導出するために、パスワードベース鍵導出関数（KDF: Key Derivation Function）を使用する。
パスコードは人間が記憶・入力する文字列であるため、万が一サーバー侵害やバックアップ流出（脅威モデル T1）によって暗号化済みマスターキー（`families.masterKeyEncrypted`）とソルトが入手された場合、攻撃者によるオフライン総当たり攻撃（ブルートフォース・辞書攻撃）に対する耐性が重大なセキュリティ要件となる。

現代の暗号学・セキュリティ標準において、パスワードハッシュおよび鍵導出アルゴリズムとしては、メモリハード（Memory-hard）関数である **Argon2id**（RFC 9106、Password Hashing Competition 勝者）がデファクトスタンダードとして推奨されている。
これに対し、従来の **PBKDF2**（RFC 8018）は計算集約型であり、GPU や専用ハードウェア（ASIC/FPGA）による大規模な並列攻撃に対して耐性が相対的に低いとされる。

このため、PoohMa のクライアントサイド暗号化において、Argon2id を導入するか、ブラウザ標準の Web Crypto API に組み込まれている PBKDF2 を採用するかを判断する必要があった。

## Decision

ブラウザネイティブの Web Crypto API（`SubtleCrypto.deriveKey`）で提供される **PBKDF2-SHA256（300,000回反復）** を採用し、Argon2id は採用しないこととした。

反復回数は、モバイル・低スペック端末での実用的な応答性（約100〜300ms以内）と総当たりコストのバランスから 300,000回（OWASP 推奨水準）を選択した。
また、ADR-002（Issue #140）に基づき、反復回数（`kdfIterations`）および暗号化スキームバージョン（`cryptoVersion`）は `families` テーブルでスキーマ管理され、将来的な反復回数の引き上げや KDF アルゴリズムの段階的移行が可能な設計としている。

## Alternatives

- **Argon2id（WebAssembly / JavaScript 実装）**:
  - **メリット**: メモリハード関数であるため、GPU や ASIC を用いたオフライン並列クラック攻撃に対して PBKDF2 より圧倒的に高い耐性を持つ。
  - **不採用の理由**:
    1. **Web 標準（Web Crypto API）の非サポート**: W3C の Web Cryptography API 仕様には Argon2 / Argon2id が含まれておらず、ブラウザネイティブ（C++実装）の API が存在しない。
    2. **バンドルサイズと依存関係の肥大化**: ブラウザで動作させるには WebAssembly（Wasm）バイナリおよび JavaScript ラッパーライブラリ（`hash-wasm`、`argon2-browser` 等）をバンドルまたは動的フェッチする必要があり、数十〜数百KB のオーバーヘッドが生じる。初期ロード体験や初回実行パフォーマンスを損なう。
    3. **実行環境・厳格な CSP との摩擦**: WebAssembly のロード・実行には Content Security Policy（CSP）において `'wasm-unsafe-eval'` ディレクティブ等の許可が必要となる場合があり、本プロジェクトが採用している nonce ベースの厳格な CSP（`strict-dynamic`、Issue #128）の堅牢性・攻撃対象領域の最小化方針と衝突する。
    4. **低リテラシー・家族向け端末でのリソース制約**: Argon2id の耐性はメモリ確保量（例: 64MB〜256MB）に依存するが、家族向けアプリとして利用されるスマートフォン（iOS Safari, Android Chrome）や低スペック端末のバックグラウンド動作・低メモリ環境下で、OOM（Out of Memory）やタブクラッシュを引き起こすリスクがある。
- **scrypt（WebAssembly 実装）**:
  - Argon2id と同様にメモリハード関数であるが、Web Crypto API 標準外であり、Argon2id と同様の Wasm 依存・バンドルサイズ・メモリ消費の課題を抱えるため不採用。
- **PBKDF2（反復回数を低めに固定）**:
  - レガシーな 10,000回などの低反復回数は、現代の計算資源では総当たり攻撃に対して不十分であるため不採用。端末性能と安全性を考慮し 300,000回とした。

## Consequences

- **バンドルサイズ 0KB・高速起動**: ブラウザネイティブの Web Crypto API のみを使用するため、外部暗号ライブラリの追加が一切不要であり、バンドルサイズの増大や Wasm のコンパイル遅延が発生しない。
- **完全なクロスブラウザ互換性と安定性**: PC・スマートフォンの全モダンブラウザ（Safari, Chrome, Firefox, Edge）で追加ライブラリなしに完全に同一かつ安定した動作が保証される。
- **厳格な CSP の維持**: Wasm 関連の緩和ディレクティブを CSP に追加する必要がなく、高水準の XSS 防御強度を保つことができる。
- **GPU 総当たり耐性のトレードオフ（残存リスクと多層防御）**:
  - Argon2id に比べ、専用 GPU クラスタによるオフライン総当たり攻撃の耐性は劣る。
  - このトレードオフを相殺するため、PoohMa では以下の多層防御を実施している：
    1. パスコード作成時の強度バリデーション（`@zxcvbn-ts` によるスコア2以上・最低10文字の強制）
    2. クライアント側での誤入力時の指数バックオフ・一時ロックアウト（FR-CRYPT-04）
    3. `families.kdfIterations` / `families.cryptoVersion` によるスキーマ管理により、将来 Web 標準にメモリハード関数が採択された場合や反復回数の引き上げが必要になった場合でも、旧データとの互換性を壊さずに段階的マイグレーションが可能。

## 関連ドキュメント

- [ADR-001: E2EE Architecture](./001-e2ee.md)
- [ADR-002: Key Management](./002-key-management.md)
- [脅威モデル](../security/threat-model.md)
- [E2EE 設計](../security/e2ee.md)
