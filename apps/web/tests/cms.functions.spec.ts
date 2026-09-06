import { describe, expect, it } from "vitest";
import {
	isValidContentId,
	normalizeNewsListParams,
} from "../src/services/cms.functions";

describe("isValidContentId", () => {
	it("通常の英数字・ハイフン・アンダースコアを含むコンテンツIDを許可すること", () => {
		expect(isValidContentId("news-1")).toBe(true);
		expect(isValidContentId("abc123xyz")).toBe(true);
		expect(isValidContentId("news_item_2026")).toBe(true);
		expect(isValidContentId("a-b_c-123")).toBe(true);
	});

	it("空文字または空白のみの場合は拒否すること", () => {
		expect(isValidContentId("")).toBe(false);
		expect(isValidContentId("   ")).toBe(false);
		expect(isValidContentId(null)).toBe(false);
		expect(isValidContentId(undefined)).toBe(false);
	});

	it("パストラバーサルを試みる文字列を拒否すること", () => {
		// ディレクトリトラバーサル (..)
		expect(isValidContentId("../faq")).toBe(false);
		expect(isValidContentId("..")).toBe(false);
		expect(isValidContentId("news/..")).toBe(false);

		// スラッシュ・バックスラッシュ
		expect(isValidContentId("news/123")).toBe(false);
		expect(isValidContentId("/news")).toBe(false);
		expect(isValidContentId("news\\123")).toBe(false);

		// URLエンコードされた文字 (%2e など)
		expect(isValidContentId("%2e%2e%2ffaq")).toBe(false);
		expect(isValidContentId("news%20item")).toBe(false);

		// ドットを含むもの
		expect(isValidContentId("news.json")).toBe(false);
		expect(isValidContentId(".env")).toBe(false);
	});
});

describe("normalizeNewsListParams", () => {
	it("未指定時はデフォルト値（limit: 20, offset: 0）を返すこと", () => {
		expect(normalizeNewsListParams()).toEqual({ limit: 20, offset: 0 });
		expect(normalizeNewsListParams({})).toEqual({ limit: 20, offset: 0 });
	});

	it("正常な limit と offset がそのまま反映されること", () => {
		expect(normalizeNewsListParams({ limit: 10, offset: 5 })).toEqual({
			limit: 10,
			offset: 5,
		});
	});

	it("limit の下限（1）と上限（50）の範囲制限が正しく機能すること", () => {
		expect(normalizeNewsListParams({ limit: 0 })).toEqual({
			limit: 1,
			offset: 0,
		});
		expect(normalizeNewsListParams({ limit: -10 })).toEqual({
			limit: 1,
			offset: 0,
		});
		expect(normalizeNewsListParams({ limit: 100 })).toEqual({
			limit: 50,
			offset: 0,
		});
	});

	it("offset の下限（0）制限が正しく機能すること", () => {
		expect(normalizeNewsListParams({ offset: -5 })).toEqual({
			limit: 20,
			offset: 0,
		});
	});
});
