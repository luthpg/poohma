// src/components/CmsRichText.tsx
import parse, { type DOMNode, domToReact, Element } from "html-react-parser";

interface CmsRichTextProps {
  htmlContent: string;
}

export function CmsRichText({ htmlContent }: CmsRichTextProps) {
  // microCMSのHTMLタグを、Shadcn / Geist風クラスに動的に置換・装飾するパーサー
  const options = {
    replace: (domNode: DOMNode) => {
      if (domNode instanceof Element) {
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
      }
    },
  };

  return (
    <div className="cms-rendered-content font-sans">
      {parse(htmlContent, options)}
    </div>
  );
}
