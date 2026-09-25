---
name: poohma-guardrails
description: >-
  PoohMa の開発において、E2EE暗号・認証認可・フロント生エラー非露出・外部レビュー審査（盲目追従禁止）・KISS原則などの最重要不変条件と過去の落とし穴（Pitfalls）を確認・遵守するための専門スキル。
---

# PoohMa Guardrails & Invariants Skill

このスキルは、PoohMa における破壊的変更、セキュリティ脆弱性、不変条件違反を未然に防止するための行動指針を提供します。

## 0. タスク着手時の文脈選択（Context Selection 義務）

作業開始時は、[`.ai/workflows/context-selection.md`](../../../.ai/workflows/context-selection.md) に従い、タスク種別（UI、E2EE暗号、Convex/RLS、認証、E2Eテスト、CI等）を特定し、必読ファイルを事前参照した上で方針を提示してください。

---

## 1. 必読・最重要不変原則（Core Invariants）

作業内容に応じて、以下のドキュメントをオンデマンドで必ず参照してください：

- **外部レビュー（CodeRabbit等）審査 & 設計原則**: [`.ai/pitfalls/review-and-guardrails.md`](../../../.ai/pitfalls/review-and-guardrails.md)
  - **「念のため二重にする」精神・過剰冗長化の完全排除**: 「不安だから両方に保存・二重チェック」という思考停止を根絶し、Single Source of Truth を1つに断定・一本化する。
  - 一般的なReactの慣習に惑わされず、フロントエンドへの生エラー（`error.message`）露出提案を却下する。
  - マイグレーション過剰防衛コード（未バックフィル検査ガード）をアプリ側に入れず、KISS原則と手動ワンショット移行を守る。

- **フロントエンドのエラーハンドリング**: [`.ai/invariants.md`](../../../.ai/invariants.md) 第5節
  - `toast.error(固定日本語メッセージ)` を徹底する。
  - ブラウザの `console.error` 等への生例外オブジェクト出力も禁止（E2EE暗号鍵保護・CWE-209防止）。`catch (_error) {}` で安全に握る。
- **暗号・鍵管理（E2EE）**: [`.ai/invariants.md`](../../../.ai/invariants.md) 第1節、[`.ai/pitfalls/crypto-e2ee.md`](../../../.ai/pitfalls/crypto-e2ee.md)
  - 平文ヒント・平文パスコード・平文マスターキーをサーバーに絶対に送信・保存しない。
  - DEKによるエンベロープ暗号化を徹底。`KDF_VERSIONS` は追記のみ。
- **バックエンド開発 & RLS**: [`.ai/pitfalls/backend-convex.md`](../../../.ai/pitfalls/backend-convex.md)
  - 生の Convex query/mutation export 禁止。`convex/customBuilders.ts` を使用。
  - ローカル検証・E2Eテスト前には必ず `pnpm convex:dev:once` をワンショット実行する。
- **テスト作成と実行**: [`.ai/pitfalls/e2e-testing.md`](../../../.ai/pitfalls/e2e-testing.md)
  - テスト失敗を理由にしたプロダクションコード改変の禁止。
  - 結合動作変更後は必ず `pnpm test:e2e` をローカル検証してからコミットする。

---

## 2. 過去トラ・詳細 Pitfalls 一覧

詳細な過去の失敗事例や実装上の罠は、[`.ai/pitfalls.md`](../../../.ai/pitfalls.md) または各ドメイン別ファイルを参照してください。

---

## 3. Knowledge Feedback Protocol（知見還元）

作業中に再発し得る普遍的な知見・罠を発見した場合、勝手に書き換えることはせず、[`.ai/workflows/knowledge-feedback.md`](../../../.ai/workflows/knowledge-feedback.md) に従ってユーザーに草案を提示（提案と合意の徹底分離）し、合意を得てから `.ai/pitfalls/` へ反映してください。コミット前には `pnpm check:knowledge` および `pnpm check:doc-sync` を実行してください。
