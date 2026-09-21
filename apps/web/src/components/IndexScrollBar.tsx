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
  const containerRectRef = useRef<DOMRect | null>(null);
  const activeBubbleTimerRef = useRef<NodeJS.Timeout | null>(null);

  // --- rAF ベース smooth scroll（WebKit ネイティブ smooth の連打暴走を回避） ---
  const scrollRafRef = useRef<number | null>(null);
  const scrollTargetRef = useRef<number | null>(null);

  const cancelSmoothScroll = useCallback(() => {
    if (scrollRafRef.current != null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
    scrollTargetRef.current = null;
  }, []);

  /** rAF lerp スクロール: ターゲットを差し替えるだけで滑らかに追従する */
  const rafSmoothScrollTo = useCallback((targetTop: number) => {
    const maxScrollTop = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight,
    );
    scrollTargetRef.current = Math.min(maxScrollTop, Math.max(0, targetTop));

    // 既にアニメーションループが動いていれば、ターゲット更新だけで十分
    if (scrollRafRef.current != null) return;

    const animate = () => {
      const target = scrollTargetRef.current;
      if (target == null) {
        scrollRafRef.current = null;
        return;
      }

      const current = window.scrollY;
      const diff = target - current;

      // 十分近づいたら即座にスナップして完了
      if (Math.abs(diff) < 1) {
        window.scrollTo({ top: target, behavior: "instant" });
        scrollRafRef.current = null;
        scrollTargetRef.current = null;
        return;
      }

      // 毎フレーム残り距離の 18% ずつ進む（ease-out 減速カーブ）
      const next = current + diff * 0.18;
      window.scrollTo({ top: next, behavior: "instant" });
      scrollRafRef.current = requestAnimationFrame(animate);
    };

    scrollRafRef.current = requestAnimationFrame(animate);
  }, []);

  // --- スクロール関数（タップ用: ネイティブ smooth / ドラッグ用: rAF lerp） ---
  const scrollToGroup = useCallback(
    (key: IndexGroupKey, useNativeSmooth = true) => {
      setActiveBubble(key);
      if (onSelectGroup) {
        onSelectGroup(key);
      } else {
        const targetElement = document.getElementById(`index-group-${key}`);
        if (targetElement) {
          const rect = targetElement.getBoundingClientRect();
          const targetTop = rect.top + window.scrollY - 60;
          if (useNativeSmooth) {
            cancelSmoothScroll();
            window.scrollTo({
              top: Math.max(0, targetTop),
              behavior: "smooth",
            });
          } else {
            rafSmoothScrollTo(targetTop);
          }
        }
      }
    },
    [onSelectGroup, cancelSmoothScroll, rafSmoothScrollTo],
  );

  const scrollToBottom = useCallback(
    (useNativeSmooth = true) => {
      setActiveBubble("BOTTOM");
      const targetTop = document.documentElement.scrollHeight;
      if (useNativeSmooth) {
        cancelSmoothScroll();
        window.scrollTo({
          top: targetTop,
          behavior: "smooth",
        });
      } else {
        rafSmoothScrollTo(targetTop);
      }
    },
    [cancelSmoothScroll, rafSmoothScrollTo],
  );

  const updateIndexFromCoords = useCallback(
    (clientY: number, clientX: number) => {
      const rect =
        containerRectRef.current ??
        containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      // バーの左右80px以内であればドラッグ追従
      if (clientX >= rect.left - 80 && clientX <= rect.right + 80) {
        const relativeY = Math.max(
          0,
          Math.min(1, (clientY - rect.top) / rect.height),
        );
        const allKeys = [...availableGroups, "BOTTOM"];
        const index = Math.min(
          allKeys.length - 1,
          Math.floor(relativeY * allKeys.length),
        );
        const groupKey = allKeys[index];

        if (groupKey && groupKey !== lastGroupKeyRef.current) {
          lastGroupKeyRef.current = groupKey;
          // ドラッグ中は rAF lerp smooth scroll（ネイティブ smooth の暴走を回避）
          if (groupKey === "BOTTOM") {
            scrollToBottom(false);
          } else {
            scrollToGroup(groupKey as IndexGroupKey, false);
          }
        }
      }
    },
    [availableGroups, scrollToBottom, scrollToGroup],
  );

  // --- タッチ操作（iOS PWA / モバイル向け） ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (!touch) return;

      setIsDragging(true);
      isDraggingRef.current = true;
      lastGroupKeyRef.current = null;
      containerRectRef.current = el.getBoundingClientRect();
      updateIndexFromCoords(touch.clientY, touch.clientX);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current) return;
      // OS のスクロール横取りを完全に阻止（PWA standalone で必須）
      if (e.cancelable) {
        e.preventDefault();
      }
      const touch = e.touches[0];
      if (!touch) return;
      updateIndexFromCoords(touch.clientY, touch.clientX);
    };

    const onTouchEnd = () => {
      if (!isDraggingRef.current) return;
      setIsDragging(false);
      isDraggingRef.current = false;
      containerRectRef.current = null;
      if (activeBubbleTimerRef.current) {
        clearTimeout(activeBubbleTimerRef.current);
      }
      activeBubbleTimerRef.current = setTimeout(() => {
        setActiveBubble(null);
      }, 400);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [updateIndexFromCoords]);

  // --- マウス操作（PC Windows Chrome等） ---
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return; // タッチは Native TouchEvent 側で処理
    setIsDragging(true);
    isDraggingRef.current = true;
    lastGroupKeyRef.current = null;
    if (containerRef.current) {
      containerRectRef.current = containerRef.current.getBoundingClientRect();
    }
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch (_err) {
      // ignore
    }
    updateIndexFromCoords(e.clientY, e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    if (!isDraggingRef.current && e.buttons === 0) return;
    updateIndexFromCoords(e.clientY, e.clientX);
  };

  const handlePointerUp = (e?: React.PointerEvent) => {
    if (e?.pointerType === "touch") return;
    setIsDragging(false);
    isDraggingRef.current = false;
    containerRectRef.current = null;
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
    const handleGlobalUp = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (isDraggingRef.current) {
        setIsDragging(false);
        isDraggingRef.current = false;
        containerRectRef.current = null;
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
      cancelSmoothScroll();
    };
  }, [cancelSmoothScroll]);

  if (availableGroups.length === 0) return null;

  return (
    <>
      {/* 操作中中央ポップアップバブル */}
      {activeBubble &&
        (() => {
          const allKeys = [...availableGroups, "BOTTOM"];
          const currentIdx = allKeys.indexOf(activeBubble);
          const prevKey = currentIdx > 0 ? allKeys[currentIdx - 1] : null;
          const nextKey =
            currentIdx < allKeys.length - 1 ? allKeys[currentIdx + 1] : null;
          return (
            <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center animate-in fade-in zoom-in-75 duration-150">
              {/* 外殻: グラスモーフィズム（ライト/ダーク対応） */}
              <div className="flex w-[76px] flex-col items-stretch rounded-[20px] bg-white/75 dark:bg-neutral-900/75 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.1),0_2px_6px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.45),0_2px_6px_rgba(0,0,0,0.25)] ring-1 ring-black/[0.06] dark:ring-white/[0.08] overflow-hidden">
                {/* 前のインデックス */}
                <div className="flex h-8 items-center justify-center text-[13px] font-semibold text-foreground/45 tracking-wide">
                  {prevKey === "BOTTOM" ? (
                    <ArrowDown className="h-3.5 w-3.5 stroke-[2]" />
                  ) : prevKey ? (
                    prevKey
                  ) : null}
                </div>
                {/* セパレーター */}
                <div className="mx-3 h-px bg-border/30" />
                {/* 現在のインデックス */}
                <div className="flex h-[60px] items-center justify-center bg-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.25)]">
                  <span className="text-[34px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.15)] leading-none">
                    {activeBubble === "BOTTOM" ? (
                      <ArrowDown className="h-10 w-10 stroke-[2.5]" />
                    ) : (
                      activeBubble
                    )}
                  </span>
                </div>
                {/* セパレーター */}
                <div className="mx-3 h-px bg-border/30" />
                {/* 次のインデックス */}
                <div className="flex h-8 items-center justify-center text-[13px] font-semibold text-foreground/45 tracking-wide">
                  {nextKey === "BOTTOM" ? (
                    <ArrowDown className="h-3.5 w-3.5 stroke-[2]" />
                  ) : nextKey ? (
                    nextKey
                  ) : null}
                </div>
              </div>
            </div>
          );
        })()}

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
          {availableGroups.map((key) => (
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
              style={{ WebkitTapHighlightColor: "transparent" }}
              className={cn(
                "w-full flex-1 max-h-[22px] min-h-[12px] my-[0.5px] flex items-center justify-center rounded-full text-[10px] md:text-[11px] font-semibold transition-colors cursor-pointer shrink touch-none",
                activeBubble === key
                  ? "bg-orange-500 text-white font-bold shadow-sm"
                  : "text-foreground/45 hover:bg-orange-500/15 hover:text-orange-500",
              )}
            >
              {key}
            </button>
          ))}

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
            style={{ WebkitTapHighlightColor: "transparent" }}
            className={cn(
              "w-full flex-1 max-h-[22px] min-h-[14px] my-[0.5px] flex items-center justify-center rounded-full transition-colors cursor-pointer shrink touch-none",
              activeBubble === "BOTTOM"
                ? "bg-orange-500 text-white shadow-sm"
                : "text-foreground/45 hover:bg-orange-500/15 hover:text-orange-500",
            )}
          >
            <ArrowDown className="h-3 w-3 md:h-3.5 md:w-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}
