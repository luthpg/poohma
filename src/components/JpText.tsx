import { loadDefaultJapaneseParser } from "budoux";
import React, { Fragment, useMemo } from "react";
import { cn } from "@/lib/utils";

const parser = loadDefaultJapaneseParser();

export type JpTextProps<T extends React.ElementType = "span"> = {
  /** BudouXを適用するテキストまたはJSX要素 */
  children?: React.ReactNode;
  /** 追加のCSSクラス */
  className?: string;
  /** レンダリングするHTML要素タグ (デフォルト: "span") */
  as?: T;
} & Omit<React.ComponentPropsWithoutRef<T>, "children" | "className" | "as">;

// 単一文字列に対して \n での改行分割と BudouX パースを行う関数
const processString = (text: string) => {
  const lines = text.split("\n");
  let lineOffset = 0;
  return lines.map((line) => {
    const lineKey = `line-${lineOffset}-${line}`;
    lineOffset += line.length + 1;
    const tokens = parser.parse(line);
    let tokenOffset = 0;
    return (
      <Fragment key={lineKey}>
        {tokens.map((token) => {
          const tokenKey = `token-${tokenOffset}-${token}`;
          tokenOffset += token.length;
          return (
            <Fragment key={tokenKey}>
              {token}
              {tokenOffset < line.length && <wbr />}
            </Fragment>
          );
        })}
        {lineOffset - 1 < text.length && <br />}
      </Fragment>
    );
  });
};

// ReactNode を再帰的にスキャンして文字列のみにBudouXを適用する関数
const processNodes = (node: React.ReactNode): React.ReactNode => {
  return React.Children.map(node, (child) => {
    if (typeof child === "string") {
      return processString(child);
    }
    if (typeof child === "number") {
      return processString(String(child));
    }
    // 子要素を持つReact Element（<span>や<strong>など）の場合は再帰処理
    if (
      React.isValidElement<{ children?: React.ReactNode }>(child) &&
      child.props.children != null
    ) {
      return React.cloneElement(child, {
        ...child.props,
        children: processNodes(child.props.children),
      });
    }
    return child;
  });
};

export const JpText = <T extends React.ElementType = "span">({
  children,
  className,
  as,
  ...props
}: JpTextProps<T>) => {
  const Component = as || "span";
  const parsedContent = useMemo(() => processNodes(children), [children]);

  return (
    <Component className={cn("break-keep break-words", className)} {...props}>
      {parsedContent}
    </Component>
  );
};
