import { useEffect, useState } from "react";

export type Theme = "system" | "light" | "dark";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    // 1. chrome.storage.local から保存済みテーマ設定を取得（Web同期値）
    chrome.storage.local.get(["theme"], (result) => {
      const stored = result.theme as Theme | undefined;
      if (stored === "light" || stored === "dark" || stored === "system") {
        setThemeState(stored);
      }
    });

    // 2. ストレージの変更監視
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName === "local" && changes.theme) {
        const next = changes.theme.newValue as Theme | undefined;
        if (next === "light" || next === "dark" || next === "system") {
          setThemeState(next);
        }
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyCurrentTheme = () => {
      const root = document.documentElement;
      root.classList.remove("light", "dark");

      const resolved =
        theme === "system" ? (mediaQuery.matches ? "dark" : "light") : theme;

      root.classList.add(resolved);
      root.style.colorScheme = resolved;
    };

    applyCurrentTheme();

    // デバイス設定（OSダークモード切り替え）のリアルタイム監視
    const handleMediaChange = () => {
      if (theme === "system") {
        applyCurrentTheme();
      }
    };

    mediaQuery.addEventListener("change", handleMediaChange);
    return () => {
      mediaQuery.removeEventListener("change", handleMediaChange);
    };
  }, [theme]);

  const setTheme = (nextTheme: Theme) => {
    setThemeState(nextTheme);
    chrome.storage.local.set({ theme: nextTheme }).catch(() => {});
  };

  return { theme, setTheme };
}
