// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { JpText } from "../src/components/JpText";

describe("JpText", () => {
	it("日本語テキストをパースして <wbr /> タグを挿入すること", () => {
		const { container } = render(
			<JpText>BudouXで日本語の自然な改行位置を自動調整します。</JpText>,
		);

		expect(container.querySelector("wbr")).not.toBeNull();
	});

	it("改行コード(\\n)を含むテキストで <br /> タグを正常に挿入し、キー警告が発生しないこと", () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const { container } = render(
			<JpText>{"1行目のテキストです。\n2行目のテキストです。"}</JpText>,
		);

		expect(container.querySelector("br")).not.toBeNull();
		expect(consoleSpy).not.toHaveBeenCalled();

		consoleSpy.mockRestore();
	});

	it("ネストされた JSX 要素に対して再帰的に BudouX パースを適用できること", () => {
		const { container } = render(
			<JpText>
				親要素<span>子要素のテキスト</span>
			</JpText>,
		);

		const span = container.querySelector("span");
		if (!span) {
			throw new Error("Expected nested span to be rendered");
		}

		expect(span.querySelectorAll("wbr").length).toBeGreaterThan(0);
	});

	it("数値型の children も正常にレンダリングできること", () => {
		render(<JpText>{12345}</JpText>);
		expect(screen.getByText("12345")).not.toBeNull();
	});

	it("as プロパティで指定された HTML タグで描画されること", () => {
		render(<JpText as="h2">見出しタイトル</JpText>);
		const heading = screen.getByRole("heading", { level: 2 });
		expect(heading).not.toBeNull();
		expect(heading.tagName.toLowerCase()).toBe("h2");
	});

	it("追加の HTML 属性 (id, data-testid, onClick 等) が正常に転送されること", () => {
		const handleClick = vi.fn();
		render(
			<JpText
				id="jp-text-id"
				data-testid="jp-text-element"
				onClick={handleClick}
			>
				クリック可能なテキスト
			</JpText>,
		);

		const element = screen.getByTestId("jp-text-element");
		expect(element.id).toBe("jp-text-id");

		element.click();
		expect(handleClick).toHaveBeenCalledTimes(1);
	});
});
