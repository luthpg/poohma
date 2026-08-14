import { ArrowDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { IndexGroupKey } from "@/utils/index-group";

interface IndexScrollBarProps {
  availableGroups: IndexGroupKey[];
  onSelectGroup?: (group: IndexGroupKey) => void;
  className?: string;
}

export function IndexScrollBar({
  availableGroups,
  onSelectGroup,
  className,
}: IndexScrollBarProps) {
  const [activeBubble, setActiveBubble] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const lastGroupKeyRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeBubbleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToGroup = useCallback(
    (key: IndexGroupKey) => {
      setActiveBubble(key);
      if (onSelectGroup) {
        onSelectGroup(key);
      } else {
        const targetElement = document.getElementById(`index-group-${key}`);
        if (targetElement) {
          const rect = targetElement.getBoundingClientRect();
          const targetTop = rect.top + window.scrollY - 60;
          window.scrollTo({
            top: Math.max(0, targetTop),
            behavior: "smooth",
          });
        }
      }
    },
    [onSelectGroup],
  );

  const scrollToBottom = useCallback(() => {
    setActiveBubble("BOTTOM");
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    isDraggingRef.current = true;
    lastGroupKeyRef.current = null;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch (_err) {
      // ignore
    }
    handlePointerMove(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current && e.buttons === 0) return;
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();

    // バーの左右80px以内であればドラッグ追従
    if (e.clientX >= rect.left - 80 && e.clientX <= rect.right + 80) {
      const relativeY = Math.max(
        0,
        Math.min(1, (e.clientY - rect.top) / rect.height),
      );
      const allKeys = [...availableGroups, "BOTTOM"];
      const index = Math.min(
        allKeys.length - 1,
        Math.floor(relativeY * allKeys.length),
      );
      const groupKey = allKeys[index];

      if (groupKey && groupKey !== lastGroupKeyRef.current) {
        lastGroupKeyRef.current = groupKey;
        if (groupKey === "BOTTOM") {
          scrollToBottom();
        } else {
          scrollToGroup(groupKey as IndexGroupKey);
        }
      }
    }
  };

  const handlePointerUp = (e?: React.PointerEvent) => {
    setIsDragging(false);
    isDraggingRef.current = false;
    if (e?.currentTarget) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch (_err) {
        // ignore
      }
    }
    if (activeBubbleTimerRef.current) {
      clearTimeout(activeBubbleTimerRef.current);
    }
    activeBubbleTimerRef.current = setTimeout(() => {
      setActiveBubble(null);
    }, 400);
  };

  useEffect(() => {
    const handleGlobalUp = () => {
      if (isDraggingRef.current) {
        setIsDragging(false);
        isDraggingRef.current = false;
        setActiveBubble(null);
      }
    };
    window.addEventListener("pointerup", handleGlobalUp);
    return () => window.removeEventListener("pointerup", handleGlobalUp);
  }, []);

  useEffect(() => {
    return () => {
      if (activeBubbleTimerRef.current) {
        clearTimeout(activeBubbleTimerRef.current);
      }
    };
  }, []);

  if (availableGroups.length === 0) return null;

  return (
    <>
      {/* 操作中中央ポップアップバブル */}
      {activeBubble && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center animate-in fade-in zoom-in-75 duration-150">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-orange-500 text-3xl font-bold text-white shadow-2xl backdrop-blur">
            {activeBubble === "BOTTOM" ? (
              <ArrowDown className="h-10 w-10 stroke-[2.5]" />
            ) : (
              activeBubble
            )}
          </div>
        </div>
      )}

      {/* 右側固定インデックスバー（1画面に100%収まるレスポンシブ配置） */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={cn(
          "fixed right-0.5 md:right-2.5 top-1/2 -translate-y-1/2 z-30 select-none touch-none flex flex-col items-center py-1.5 px-0.5 md:px-1 rounded-2xl md:rounded-3xl border transition-all duration-200 ease-out max-h-[85vh] overflow-hidden justify-between",
          isDragging
            ? "w-10 md:w-12 text-foreground bg-background/95 border-orange-500/40 shadow-xl backdrop-blur-md"
            : "w-6 md:w-7 hover:w-10 md:hover:w-12 text-muted-foreground/50 hover:text-foreground/85 bg-transparent md:bg-background/55 border-transparent md:border-border/35 shadow-none md:shadow-sm md:backdrop-blur-md hover:bg-background/85 hover:border-border/70 hover:shadow-xl",
          className,
        )}
      >
        <div className="w-full flex flex-col items-center justify-between flex-1 overflow-hidden">
          {availableGroups.map((key) => {
            const isActive = activeBubble === key;
            return (
              <button
                key={key}
                type="button"
                data-index-key={key}
                onClick={() => {
                  scrollToGroup(key);
                  if (activeBubbleTimerRef.current) {
                    clearTimeout(activeBubbleTimerRef.current);
                  }
                  activeBubbleTimerRef.current = setTimeout(() => {
                    setActiveBubble(null);
                  }, 400);
                }}
                className={cn(
                  "w-full flex-1 max-h-[22px] min-h-[12px] my-[0.5px] flex items-center justify-center rounded-full text-[10px] md:text-[11px] font-semibold transition-colors cursor-pointer shrink",
                  isActive
                    ? "bg-orange-500 text-white font-bold shadow-sm"
                    : "text-foreground/45 hover:bg-orange-500/15 hover:text-orange-500 active:bg-orange-500/25",
                )}
              >
                {key}
              </button>
            );
          })}

          {/* 区切り線 */}
          <div className="w-3 md:w-3.5 h-[1px] bg-border/35 my-0.5 shrink-0" />

          {/* 末尾までスクロールボタン */}
          <button
            type="button"
            data-index-key="BOTTOM"
            onClick={() => {
              scrollToBottom();
              if (activeBubbleTimerRef.current) {
                clearTimeout(activeBubbleTimerRef.current);
              }
              activeBubbleTimerRef.current = setTimeout(() => {
                setActiveBubble(null);
              }, 400);
            }}
            title="末尾までスクロール"
            aria-label="末尾までスクロール"
            className={cn(
              "w-full flex-1 max-h-[22px] min-h-[14px] my-[0.5px] flex items-center justify-center rounded-full transition-colors cursor-pointer shrink",
              activeBubble === "BOTTOM"
                ? "bg-orange-500 text-white shadow-sm"
                : "text-foreground/45 hover:bg-orange-500/15 hover:text-orange-500 active:bg-orange-500/25",
            )}
          >
            <ArrowDown className="h-3 w-3 md:h-3.5 md:w-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}
