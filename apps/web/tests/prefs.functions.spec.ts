// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getClientCookie,
	getDashboardPrefs,
	setClientCookie,
	setDashboardPrefs,
} from "../src/services/prefs.functions";

describe("prefs.functions", () => {
	const originalCookie = document.cookie;

	beforeEach(() => {
		// Cookie を初期化
		// biome-ignore lint/suspicious/noDocumentCookie: テスト環境での Cookie 初期化のため
		document.cookie = "";
	});

	afterEach(() => {
		// biome-ignore lint/suspicious/noDocumentCookie: テスト環境での Cookie 復元のため
		document.cookie = originalCookie;
		vi.restoreAllMocks();
	});

	describe("getClientCookie and setClientCookie", () => {
		it("Cookie を正しく書き込み、読み取ることができる", () => {
			setClientCookie("test_key", "test_value");
			expect(getClientCookie("test_key")).toBe("test_value");
		});

		it("存在しない Cookie の場合は undefined を返す", () => {
			expect(getClientCookie("non_existent")).toBeUndefined();
		});

		it("URLエンコードが必要な値を正しく扱える", () => {
			setClientCookie("encoded_key", "値 with スペース & 特殊文字");
			expect(getClientCookie("encoded_key")).toBe(
				"値 with スペース & 特殊文字",
			);
		});
	});

	describe("getDashboardPrefs (Client-side)", () => {
		it("Cookie 未設定時はデフォルト値（name-asc, card）を返す", async () => {
			const prefs = await getDashboardPrefs();
			expect(prefs).toEqual({
				sort: "name-asc",
				view: "card",
			});
		});

		it("Cookie に設定がある場合はその値を同期的に返す", async () => {
			setClientCookie("poohma_dashboard_sort", "date-desc");
			setClientCookie("poohma_dashboard_view", "list");

			const prefs = await getDashboardPrefs();
			expect(prefs).toEqual({
				sort: "date-desc",
				view: "list",
			});
		});
	});

	describe("setDashboardPrefs (Client-side)", () => {
		it("クライアント側で document.cookie を即時更新する", () => {
			setDashboardPrefs({ sort: "url-asc", view: "list" });

			expect(getClientCookie("poohma_dashboard_sort")).toBe("url-asc");
			expect(getClientCookie("poohma_dashboard_view")).toBe("list");
		});

		it("片方の設定のみ更新した場合は指定された方だけ更新される", () => {
			setClientCookie("poohma_dashboard_sort", "name-asc");
			setClientCookie("poohma_dashboard_view", "card");

			setDashboardPrefs({ sort: "updatedAt-desc" });

			expect(getClientCookie("poohma_dashboard_sort")).toBe("updatedAt-desc");
			expect(getClientCookie("poohma_dashboard_view")).toBe("card");
		});
	});
});
