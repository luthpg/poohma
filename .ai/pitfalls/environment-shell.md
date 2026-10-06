# Pitfalls: 実行環境 & シェル (PowerShell 7 / Windows)

PowerShell 7 (pwsh / Windows) 環境における落とし穴と回避法です。

---

### `&&` 演算子によるチェーン実行のサポート

- **状況**: PowerShell 7（pwsh）では、bash 同様に `cmd1 && cmd2` によるチェーン実行（直前のコマンドが成功した場合のみ後続を実行する制御）がネイティブで利用可能になりました（旧 Windows PowerShell 5.1 で構文エラーとなっていた制限は解消）。
- **活用**: コマンドの順次実行時は `&&` を活用し、先行ステップが失敗した場合に即座に中断させることができます。

---

### 丸括弧 `()` を含むパスの誤解釈

- **問題**: `src/routes/(app)/records/$id.tsx` のようなパスをクォートなしで渡すと PowerShell が式として解釈しエラーになる。
- **回避法**: パスは必ずクォートで囲み、`$id` のようなリテラルの `$` を含む場合はシングルクォートを使用する（例: `git add 'src/routes/(app)/records/$id.tsx'`）。

---

### 日本語コミットメッセージ・PR本文の文字化けと UTF-8 BOM 混入

- **問題**:
  - PowerShell の標準パイプライン（`|`）や `-m` 引数はエンコーディングにより日本語が `?` に化ける。
  - また、.NET の `[System.Text.Encoding]::UTF8` をそのまま使って一時ファイルを作成すると、デフォルトで **UTF-8 with BOM**（バイト順マーク: `EF BB BF`）が付与される。これを `git commit -F` や `gh pr create --body-file` で渡すと、コミット件名や PR 本文の先頭に不可視の BOM 文字（`\uFEFF`）が混入し、ツールによって不要文字や文字化けの原因となる。
- **回避法**:
  - 必ず **BOM なし UTF-8 一時ファイルを経由** して実行する。
  ```powershell
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($tmpFile, $text, $utf8NoBom)
  ```
  - 詳細は [`.ai/workflows/git-workflow.md`](../workflows/git-workflow.md) を参照。

