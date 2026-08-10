import { useCallback, useEffect, useRef } from "react";

/** localStorage に保存するオートロックタイムアウトのキー */
export const AUTOLOCK_TIMEOUT_KEY = "autolock-timeout-minutes";

/** デフォルトのタイムアウト（分） */
export const AUTOLOCK_DEFAULT_MINUTES = 5;

/**
 * localStorage からオートロックタイムアウト（分）を取得する。
 * 未設定または不正値の場合はデフォルト値を返す。
 */
export function getAutolockTimeoutMinutes(): number {
  if (
    typeof window === "undefined" ||
    typeof localStorage === "undefined" ||
    localStorage == null
  ) {
    return AUTOLOCK_DEFAULT_MINUTES;
  }
  try {
    const stored = localStorage.getItem(AUTOLOCK_TIMEOUT_KEY);
    if (stored == null) return AUTOLOCK_DEFAULT_MINUTES;
    const parsed = Number(stored);
    if (Number.isNaN(parsed) || parsed < 0) return AUTOLOCK_DEFAULT_MINUTES;
    return parsed;
  } catch {
    return AUTOLOCK_DEFAULT_MINUTES;
  }
}

/**
 * localStorage にオートロックタイムアウト（分）を保存する。
 */
export function setAutolockTimeoutMinutes(minutes: number): void {
  if (
    typeof window === "undefined" ||
    typeof localStorage === "undefined" ||
    localStorage == null
  ) {
    return;
  }
  try {
    localStorage.setItem(AUTOLOCK_TIMEOUT_KEY, String(minutes));
  } catch {
    // ignore
  }
}

/** ユーザー操作として監視するイベント */
const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "click",
] as const;

interface UseInactivityLockOptions {
  /** ロック発火時のコールバック */
  onLock: () => void;
  /** タイマーが有効か（masterKey がセットされている場合のみ true） */
  enabled: boolean;
  /** オートロックタイムアウト（分） */
  timeoutMinutes: number;
}

/**
 * 無操作タイムアウトと Visibility API によるオートロックを管理するフック。
 *
 * - ユーザー操作（マウス、キーボード、タッチ、スクロール等）を監視し、
 *   操作のたびにタイムアウトタイマーをリセットする。
 * - タブが hidden になった際にタイムスタンプを記録し、
 *   visible に復帰した際に経過時間がタイムアウト以上ならロックを発火する。
 * - `enabled` が false の場合はすべてのリスナーとタイマーをクリーンアップする。
 */
export function useInactivityLock({
  onLock,
  enabled,
  timeoutMinutes,
}: UseInactivityLockOptions): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const onLockRef = useRef(onLock);

  // onLock の最新参照を保持（useEffect のクリーンアップ問題を回避）
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
    // 0 = 無効
    if (timeoutMinutes === 0) return;

    const timeoutMs = timeoutMinutes * 60 * 1000;
    timerRef.current = setTimeout(() => {
      onLockRef.current();
    }, timeoutMs);
  }, [clearTimer, timeoutMinutes]);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    startTimer();
  }, [startTimer]);

  useEffect(() => {
    if (!enabled) {
      clearTimer();
      hiddenAtRef.current = null;
      return;
    }

    // 初回タイマー開始
    lastActivityRef.current = Date.now();
    startTimer();

    // ユーザー操作イベントのハンドラ
    const handleActivity = () => {
      resetTimer();
    };

    // Visibility API のハンドラ
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // hidden 時: タイムスタンプを記録し、タイマーをクリア
        hiddenAtRef.current = Date.now();
        clearTimer();
      } else {
        // visible 復帰時: 経過時間を判定
        if (timeoutMinutes === 0) {
          // 無効設定の場合はそのまま
          hiddenAtRef.current = null;
          return;
        }

        const timeoutMs = timeoutMinutes * 60 * 1000;
        const hiddenAt = hiddenAtRef.current;
        hiddenAtRef.current = null;

        if (hiddenAt != null) {
          const elapsedSinceLastActivity = Date.now() - lastActivityRef.current;
          if (elapsedSinceLastActivity >= timeoutMs) {
            // タイムアウト超過 → ロック
            onLockRef.current();
            return;
          }
          // タイムアウト未満 → 残り時間でタイマー再開
          clearTimer();
          const remaining = timeoutMs - elapsedSinceLastActivity;
          timerRef.current = setTimeout(() => {
            onLockRef.current();
          }, remaining);
        } else {
          // hiddenAt が記録されていない場合は通常のタイマーリセット
          resetTimer();
        }
      }
    };

    // イベントリスナー登録
    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, handleActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTimer();
      for (const event of ACTIVITY_EVENTS) {
        document.removeEventListener(event, handleActivity);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, clearTimer, startTimer, resetTimer, timeoutMinutes]);
}
