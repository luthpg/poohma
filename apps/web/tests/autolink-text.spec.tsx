// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutolinkText } from "@/components/common/AutolinkText";

describe("AutolinkText Component", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("null または undefined の場合は何も描画しないこと", () => {
    const { container } = render(<AutolinkText text={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("URL を含まないプレーンテキストをそのまま描画すること", () => {
    render(<AutolinkText text="これは通常のメモテキストです。" />);
    expect(screen.getByText("これは通常のメモテキストです。")).toBeTruthy();
  });

  it("http および https の URL を a タグとして描画すること", () => {
    render(
      <AutolinkText text="参考サイト: https://example.com/test と http://test.org です" />,
    );

    const link1 = screen.getByRole("link", {
      name: "https://example.com/test",
    });
    expect(link1).toBeTruthy();
    expect(link1.getAttribute("href")).toBe("https://example.com/test");
    expect(link1.getAttribute("target")).toBe("_blank");
    expect(link1.getAttribute("rel")).toBe("noopener noreferrer");

    const link2 = screen.getByRole("link", { name: "http://test.org" });
    expect(link2).toBeTruthy();
    expect(link2.getAttribute("href")).toBe("http://test.org");
  });

  it("日本語の句読点や全角括弧が URL に巻き込まれず切り離されること", () => {
    render(
      <AutolinkText text="「https://example.com/path」を確認してください。" />,
    );

    const link = screen.getByRole("link", { name: "https://example.com/path" });
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("https://example.com/path");
    expect(screen.getByText(/「/)).toBeTruthy();
    expect(screen.getByText(/」を確認してください。/)).toBeTruthy();
  });

  it("半角括弧で囲まれた URL は末尾の括弧が除外されること (linkify-it カッコバランス)", () => {
    render(
      <AutolinkText text="公式ドキュメントはこちら(https://example.com/docs)です" />,
    );

    const link = screen.getByRole("link", { name: "https://example.com/docs" });
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("https://example.com/docs");
    expect(screen.getByText(/\)です/)).toBeTruthy();
  });

  it("URL 自体に含まれる括弧（Wikipedia等）は正しく URL に保持されること", () => {
    render(
      <AutolinkText text="https://ja.wikipedia.org/wiki/Pooh_(character) を参照" />,
    );

    const link = screen.getByRole("link", {
      name: "https://ja.wikipedia.org/wiki/Pooh_(character)",
    });
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe(
      "https://ja.wikipedia.org/wiki/Pooh_(character)",
    );
  });

  it("日本語クエリパラメータ（実用パス/クエリ）が壊れずそのままリンク化されること", () => {
    render(
      <AutolinkText text="検索結果: https://example.com/search?q=本。こちらからどうぞ" />,
    );

    const link = screen.getByRole("link", {
      name: "https://example.com/search?q=本",
    });
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("https://example.com/search?q=本");
    expect(screen.getByText(/。こちらからどうぞ/)).toBeTruthy();
  });

  it("URL 直前にスペースなしで日本語が直結していても正しく検出されること", () => {
    render(
      <AutolinkText text="ログイン先はこちらhttps://example.com/login です" />,
    );

    const link = screen.getByRole("link", {
      name: "https://example.com/login",
    });
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("https://example.com/login");
    expect(screen.getByText(/ログイン先はこちら/)).toBeTruthy();
  });

  it("日本語ドメインも正しくリンク化されること", () => {
    render(<AutolinkText text="総務省のサイト: http://総務省.jp/test です" />);

    const link = screen.getByRole("link", {
      name: "http://総務省.jp/test",
    });
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("http://総務省.jp/test");
  });

  it("javascript: などの危険なスキームはリンク化されないこと（CWE-79対策）", () => {
    render(<AutolinkText text="javascript:alert(1) はリンク化されないこと" />);

    expect(screen.queryByRole("link")).toBeNull();
    expect(
      screen.getByText("javascript:alert(1) はリンク化されないこと"),
    ).toBeTruthy();
  });

  it("大文字スキーム（HTTPS:// 等）も正しくリンク化されること", () => {
    render(<AutolinkText text="大文字URL: HTTPS://example.com/test です" />);

    const link = screen.getByRole("link", {
      name: "HTTPS://example.com/test",
    });
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("HTTPS://example.com/test");
  });

  it("リンククリック時に親へのイベント伝播（stopPropagation）が呼ばれること", () => {
    render(<AutolinkText text="https://example.com" />);

    const link = screen.getByRole("link", { name: "https://example.com" });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    const stopPropagationSpy = vi.spyOn(event, "stopPropagation");

    link.dispatchEvent(event);
    expect(stopPropagationSpy).toHaveBeenCalled();
  });
});
