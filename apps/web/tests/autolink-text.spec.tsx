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

  it("日本語の句読点や括弧が URL に巻き込まれないこと", () => {
    render(
      <AutolinkText text="（https://example.com/path）を確認してください。" />,
    );

    const link = screen.getByRole("link", { name: "https://example.com/path" });
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("https://example.com/path");
    expect(screen.getByText(/（/)).toBeTruthy();
    expect(screen.getByText(/）を確認してください。/)).toBeTruthy();
  });

  it("javascript: などの危険なスキームはリンク化されないこと（CWE-79対策）", () => {
    render(<AutolinkText text="javascript:alert(1) はリンク化されないこと" />);

    expect(screen.queryByRole("link")).toBeNull();
    expect(
      screen.getByText("javascript:alert(1) はリンク化されないこと"),
    ).toBeTruthy();
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
