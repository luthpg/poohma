import { useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * スクロール方向を検知してヘッダーの表示・非表示を制御するフック
 */
export function useScrollHeader(forceVisible = false) {
  const [showHeader, setShowHeader] = useState(true);
  const lastScrollYRef = useRef(0);
  const tickingRef = useRef(false);

  useEffect(() => {
    const handleScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;

      window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY;
        const diff = currentScrollY - lastScrollYRef.current;

        // ページ最上部付近（50px以下）は常に表示
        if (currentScrollY <= 50) {
          setShowHeader(true);
        } else if (diff > 10) {
          // 下スクロール 10px 以上で非表示
          setShowHeader(false);
        } else if (diff < -5) {
          // 上スクロール 5px 以上で表示
          setShowHeader(true);
        }

        lastScrollYRef.current = currentScrollY;
        tickingRef.current = false;
      });
    };

    // 親ヘッダー（PoohMaロゴバー付近: clientY <= 64）タップ時の復帰リスナー
    const handleWindowClick = (e: MouseEvent) => {
      if (e.clientY <= 64) {
        setShowHeader(true);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("click", handleWindowClick, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("click", handleWindowClick);
    };
  }, []);

  return showHeader || forceVisible;
}

export interface SubHeaderProps {
  /** 戻るボタンのラベル（デフォルト: "戻る"） */
  backLabel?: string;
  /** 履歴がない場合のフォールバック遷移先（デフォルト: "/dashboard"） */
  fallbackTo?: string;
  /** 戻るボタンのクリックハンドラ（指定がある場合は優先実行） */
  onBack?: () => void;
  /** 戻るボタンを非表示にするか */
  hideBackButton?: boolean;
  /** 右側に配置するカスタムアクション要素（共有ボタン、パンくず、保存ボタンなど） */
  rightElement?: React.ReactNode;
  /** 常に表示（スクロールによる非表示を無効化）するか */
  forceVisible?: boolean;
  /** data-tour 属性など */
  dataTour?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * ページ固有の子ヘッダー共通コンポーネント。
 * - sticky top-16 で上部に固定
 * - 下スクロールで隠れ、上スクロールや親ヘッダータップで即座に復帰
 * - 履歴があれば back(), なければ fallbackTo へ安全に戻る
 */
export function SubHeader({
  backLabel = "戻る",
  fallbackTo = "/dashboard",
  onBack,
  hideBackButton = false,
  rightElement,
  forceVisible = false,
  dataTour,
  className,
  children,
}: SubHeaderProps) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const isVisible = useScrollHeader(forceVisible);

  const handleBack = () => {
    if (isNavigating) return;
    setIsNavigating(true);

    if (onBack) {
      onBack();
      return;
    }

    if (typeof window !== "undefined" && window.history.length > 2) {
      window.history.back();
    } else {
      router.navigate({ to: fallbackTo });
    }
  };

  return (
    <div
      className={cn(
        "sticky top-16 z-10 -mx-3.5 -mt-4 mb-4 px-3.5 pb-3 pt-4 sm:-mx-6 sm:-mt-6 sm:mb-6 sm:px-6 sm:pb-4 sm:pt-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center justify-between gap-4 border-b border-border/40 transition-all duration-300 ease-in-out",
        isVisible
          ? "translate-y-0 opacity-100 pointer-events-auto"
          : "-translate-y-full opacity-0 pointer-events-none",
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {!hideBackButton && (
          <button
            type="button"
            data-tour={dataTour}
            disabled={isNavigating}
            onClick={handleBack}
            aria-label={backLabel}
            className="inline-flex items-center gap-1.5 min-h-[44px] -ml-2.5 px-2.5 py-2 rounded-md text-[14px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{backLabel}</span>
          </button>
        )}
        {children}
      </div>

      {rightElement && (
        <div className="flex items-center gap-2 shrink-0">{rightElement}</div>
      )}
    </div>
  );
}
