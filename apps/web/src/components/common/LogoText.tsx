import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function LogoText({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h1
      className={cn("font-bold text-foreground font-sans", className)}
      {...props}
    >
      Pooh<span className="text-orange-500">Ma</span>
    </h1>
  );
}
