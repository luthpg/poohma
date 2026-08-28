import parse, { type DOMNode, domToReact, Element } from "html-react-parser";

interface CmsRichTextProps {
	htmlContent: string;
}

// Allowlist of permitted HTML tags from microCMS (XSS mitigation)
const ALLOWED_TAGS = new Set([
	"h1",
	"h2",
	"h3",
	"p",
	"code",
	"ol",
	"ul",
	"li",
	"strong",
	"em",
	"a",
	"hr",
	"br",
]);

export function CmsRichText({ htmlContent }: CmsRichTextProps) {
	// microCMSのHTMLタグを、Shadcn / Geist風クラスに動的に置換・装飾するパーサー
	// セキュリティ: 許可されたタグのみを描画し、それ以外は除去する（基本的なXSS対策）
	const options = {
		replace: (domNode: DOMNode) => {
			if (domNode instanceof Element) {
				// Reject any tag not in the allowlist
				if (!ALLOWED_TAGS.has(domNode.name)) {
					// Return null to strip the element, or return its children to preserve text content
					return domNode.children?.length
						? domToReact(domNode.children as DOMNode[], options)
						: null;
				}

				// Strip any inline event handlers (onclick, onerror, etc.) from attributes
				if (domNode.attribs) {
					for (const attr of Object.keys(domNode.attribs)) {
						if (attr.toLowerCase().startsWith("on")) {
							delete domNode.attribs[attr];
						}
					}
				}

				// 見出し H2 (Geist風にタイトな文字間隔を設定)
				if (domNode.name === "h2") {
					return (
						<h2 className="mt-8 mb-4 text-[24px] font-semibold tracking-[-0.96px] text-foreground border-b border-gray-100 pb-2">
							{domToReact(domNode.children as DOMNode[], options)}
						</h2>
					);
				}
				// 見出し H3
				if (domNode.name === "h3") {
					return (
						<h3 className="mt-6 mb-3 text-[18px] font-medium tracking-normal text-foreground">
							{domToReact(domNode.children as DOMNode[], options)}
						</h3>
					);
				}
				// 段落 P
				if (domNode.name === "p") {
					return (
						<p className="mb-4 text-[16px] leading-7 text-gray-600 dark:text-gray-400 font-normal">
							{domToReact(domNode.children as DOMNode[], options)}
						</p>
					);
				}
				// インラインコードタグ (`code`)
				if (domNode.name === "code") {
					return (
						<code className="rounded bg-gray-50 px-1.5 py-0.5 font-mono text-[13px] text-orange-600 dark:bg-gray-900/40">
							{domToReact(domNode.children as DOMNode[], options)}
						</code>
					);
				}
				// 箇条書きリスト
				if (domNode.name === "ul") {
					return (
						<ul className="mb-4 ml-6 list-disc text-gray-600 dark:text-gray-400 space-y-1.5">
							{domToReact(domNode.children as DOMNode[], options)}
						</ul>
					);
				}
				// リンク (href属性のみ許可、javascript:等の危険なスキームは除外)
				if (domNode.name === "a") {
					const href = domNode.attribs?.href || "";
					// Only allow http, https, and mailto schemes
					if (
						href.startsWith("http://") ||
						href.startsWith("https://") ||
						href.startsWith("mailto:")
					) {
						return (
							<a
								href={href}
								target="_blank"
								rel="noopener noreferrer"
								className="text-orange-600 underline hover:text-orange-700"
							>
								{domToReact(domNode.children as DOMNode[], options)}
							</a>
						);
					}
					// Strip dangerous hrefs
					return <>{domToReact(domNode.children as DOMNode[], options)}</>;
				}
			}
		},
	};

	return (
		<div className="cms-rendered-content font-sans">
			{parse(htmlContent, options)}
		</div>
	);
}
