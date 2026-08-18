# Project Rules & System Instructions

## 1. Environment & Shell Context

- **OS / Shell**: Windows (PowerShell)
  - コマンド実行時のパス区切り文字やシェルコマンド（`;` の扱い、ファイル操作コマンド等）は PowerShell の構文に従うこと。
- **Package Manager**: `pnpm`
  - パッケージの追加・削除・実行には必ず `pnpm` を使用すること（`npm`, `yarn` は使用禁止）。

## 2. Quality Assurance & Verification Commands

コード変更や機能実装を行った後、またはユーザーからの検証要求時は、以下のコマンドでエラーがないか確認・通過させること。

1. **Type Check**: `pnpm tsc`
2. **Static Check / Lint/ Format**: `pnpm check`
3. **Test**: `pnpm test`
4. **Build Check**: `pnpm build`

> **Note**: コマンドの連続実行時、PowerShell では `;` または `pnpm` 側のスクリプトを活用すること。

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
