# GitHub Actions & CI/CD ワークフローの落とし穴

GitHub Actions ワークフロー作成・保守における典型的な落とし穴と、PoohMa における対策・防止策をまとめる。

---

## 1. `jq` フィルタ内でのシェル変数直接参照によるコンパイルエラー

### 事象

GitHub Actions のインラインスクリプト内で、シングルクォート括りの `jq` 式にシェル変数を直接記述する：

```bash
TRIGGERED_BY=$(echo "$RESPONSE_JSON" | jq -r '.triggeredBy // $ACTOR')
```

一見正しそうに見えるが、シングルクォート内であるためシェル変数 `$ACTOR` は展開されず、そのまま文字通り `'.triggeredBy // $ACTOR'` として `jq` に渡される。`jq` は `$ACTOR` を未定義の `jq` 内部変数と判定し、**コンパイルエラー（`jq: error: $ACTOR is not defined`）** となる。
GitHub Actions の Ubuntu ランナーは既定で `bash -e`（エラー時即時中断）が有効なため、この行でジョブがクラッシュし、後続のステップ（Discord 通知等）が中断してしまう。

### 対策

シェル変数は必ず `jq` の `--arg` または `--argjson` オプションで渡す：

```bash
TRIGGERED_BY=$(echo "$RESPONSE_JSON" | jq -r --arg actor "$ACTOR" '.triggeredBy // $actor')
```

---

## 2. `$GITHUB_OUTPUT` や `$GITHUB_STEP_SUMMARY` のクォート不足と個別リダイレクト

### 事象

```bash
echo "http_status=${HTTP_STATUS}" >> $GITHUB_OUTPUT
echo "response_body<<EOF" >> $GITHUB_OUTPUT
...
cat <<EOF >> $GITHUB_STEP_SUMMARY
```

`$GITHUB_OUTPUT` や `$GITHUB_STEP_SUMMARY` をダブルクォートで囲まないと、`shellcheck` により **SC2086 (Double quote to prevent globbing and word splitting)** の警告・エラーが報告される。
また、同一ファイルに対して複数回個別に `>> $GITHUB_OUTPUT` を繰り返すと、**SC2129 (Consider using { cmd1; cmd2; } >> file instead of individual redirects)** が報告される。

### 対策

リダイレクト先は必ずダブルクォートで保護し、複数行出力はブロックでまとめる：

```bash
{
  echo "http_status=${HTTP_STATUS}"
  echo "response_body<<EOF"
  echo "$HTTP_BODY"
  echo "EOF"
} >> "$GITHUB_OUTPUT"

cat <<EOF >> "$GITHUB_STEP_SUMMARY"
```

---

## 3. `curl` のタイムアウト未指定によるジョブの最長6時間ハング

### 事象

外部エンドポイント（Convex HTTP Action や Discord Webhook など）を呼び出す `curl` コマンドにタイムアウトが指定されていないと、ネットワーク瞬断や相手先サーバーの応答ハング時に接続が切れず、GitHub Actions ジョブの既定上限である**最大6時間**まで runner を占有し続けてしまう。

### 対策

すべての `curl` 呼び出しに適切な `--connect-timeout` と `--max-time` を設定する：

```bash
# 重い処理（リセット実行など）
curl -s --connect-timeout 10 --max-time 60 ...

# 外部通知（Discord Webhook など）
curl -s --connect-timeout 5 --max-time 15 ...
```

---

## 4. `curl | bash` による未検証スクリプトの動的実行リスク

### 事象

CI ワークフロー内でツールを導入する際、`bash <(curl https://raw.githubusercontent.com/.../install.sh)` のようにインターネット上の生スクリプトをパイプ実行すると、サプライチェーン攻撃やネットワーク障害時のビルド不安定化を招く。

### 対策

- CI ワークフローでは、コミットハッシュやバージョンタグで固定された公式 GitHub Action（例: `reviewdog/action-actionlint@v1.77.0`）を使用する。
- ローカル検証では、CI と 100% 同一の検出ルールを維持するため、CI で使われているイメージと同一の `ghcr.io/reviewdog/action-actionlint:v1.77.0` を用いて actionlint を実行する（古い `rhysd/actionlint:latest` は Node 20 非推奨チェック等の新しいルールが未反映で検知漏れの原因となる）。

---

## 5. コミット前のローカル静的検証義務（`pnpm lint:workflows`）

### ルール

ワークフローファイルを変更・追加した際は、**必ずコミット前にローカルで以下を実行し、エラー 0 件であることを確認する**：

```bash
pnpm lint:workflows
```

これにより、YAML 構文エラー、`${{ }}` 式の型エラー、未定義 context、Node ランタイム非推奨、および埋め込みシェルスクリプトの shellcheck 指摘をプッシュ前に 100% 確実にローカルで検知・解消できる。
Docker Desktop が未起動の場合は起動してから実行すること。

---

## 6. `actions/checkout` の shallow clone（`fetch-depth: 1`）による `git diff` 失敗

### 事象

CI ワークフローで `pnpm check:doc-sync -- --base "origin/$GITHUB_BASE_REF"` を実行する際、`actions/checkout` のデフォルト設定（`fetch-depth: 1`）では最新の 1 コミットしか取得されないため、`origin/main...HEAD` や `HEAD~1` の比較対象コミットが存在せず、`git diffSummary` が `fatal: ambiguous argument` で失敗する。

### 対策

PR やブランチ差分を検査するワークフローでは、必ず `fetch-depth: 0` を指定して全履歴をチェックアウトする：

```yaml
- name: Checkout code
  uses: actions/checkout@v5
  with:
    fetch-depth: 0
```

また、シェルスクリプト内で `${{ github.base_ref }}` を扱う際は、シェルインジェクションや SC2086 を防止するため、必ず `env:` を経由して `"$GITHUB_BASE_REF"` として安全に参照すること。

---

## 7. CI ステップ実行コマンドとルート package.json スクリプトの一元管理（Single Source of Truth）

### 事象

CI ワークフローファイル（`.github/workflows/ci.yml` 等）内で `pnpm exec convex deploy --dry-run` などの生のコマンドを直接記述していると、ルート `package.json` で定義された管理スクリプトとの間でオプション変更や環境変数対応の乖離が生じるリスクがある。

### 対策

CI 内で実行するコマンド群は、可能な限りルート `package.json` の scripts（例: `convex:deploy:dry-run`）として一元定義し、CI 側からは `pnpm run <script-name>` を呼び出すことで、ローカル開発と CI の挙動の一貫性（Single Source of Truth）を保つ。

