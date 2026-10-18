import { useCallback, useEffect, useRef } from "react";

/** デフォルトのオートロックタイムアウト（分）: 15分 */
export const DEFAULT_AUTOLOCK_MINUTES = 15;

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
 * 無操作タイムアウトと Visibility API によるオートロックを管理するフック（拡張機能用）
 */
export function useInactivityLock({
  onLock,
  enabled,
  timeoutMinutes = DEFAULT_AUTOLOCK_MINUTES,
}: UseInactivityLockOptions): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
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

  const handleActivity = useCallback(() => {
    startTimer();
  }, [startTimer]);

  useEffect(() => {
    if (!enabled || timeoutMinutes <= 0) {
      clearTimer();
      return;
    }

    startTimer();

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else {
        if (hiddenAtRef.current != null) {
          const elapsed = Date.now() - hiddenAtRef.current;
          const timeoutMs = timeoutMinutes * 60 * 1000;
          if (elapsed >= timeoutMs) {
            onLockRef.current();
            hiddenAtRef.current = null;
            return;
          }
        }
        hiddenAtRef.current = null;
        startTimer();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTimer();
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearTimer, enabled, handleActivity, startTimer, timeoutMinutes]);
}
