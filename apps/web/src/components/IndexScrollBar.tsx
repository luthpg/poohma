import type { IndexGroupKey } from "@poohma/shared/utils/index-group";
import { ArrowDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

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
  const scrollStartTimeRef = useRef<number>(0);
  const scrollLastYRef = useRef<number>(0);
  const scrollStallCountRef = useRef<number>(0);

  const cancelSmoothScroll = useCallback(() => {
    if (scrollRafRef.current != null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
    scrollTargetRef.current = null;
    scrollStallCountRef.current = 0;
  }, []);

  /** rAF lerp スクロール: ターゲットを差し替えるだけで滑らかに追従する */
  const rafSmoothScrollTo = useCallback(
    (targetTop: number) => {
      const maxScrollTop = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      scrollTargetRef.current = Math.min(maxScrollTop, Math.max(0, targetTop));
      scrollStartTimeRef.current = performance.now();
      scrollStallCountRef.current = 0;
      scrollLastYRef.current = window.scrollY;

      // 既にアニメーションループが動いていれば、ターゲットとタイムスタンプの更新だけで十分
      if (scrollRafRef.current != null) return;

      const animate = (now: number) => {
        const target = scrollTargetRef.current;
        if (target == null) {
          scrollRafRef.current = null;
          return;
        }

        // 時間上限（800ms）チェック: 到達できなくても時間上限で確実に終了
        if (now - scrollStartTimeRef.current > 800) {
          window.scrollTo({ top: target, behavior: "instant" });
          cancelSmoothScroll();
          return;
        }

        const current = window.scrollY;
        const diff = target - current;

        // 十分近づいたら即座にスナップして完了
        if (Math.abs(diff) <= 1) {
          window.scrollTo({ top: target, behavior: "instant" });
          cancelSmoothScroll();
          return;
        }

        // 進行停止（スタック）検知: 前フレームから位置が変わっていない場合
        if (Math.abs(current - scrollLastYRef.current) < 0.5) {
          scrollStallCountRef.current += 1;
          if (scrollStallCountRef.current >= 3) {
            // 3フレーム連続で進行しなければ即座に目標にスナップして終了
            window.scrollTo({ top: target, behavior: "instant" });
            cancelSmoothScroll();
            return;
          }
        } else {
          scrollStallCountRef.current = 0;
        }
        scrollLastYRef.current = current;

        // 毎フレーム残り距離の 18% ずつ進む（最小ステップ 1px 保証で丸めスタック防止）
        const step = Math.sign(diff) * Math.max(1, Math.abs(diff * 0.18));
        const next = Math.abs(step) >= Math.abs(diff) ? target : current + step;

        window.scrollTo({ top: next, behavior: "instant" });
        scrollRafRef.current = requestAnimationFrame(animate);
      };

      scrollRafRef.current = requestAnimationFrame(animate);
    },
    [cancelSmoothScroll],
  );

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

  const getKeyFromCoords = useCallback(
    (clientY: number, clientX: number): string | null => {
      const rect =
        containerRectRef.current ??
        containerRef.current?.getBoundingClientRect();
      if (!rect) return null;

      // バーの左右80px以内であれば有効
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
        return allKeys[index] ?? null;
      }
      return null;
    },
    [availableGroups],
  );

  const updateIndexFromCoords = useCallback(
    (clientY: number, clientX: number) => {
      const groupKey = getKeyFromCoords(clientY, clientX);
      if (groupKey && groupKey !== lastGroupKeyRef.current) {
        lastGroupKeyRef.current = groupKey;
        // ドラッグ中は rAF lerp smooth scroll（ネイティブ smooth の暴走を回避）
        if (groupKey === "BOTTOM") {
          scrollToBottom(false);
        } else {
          scrollToGroup(groupKey as IndexGroupKey, false);
        }
      }
    },
    [getKeyFromCoords, scrollToBottom, scrollToGroup],
  );

  // --- 外部ユーザー操作（ホイール、スワイプ等）によるアニメーションの自動中断 ---
  useEffect(() => {
    const handleUserInterrupt = () => {
      if (!isDraggingRef.current && scrollRafRef.current != null) {
        cancelSmoothScroll();
      }
    };

    window.addEventListener("wheel", handleUserInterrupt, { passive: true });
    window.addEventListener("touchmove", handleUserInterrupt, {
      passive: true,
    });
    return () => {
      window.removeEventListener("wheel", handleUserInterrupt);
      window.removeEventListener("touchmove", handleUserInterrupt);
    };
  }, [cancelSmoothScroll]);

  // --- タッチ操作（iOS PWA / モバイル向け） ---
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isTouchDraggingRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (!touch) return;

      containerRectRef.current = el.getBoundingClientRect();
      touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
      isTouchDraggingRef.current = false;
      lastGroupKeyRef.current = null;

      // 触れた瞬間にどのキーか視覚フィードバック（ポップアップバブル表示）
      const key = getKeyFromCoords(touch.clientY, touch.clientX);
      if (key) {
        setActiveBubble(key);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch || !touchStartPosRef.current) return;

      const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y);
      const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x);

      // 一定以上の移動（6px）でドラッグ追従を開始
      if (!isTouchDraggingRef.current && (deltaY > 6 || deltaX > 6)) {
        isTouchDraggingRef.current = true;
        setIsDragging(true);
        isDraggingRef.current = true;
      }

      if (isTouchDraggingRef.current) {
        // OS のスクロール横取りを完全に阻止（PWA standalone で必須）
        if (e.cancelable) {
          e.preventDefault();
        }
        updateIndexFromCoords(touch.clientY, touch.clientX);
      }
    };

    const onTouchEnd = () => {
      touchStartPosRef.current = null;
      containerRectRef.current = null;

      if (isTouchDraggingRef.current) {
        isTouchDraggingRef.current = false;
        setIsDragging(false);
        isDraggingRef.current = false;
      }

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
  }, [getKeyFromCoords, updateIndexFromCoords]);

  // --- マウス操作（PC Windows Chrome等） ---
  const pointerStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isPointerDraggingRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return; // タッチは Native TouchEvent 側で処理
    if (containerRef.current) {
      containerRectRef.current = containerRef.current.getBoundingClientRect();
    }
    pointerStartPosRef.current = { x: e.clientX, y: e.clientY };
    isPointerDraggingRef.current = false;
    lastGroupKeyRef.current = null;
    const key = getKeyFromCoords(e.clientY, e.clientX);
    if (key) {
      setActiveBubble(key);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    if (e.buttons === 0) {
      // ボタン未押下: 残留した開始位置を破棄してホバー移動を無視
      pointerStartPosRef.current = null;
      isPointerDraggingRef.current = false;
      return;
    }

    if (pointerStartPosRef.current) {
      const deltaY = Math.abs(e.clientY - pointerStartPosRef.current.y);
      const deltaX = Math.abs(e.clientX - pointerStartPosRef.current.x);
      if (!isPointerDraggingRef.current && (deltaY > 4 || deltaX > 4)) {
        isPointerDraggingRef.current = true;
        setIsDragging(true);
        isDraggingRef.current = true;
        // ドラッグ操作確定時にのみポインタをキャプチャ（単体クリックの click イベント抑制を防止）
        try {
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        } catch (_err) {
          // ignore
        }
      }
    }

    if (isPointerDraggingRef.current || isDraggingRef.current) {
      updateIndexFromCoords(e.clientY, e.clientX);
    }
  };

  const handlePointerUp = (e?: React.PointerEvent) => {
    if (e?.pointerType === "touch") return;
    const wasDragging = isPointerDraggingRef.current;
    pointerStartPosRef.current = null;
    isPointerDraggingRef.current = false;
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
    // 単体クリック（移動なし）で、ボタン以外の余白で pointerup された場合のフォールバック
    if (!wasDragging && e) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest("button")) {
        const key = getKeyFromCoords(e.clientY, e.clientX);
        if (key) {
          if (key === "BOTTOM") {
            scrollToBottom();
          } else {
            scrollToGroup(key as IndexGroupKey);
          }
        }
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
      pointerStartPosRef.current = null;
      isPointerDraggingRef.current = false;
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
