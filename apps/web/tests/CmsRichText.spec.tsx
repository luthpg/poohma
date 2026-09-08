// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CmsRichText } from "../src/components/CmsRichText";

describe("CmsRichText (CMS HTML サニタイズおよび XSS 防御)", () => {
  it("許可された安全なタグ（h2, p, code, ul, li）を正しく描画すること", () => {
    const html = `
			<h2>見出しタイトル</h2>
			<p>段落テキストです。<code>inline code</code>を含みます。</p>
			<ul>
				<li>項目1</li>
				<li>項目2</li>
			</ul>
		`;
    const { container } = render(<CmsRichText htmlContent={html} />);

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "見出しタイトル",
    );
    expect(container.querySelector("p")?.textContent).toContain(
      "段落テキストです。",
    );
    expect(container.querySelector("code")?.textContent).toBe("inline code");
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("https, http, mailto の安全なリンクのみ <a> タグとして描画されること", () => {
    const html = `
			<p>
				<a href="https://example.com" id="safe-https">公式Webサイト</a>
				<a href="mailto:support@example.com" id="safe-mail">お問い合わせ</a>
			</p>
		`;
    const { container } = render(<CmsRichText htmlContent={html} />);

    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toBe("https://example.com");
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(links[0].getAttribute("rel")).toBe("noopener noreferrer");
    expect(links[1].getAttribute("href")).toBe("mailto:support@example.com");
  });

  it("<script> タグが除去され、スクリプト要素が DOM に挿入されないこと (XSS対策)", () => {
    const html = `
			<p>安全な文章です。</p>
			<script>window.__pwned__ = true;</script>
			<script src="https://attacker.example.com/evil.js"></script>
		`;
    const { container } = render(<CmsRichText htmlContent={html} />);

    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("安全な文章です。");
    // @ts-expect-error グローバル変数が汚染されていないことの確認
    expect(window.__pwned__).toBeUndefined();
  });

  it("on* 属性（onerror, onclick 等）が除去されること (XSS対策)", () => {
    const html = `
			<p onclick="alert('pwned')">クリック可能？</p>
			<h2 onload="alert('h2')">タイトル</h2>
		`;
    const { container } = render(<CmsRichText htmlContent={html} />);

    const p = container.querySelector("p");
    const h2 = container.querySelector("h2");
    expect(p?.getAttribute("onclick")).toBeNull();
    expect(h2?.getAttribute("onload")).toBeNull();
  });

  it("javascript: スキームの危険なリンクが a タグとして機能しないこと (XSS対策)", () => {
    const html = `
			<p><a href="javascript:alert(document.cookie)">悪意あるリンク</a></p>
		`;
    const { container } = render(<CmsRichText htmlContent={html} />);

    // 危険なスキームの場合、a タグそのものが除去されテキストのみになる
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("悪意あるリンク");
  });

  it("data:text/html スキームの危険なリンクが a タグとして機能しないこと (XSS対策)", () => {
    const html = `
			<p><a href="data:text/html,<script>alert(1)</script>">データURIリンク</a></p>
		`;
    const { container } = render(<CmsRichText htmlContent={html} />);

    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("データURIリンク");
  });

  it("<svg>, <img>, <iframe> などの非許可要素がサニタイズされること (XSS対策)", () => {
    const html = `
			<svg onload="alert(1)"><circle cx="50" cy="50" r="40" /></svg>
			<img src="x" onerror="alert(1)" />
			<iframe src="https://attacker.example.com"></iframe>
		`;
    const { container } = render(<CmsRichText htmlContent={html} />);

    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
  });
});
