import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { IndexGroupKey } from "@/utils/index-group";

interface IndexScrollBarProps {
  availableGroups: IndexGroupKey[];
  onSelectGroup?: (group: IndexGroupKey) => void;
}

export function IndexScrollBar({
  availableGroups,
  onSelectGroup,
}: IndexScrollBarProps) {
  const [activeBubble, setActiveBubble] = useState<IndexGroupKey | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollToGroup = useCallback(
    (key: IndexGroupKey) => {
      setActiveBubble(key);
      if (onSelectGroup) {
        onSelectGroup(key);
      } else {
        const targetElement = document.getElementById(`index-group-${key}`);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    },
    [onSelectGroup],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    handlePointerMove(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current && e.buttons === 0) return;
    if (!containerRef.current) return;

    const element = document.elementFromPoint(e.clientX, e.clientY);
    if (!element) return;

    const groupKey = element.getAttribute("data-index-key") as IndexGroupKey;
    if (groupKey && availableGroups.includes(groupKey)) {
      scrollToGroup(groupKey);
    }
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    isDraggingRef.current = false;
    setTimeout(() => {
      setActiveBubble(null);
    }, 400);
  };

  useEffect(() => {
    const handleGlobalUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setActiveBubble(null);
      }
    };
    window.addEventListener("pointerup", handleGlobalUp);
    return () => window.removeEventListener("pointerup", handleGlobalUp);
  }, []);

  if (availableGroups.length === 0) return null;

  return (
    <>
      {/* 操作中中央ポップアップバブル */}
      {activeBubble && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center animate-in fade-in zoom-in-75 duration-150">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-orange-500 text-3xl font-bold text-white shadow-2xl backdrop-blur">
            {activeBubble}
          </div>
        </div>
      )}

      {/* 右側固定インデックスバー */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={cn(
          "fixed right-1 top-1/2 -translate-y-1/2 z-30 select-none touch-none flex flex-col items-center py-1.5 px-0.5 rounded-full backdrop-blur border border-border/50 shadow-md text-[10px] md:text-[11px] font-semibold transition-all origin-right duration-200 ease-out max-h-[80vh] overflow-y-auto no-scrollbar",
          isDragging ? "scale-125 text-foreground bg-background" : "scale-100 text-muted-foreground bg-background/85",
        )}
      >
        {availableGroups.map((key) => {
          const isActive = activeBubble === key;
          return (
            <button
              key={key}
              type="button"
              data-index-key={key}
              onClick={() => {
                scrollToGroup(key);
                setTimeout(() => {
                  setActiveBubble(null);
                }, 400);
              }}
              className={`flex h-4 w-4 md:h-5 md:w-5 items-center justify-center rounded-full transition-transform cursor-pointer ${
                isActive
                  ? "bg-orange-500 text-white font-bold scale-125 z-10"
                  : "hover:text-orange-500 hover:scale-110 active:scale-95 text-foreground/80"
              }`}
            >
              {key}
            </button>
          );
        })}
      </div>
    </>
  );
}
