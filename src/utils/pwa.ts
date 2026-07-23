export const isClient = typeof window !== "undefined";

/**
 * iOSのPWA（スタンドアロンモード）として起動されているか判定
 */
export const isIosPwa = (): boolean => {
  if (!isClient) return false;
  // @ts-expect-error window.navigator.standalone はiOS Safari固有のプロパティ
  return window.navigator.standalone === true;
};

const PWA_INIT_KEY = "pwa_auth_synchronized_v1";

/**
 * iOS PWAの初回起動であるかを判定（読み取りのみ）
 */
export const isPwaFirstLaunch = (): boolean => {
  if (!isIosPwa()) return false;
  const isInitialized = localStorage.getItem(PWA_INIT_KEY);
  return !isInitialized;
};

/**
 * iOS PWA初回起動フラグを保存（トークン同期成功後に呼ぶ）
 */
export const markPwaAsInitialized = (): void => {
  if (!isIosPwa()) return;
  localStorage.setItem(PWA_INIT_KEY, "true");
};
