import { useCallback, useEffect, useRef } from "react";

/** デフォルトのオートロックタイムアウト（分）: 5分（Webアプリと完全一致） */
export const DEFAULT_AUTOLOCK_MINUTES = 5;

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "click",
] as const;

interface UseInactivityLockOptions {
  onLock: () => void;
  enabled: boolean;
  timeoutMinutes?: number;
}

/**
 * 無操作タイムアウトと Visibility API によるオートロックを管理するフック（Web互換版）
 *
 * - ユーザー操作（キーボード、マウス、スクロール等）で lastActivityRef を更新。
 * - 非表示になった時刻（hiddenAtRef）と前回の操作時刻（lastActivityRef）の両方を考慮し、
 *   非表示復帰時に操作時点からの総経過時間を評価。
 * - タイムアウト超過なら即ロック、未満なら残り時間（remaining）でタイマーを再開。
 */
export function useInactivityLock({
  onLock,
  enabled,
  timeoutMinutes = DEFAULT_AUTOLOCK_MINUTES,
}: UseInactivityLockOptions): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const onLockRef = useRef(onLock);

  useEffect(() => {
    onLockRef.current = onLock;
  }, [onLock]);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    if (timeoutMinutes <= 0 || !enabled) return;

    const timeoutMs = timeoutMinutes * 60 * 1000;
    timerRef.current = setTimeout(() => {
      onLockRef.current();
    }, timeoutMs);
  }, [clearTimer, enabled, timeoutMinutes]);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    startTimer();
  }, [startTimer]);

  useEffect(() => {
    if (!enabled || timeoutMinutes <= 0) {
      clearTimer();
      hiddenAtRef.current = null;
      return;
    }

    lastActivityRef.current = Date.now();
    startTimer();

    const handleActivity = () => {
      resetTimer();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
        clearTimer();
      } else {
        const timeoutMs = timeoutMinutes * 60 * 1000;
        const hiddenAt = hiddenAtRef.current;
        hiddenAtRef.current = null;

        if (hiddenAt != null) {
          const elapsedSinceLastActivity = Date.now() - lastActivityRef.current;
          if (elapsedSinceLastActivity >= timeoutMs) {
            onLockRef.current();
            return;
          }
          clearTimer();
          const remaining = timeoutMs - elapsedSinceLastActivity;
          timerRef.current = setTimeout(() => {
            onLockRef.current();
          }, remaining);
        } else {
          resetTimer();
        }
      }
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTimer();
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearTimer, enabled, resetTimer, startTimer, timeoutMinutes]);
}
