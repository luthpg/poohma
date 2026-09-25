# Context Selection Workflow

PoohMa では、AI Agent がタスクに着手する際、無作為にファイルを探索したり勘に頼ったりすることを防ぐため、**タスク種別に応じた「文脈（Context）の事前特定」を義務化**しています。

作業着手時、AI Agent は本ドキュメントのマトリクスに従い、該当する最小限の必読ドキュメント（Must Read）を特定し、不変条件（Invariants）を確認した上で実装方針を提示してください。

---

## 1. タスク種別・事前参照マトリクス

| タスク種別 | 主な対象領域・変更ファイル | 必読ファイル（Must Read） | 重点チェック項目・不変条件 |
| :--- | :--- | :--- | :--- |
| **暗号化・鍵管理 (E2EE)** | `src/lib/crypto/**`<br>`src/features/e2ee/**` | [`.ai/invariants.md`](../invariants.md) (第1, 2節)<br>[`.ai/pitfalls/crypto-e2ee.md`](../pitfalls/crypto-e2ee.md)<br>[`.docs/security/e2ee.md`](../../.docs/security/e2ee.md) | ・平文パスコード/鍵/ヒントを絶対にサーバーへ送信・保存しない<br>・DEKエンベロープ暗号化の維持<br>・`KDF_VERSIONS` は追記のみ |
| **認証・セッション** | `src/features/auth/**`<br>`convex/auth/**`<br>`src/routes/(auth)/**` | [`.ai/invariants.md`](../invariants.md) (第3, 4節)<br>[`.ai/pitfalls/auth-session.md`](../pitfalls/auth-session.md)<br>[`.docs/security/security-model.md`](../../.docs/security/security-model.md) | ・長期セッションの Single Source of Truth は Firebase Auth<br>・Session Cookie のみで認可を完結させない<br>・CSRFトークン検証 |
| **バックエンド・RLS (Convex)** | `convex/**` (schema, functions)<br>`src/**/*.function.ts` | [`.ai/domain.md`](../domain.md)<br>[`.ai/pitfalls/backend-convex.md`](../pitfalls/backend-convex.md)<br>[`.ai/architecture.md`](../architecture.md) | ・生の query/mutation export 禁止 (`customBuilders` 必須)<br>・検証前の `pnpm convex:dev:once` ワンショット実行<br>・手動ワンショット移行（KISS原則、アプリ側に未移行検査ガードを入れない） |
| **フロントエンド・UI・画面** | `src/routes/**`<br>`src/components/**` | [`.ai/invariants.md`](../invariants.md) (第5節)<br>[`.ai/pitfalls/ui-and-misc.md`](../pitfalls/ui-and-misc.md)<br>[`.docs/DESIGN.md`](../../.docs/DESIGN.md) | ・生エラー (`error.message`) や例外オブジェクトの UI/console 露出禁止<br>・`toast.error(固定日本語メッセージ)` 徹底<br>・画面固定フッター・安全域対応 |
| **テスト・E2E** | `apps/web/tests/**`<br>`apps/web/e2e/**` | [`.ai/testing.md`](../testing.md)<br>[`.ai/pitfalls/e2e-testing.md`](../pitfalls/e2e-testing.md)<br>[`.ai/workflows/test-refactoring.md`](test-refactoring.md) | ・テスト失敗時のプロダクションコード改変禁止<br>・コミット前の `pnpm test:e2e` ローカル合格義務<br>・重複テストの整理（「削除すると何を見逃すか」基準） |
| **CI/CD・GitHub Actions** | `.github/workflows/**` | [`.ai/invariants.md`](../invariants.md) (第7節)<br>[`.ai/pitfalls/workflow-ci.md`](../pitfalls/workflow-ci.md) | ・コミット前の `pnpm lint:workflows` 合格義務<br>・引数インジェクション防止 (`jq --arg`)<br>・curl タイムアウト必須、変数クォート |
| **外部レビュー対応** | PR コメント (CodeRabbit等) | [`.ai/invariants.md`](../invariants.md)<br>[`.ai/pitfalls/review-and-guardrails.md`](../pitfalls/review-and-guardrails.md) | ・外部AIの提案を盲目追従しない（毅然と却下する基準）<br>・「念のため二重にする」過剰冗長化の完全排除 |

---

## 2. AI Agent の行動プロトコル（Context Selection）

AI Agent は、ユーザーから新しいタスク・指示を受けた際、以下のステップを遵守してください：

1. **種別特定**: ユーザー要求および対象コードから、上記マトリクスのタスク種別（複数可）を特定する。
2. **事前参照の実行**: 指定された必読ファイル（Must Read）を `view_file` で確認し、不変条件を把握する。
3. **方針提示（提案と合意の分離）**:
   - プラン作成時またはユーザーへの初回応答時に、「**【タスク種別】〇〇（参照: `.ai/...`）を確認しました**」と明記する。
   - 不変条件に影響を与える可能性がある論点がある場合は、事前にユーザーへ懸念点や方針を提示し、合意を得てから実装に進む。
