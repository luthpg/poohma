import { Lock } from "lucide-react";
import type React from "react";

interface AdminRestrictedSectionProps {
  isAdmin: boolean;
  skeleton?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
  message?: string;
  className?: string;
}

function DefaultCompactSkeleton() {
  return (
    <div className="flex h-28 w-full flex-col justify-center space-y-3 p-4">
      <div className="flex items-center gap-3">
        <div className="h-9 w-28 rounded-md bg-muted/70" />
        <div className="h-9 flex-1 rounded-md bg-muted/40" />
      </div>
      <div className="h-3 w-2/3 rounded bg-muted/40" />
    </div>
  );
}

/**
 * ファミリー管理者専用セクションを保護する安全なラッパーコンポーネント
 * 一般メンバー表示時は実コンポーネント（children）をアンマウントし、
 * コンパクトな静的スケルトンの上に中央オーバーレイマスクを重ねて表示する。
 */
export function AdminRestrictedSection({
  isAdmin,
  skeleton,
  children,
  title = "管理者機能",
  message = "この設定の変更はファミリー管理者のみ行えます。",
  className = "",
}: AdminRestrictedSectionProps) {
  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-border/70 bg-card ${className}`}
    >
      {/* 見た目だけの静的スケルトン（実コンポーネント・クエリ・ハンドラは一切存在しない） */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none opacity-30 blur-[1px] filter"
      >
        {skeleton ?? <DefaultCompactSkeleton />}
      </div>

      {/* 中央のオーバーレイマスク */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 p-6 text-center backdrop-blur-[2px]">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted/80 border border-border text-foreground/80 mb-2.5 shadow-xs">
          <Lock className="h-5 w-5 text-orange-500" />
        </div>
        <h4 className="text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h4>
        <p className="mt-1 text-xs text-muted-foreground max-w-xs leading-relaxed">
          {message}
        </p>
      </div>
    </div>
  );
}
