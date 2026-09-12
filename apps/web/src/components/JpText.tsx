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

// 後続ノードが改行または改行から始まるか判定するヘルパー
const startsWithLineBreak = (node: React.ReactNode): boolean => {
  if (node == null || typeof node === "boolean") return false;
  if (React.isValidElement(node) && node.type === "br") return true;
  if (typeof node === "string" || typeof node === "number") {
    return /^[\r\n]/.test(String(node));
  }
  if (
    React.isValidElement<{ children?: React.ReactNode }>(node) &&
    node.props.children != null
  ) {
    const children = React.Children.toArray(node.props.children);
    return children.length > 0 && startsWithLineBreak(children[0]);
  }
  return false;
};

// 単一文字列に対して 句点（。）による文章区切りと \n での改行分割、BudouX パースを行う関数
const processString = (text: string, hasFollowingSibling = false) => {
  let normalized = text.replace(/。(?=[^\r\n])/g, "。\n");
  if (hasFollowingSibling) {
    normalized = normalized.replace(/。$/g, "。\n");
  }

  const lines = normalized.split(/\r\n|\r|\n/);
  return lines.map((line, index) => {
    const lineKey = `line-${index}-${line}`;
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
        {index < lines.length - 1 && <br />}
      </Fragment>
    );
  });
};

// ReactNode を再帰的にスキャンして文字列のみにBudouXを適用する関数
const processNodes = (
  node: React.ReactNode,
  hasFollowingSibling = false,
): React.ReactNode => {
  const children = React.Children.toArray(node).filter((child) => child !== "");

  return children.map((child, index) => {
    const nextChild = index < children.length - 1 ? children[index + 1] : null;
    const nextHasSibling =
      nextChild != null ? !startsWithLineBreak(nextChild) : hasFollowingSibling;

    if (typeof child === "string") {
      return processString(child, nextHasSibling);
    }
    if (typeof child === "number") {
      return processString(String(child), nextHasSibling);
    }
    // 子要素を持つReact Element（<span>や<strong>など）の場合は再帰処理
    if (
      React.isValidElement<{ children?: React.ReactNode }>(child) &&
      child.props.children != null
    ) {
      return React.cloneElement(child, {
        ...child.props,
        children: processNodes(child.props.children, nextHasSibling),
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
