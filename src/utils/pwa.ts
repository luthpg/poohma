export const isClient = typeof window !== "undefined";

/**
 * iOSのPWA（スタンドアロンモード）として起動されているか判定
 */
export const isIosPwa = (): boolean => {
  if (!isClient) return false;
  return (
    // @ts-expect-error window.navigator.standalone はiOS Safari固有のプロパティ
    window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
};

const PWA_INIT_KEY = "pwa_auth_synchronized_v1";

/**
 * iOS PWAの初回起動であるかを判定し、初回であればフラグを立てて true を返す
 */
export const checkAndMarkPwaFirstLaunch = (): boolean => {
  if (!isIosPwa()) return false;

  const isInitialized = localStorage.getItem(PWA_INIT_KEY);
  if (!isInitialized) {
    localStorage.setItem(PWA_INIT_KEY, "true");
    return true; // 初回起動
  }
  return false; // 2回目以降の起動
};
