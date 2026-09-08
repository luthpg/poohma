import type { DriveStep } from "driver.js";

/**
 * ダッシュボード（前半）：一覧とサンプルの紹介
 */
export const dashboardPart1Steps: DriveStep[] = [
	{
		element: '[data-tour="sample-record"]',
		popover: {
			title: "登録されたサービス",
			description:
				"家族で利用しているサービスやアカウントがここに並びます。「詳細画面へ」を押して、ヒントの暗号化の仕組みを確認してみましょう。",
			side: "bottom",
			align: "start",
			doneBtnText: "詳細画面へ",
		},
	},
];

/**
 * レコード詳細画面：ヒントの暗号化と復号体験
 */
export const recordDetailSteps: DriveStep[] = [
	{
		element: '[data-tour="hint-container"]',
		popover: {
			title: "大切なヒントは安全に保護",
			description:
				"パスワードのヒントはブラウザ上で暗号化されて保管されています。サーバーの管理者であっても閲覧できません。",
			side: "top",
			align: "start",
		},
	},
	{
		element: '[data-tour="hint-reveal-btn"]',
		popover: {
			title: "実際にヒントを表示してみましょう",
			description:
				"「🔒 クリックして表示」を押すと、あなたの家族パスコードを使って端末内だけで瞬時に平文に復号されます。ぜひ試してみてください！",
			side: "bottom",
			align: "start",
			nextBtnText: "表示を確認したら次へ",
		},
	},
	{
		element: '[data-tour="share-status"]',
		popover: {
			title: "家族共有と個人保存",
			description:
				"家族全員で共有するか、自分専用にするかもいつでも自由に切り替えられます。",
			side: "bottom",
			align: "start",
		},
	},
	{
		element: '[data-tour="back-to-dashboard"]',
		popover: {
			title: "ダッシュボードに戻る",
			description:
				"確認できたら、ダッシュボードに戻って実際の利用を始めましょう。",
			side: "bottom",
			align: "start",
			doneBtnText: "ダッシュボードへ戻る",
		},
	},
];

/**
 * ダッシュボード（後半）：登録と片付けの案内
 */
export const dashboardPart2Steps: DriveStep[] = [
	{
		element: '[data-tour="add-record"]',
		popover: {
			title: "新しいサービスを登録",
			description:
				"使い方が分かったら、ここからあなたのアカウント情報を新しく登録できます。",
			side: "bottom",
			align: "end",
		},
	},
	{
		element: '[data-tour="sample-banner"]',
		popover: {
			title: "サンプルの片付け",
			description:
				"使い方が確認できたら、このバナーからいつでもサンプルデータを一括削除して実際の登録を始められます。",
			side: "bottom",
			align: "center",
		},
	},
];

/**
 * 手動起動用ダッシュボードガイドツアー（サンプルデータ不要）
 * 既存のUI要素（新規登録、検索、タグ、アカウント切替、設定）を案内
 */
export const manualDashboardSteps: DriveStep[] = [
	{
		element: '[data-tour="add-record"]',
		popover: {
			title: "新しいサービスを登録",
			description:
				"家族で共有したいアカウントや、自分専用のパスワードヒントを登録できます。",
			side: "bottom",
			align: "end",
		},
	},
	{
		element: '[data-tour="search-input"]',
		popover: {
			title: "すばやく検索",
			description:
				"サービス名やタグ、メモのキーワードで登録したアカウントを検索できます。",
			side: "bottom",
			align: "start",
		},
	},
	{
		element: '[data-tour="tag-cloud"]',
		popover: {
			title: "タグで絞り込み",
			description:
				"「金融」「エンタメ」などタグを付けておくと、ワンタップで整理・表示できます。",
			side: "bottom",
			align: "start",
		},
	},
	{
		element: '[data-tour="user-menu"]',
		popover: {
			title: "アカウントと家族の管理",
			description:
				"別アカウントへの切り替えや、家族の合言葉・メンバーの管理はこちらから行えます。",
			side: "bottom",
			align: "end",
		},
	},
	{
		element: '[data-tour="user-menu"]',
		popover: {
			title: "設定とセキュリティ",
			description:
				"生体認証（指紋・顔認証）の設定や、緊急時のリカバリーキットを発行できます。",
			side: "bottom",
			align: "end",
		},
	},
];
