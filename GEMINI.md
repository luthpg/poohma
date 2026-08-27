# Project Rules & System Instructions

## 1. Environment & Shell Context

- **OS / Shell**: Windows (PowerShell)
  - コマンド実行時のパス区切り文字やシェルコマンド（`;` の扱い、ファイル操作コマンド等）は PowerShell の構文に従うこと。
  - Windows PowerShell 7未満 では `&&` 演算子が構文エラー（`トークン '&&' は、このバージョンでは有効なステートメント区切り記号ではありません`）となるため使用できません。
  - コマンドを連続実行する際は、先頭に `$ErrorActionPreference = "Stop"` を記述して `;` で繋ぐ（例: `$ErrorActionPreference = "Stop"; コマンド1; コマンド2`）ことで、途中でエラーが出た瞬間にスクリプト全体を安全に強制終了させてください。
  - パスに丸括弧 `()` が含まれる場合（例: `src/routes/(app)/records/$id.tsx`）、PowerShell が式として誤解釈するため、必ずダブルクォートで囲むこと（例: `git add "src/routes/(app)/records/file.tsx"`）。
- **Package Manager**: `pnpm`
  - パッケージの追加・削除・実行には必ず `pnpm` を使用すること（`npm`, `yarn` は使用禁止）。

## 2. Quality Assurance & Verification Commands

コード変更や機能実装を行った後、またはユーザーからの検証要求時は、以下のコマンドでエラーがないか確認・通過させること。

1. **Type Check**: `pnpm tsc`
2. **Static Check / Lint/ Format**: `pnpm check`
3. **Test**: `pnpm test`
4. **Build Check**: `pnpm build`

> **Note**: コマンドの連続実行時は、`$ErrorActionPreference = "Stop"; pnpm tsc; pnpm check; pnpm test; pnpm build` のように `$ErrorActionPreference = "Stop"` を付与して `;` で繋ぐか、`pnpm` 側のスクリプトを活用すること（`&&` は Windows PowerShell では構文エラーになります）。

## 3. Git Commit Message Guidelines

Git コミットメッセージを生成または実行する場合は、**Conventional Commits** 形式に厳格に従うこと。

### Format

```text
<type>(<scope>): <short description>

<detailed description in Japanese>
```

### Rules

- **Header (<type>)**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore` 等を使用。
- **Subject**: 変更内容の要約を簡潔に記述。
- **Body（詳細文）**:
  - **必ず日本語で記述**すること。
  - 「なぜこの変更を行ったか」「どのような変更・影響があるか」を分かりやすく記載すること。

### Windows PowerShell でのコミット実行時の注意（文字化け防止）

PowerShell のパイプライン（`|`）はデフォルトの `$OutputEncoding` が ASCII や Shift-JIS の場合があり、マルチバイト日本語が `?` に化けてコミットされる原因になります。
コミットを実行する際は、必ず **UTF-8 一時ファイルを経由** するか、**`$OutputEncoding` と `[Console]::OutputEncoding` を明示的に UTF-8 に設定** すること。

#### 推奨実行例（一時ファイル経由）

```powershell
$commitMsg = @'
feat(auth): ログイン時のトークン再発行処理を追加

・トークン期限切れ時に自動でリフレッシュトークンを検証する処理を実装
・セッション切れによる意図しないログアウトを防止
'@
$tmpMsgFile = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tmpMsgFile, $commitMsg, [System.Text.Encoding]::UTF8)
try {
  git commit -F $tmpMsgFile
} finally {
  Remove-Item -Path $tmpMsgFile -Force
}
```

## 4. GitHub CLI (`gh`) Usage in PowerShell

PowerShell 上で `gh pr create` や `gh issue create` を実行して本文（Body）を渡す場合は、以下のルールを厳守すること。

- **`--body` フラグで直接ダブルクォート文字列を渡さないこと**（PowerShell が Markdown 内のバッククォート `` ` `` をエスケープ文字として誤解釈し、`\` に化けるため）。
- **パイプライン（`|`）で直接 `gh` に渡さないこと**（PowerShell のパイプラインエンコーディングによって日本語が `?` に化けるため）。
- 本文を渡す際は、必ず **UTF-8 一時ファイルを作成して `--body-file` に渡す** こと。

### 正しい実行例（一時ファイル経由）

```powershell
$prBody = @'
## 概要
`src/emails/` の作成

・`EmailTemplateDefinition` の定義
'@
$tmpBodyFile = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tmpBodyFile, $prBody, [System.Text.Encoding]::UTF8)
try {
  gh pr create --title "feat: メールテンプレートの追加" --body-file $tmpBodyFile
} finally {
  Remove-Item -Path $tmpBodyFile -Force
}
```

## 5. Documentation Update Check Before Commit

コード変更や機能追加・仕様変更をコミットする前に、関連するドキュメントの更新要否を必ず確認すること。

- **対象ドキュメント**:
  - 要件定義書（`.docs/requirements.md`）
  - 詳細設計書（`.docs/code-design.md`）
  - デザイン仕様書（`.docs/DESIGN.md`, `.docs/lp-design.md`）
  - 脅威モデル（`THREAT_MODEL.md`）
  - セキュリティポリシー（`SECURITY.md`）
  - プロジェクト概要・セットアップ（`README.md`）
- **運用フロー**:
  1. コミット前にコード変更差分を精査し、ドキュメントの更新（機能要件の追加、DBスキーマ・API仕様・環境変数の変更、脅威モデルの更新等）が必要でないかチェックする。
  2. ドキュメントの更新が必要な場合は、変更箇所・更新方針をユーザーに確認し、許諾を得た上でドキュメントの更新を行う。
  3. ドキュメント更新を含めた状態で品質検証コマンドを実行し、コミットを行う。

