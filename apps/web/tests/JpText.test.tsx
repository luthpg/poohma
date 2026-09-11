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

  it("句点（。）の直後に自動的に <br /> タグが挿入され、文末の句点には余計な <br /> が挿入されないこと", () => {
    const { container } = render(
      <JpText>これは1文目です。これは2文目です。</JpText>,
    );

    const brs = container.querySelectorAll("br");
    expect(brs.length).toBe(1);
  });

  it("句点（。）の直後に明示的な改行(\\n)が存在する場合に二重改行されないこと", () => {
    const { container } = render(
      <JpText>{"これは1文目です。\nこれは2文目です。"}</JpText>,
    );

    const brs = container.querySelectorAll("br");
    expect(brs.length).toBe(1);
  });

  it("複数の句点がある場合にそれぞれの文末で <br /> タグが挿入されること", () => {
    const { container } = render(
      <JpText>1文目です。2文目です。3文目です。</JpText>,
    );

    const brs = container.querySelectorAll("br");
    expect(brs.length).toBe(2);
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
