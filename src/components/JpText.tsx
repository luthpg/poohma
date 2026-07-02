import { loadDefaultJapaneseParser } from "budoux";
import type React from "react";
import { Fragment, useMemo } from "react";

const parser = loadDefaultJapaneseParser();

interface JpTextProps {
  children: string;
  className?: string;
  as?: React.ElementType;
}

export const JpText = ({
  children,
  className,
  as: Component = "span",
}: JpTextProps) => {
  const parsedContent = useMemo(() => {
    if (typeof children !== "string") {
      return children;
    }
    const tokens = parser.parse(children);
    let offset = 0;
    return tokens.map((token) => {
      const key = `${token}-${offset}`;
      offset += token.length;
      return (
        <Fragment key={key}>
          {token}
          {offset < children.length && <wbr />}
        </Fragment>
      );
    });
  }, [children]);

  return <Component className={className}>{parsedContent}</Component>;
};
