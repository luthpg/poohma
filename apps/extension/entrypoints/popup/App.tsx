import {
  ExternalLink,
  KeyRound,
  PanelRightOpen,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { env } from "@/env";
import type { MatchedRecord } from "@/lib/messaging";
import { useTheme } from "@/lib/useTheme";

export function App() {
  useTheme();
  const [matchedRecords, setMatchedRecords] = useState<MatchedRecord[]>([]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!isMounted || !tab?.url) return;

        const res = await chrome.runtime.sendMessage({
          type: "GET_MATCHED_RECORDS",
          url: tab.url,
        });

        if (isMounted && res?.success && Array.isArray(res.matchedRecords)) {
          setMatchedRecords(res.matchedRecords);
        }
      } catch {
        // バックグラウンド非稼働等の例外は安全に握る
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleOpenSidePanel = async () => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.windowId && chrome.sidePanel?.open) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      } else if (tab?.id && chrome.sidePanel?.open) {
        await chrome.sidePanel.open({ tabId: tab.id });
      } else {
        await chrome.runtime.sendMessage({
          type: "OPEN_SIDEPANEL",
          windowId: tab?.windowId,
          tabId: tab?.id,
        });
      }
    } catch {
      chrome.runtime.sendMessage({ type: "OPEN_SIDEPANEL" }).catch(() => {});
    }
    window.close();
  };

  return (
    <div className="w-72 p-4 bg-background text-foreground space-y-3 font-sans">
      <div className="flex items-center gap-2.5">
        <img
          src="/poohma_icon.png"
          alt="PoohMa"
          className="h-7 w-7 rounded-lg object-contain shadow-xs"
        />
        <div>
          <h1 className="text-sm font-bold tracking-tight text-foreground leading-none">
            PoohMa
          </h1>
          <span className="text-[10px] text-muted-foreground">
            家族向けパスワードヒント管理
          </span>
        </div>
      </div>

      {matchedRecords.length > 0 ? (
        <div className="rounded-md border border-orange-200/80 bg-orange-50/50 p-2.5 dark:border-orange-900/60 dark:bg-orange-950/20 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-900 dark:text-orange-200">
            <KeyRound className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400 shrink-0" />
            <span>このサイトの登録情報（{matchedRecords.length}件）</span>
          </div>
          <div className="space-y-1">
            {matchedRecords.slice(0, 3).map((r) => (
              <div
                key={r._id}
                className="text-[11px] text-muted-foreground truncate"
              >
                ・{r.title}
                {r.credentials?.[0]?.loginId && (
                  <span className="opacity-75">
                    {" "}
                    ({r.credentials[0].loginId})
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground leading-relaxed">
          閲覧中のサイトに応じたログインIDやパスワードヒントの参照・自動入力は、サイドパネルからご利用いただけます。
        </p>
      )}

      <Button
        onClick={handleOpenSidePanel}
        className="w-full bg-orange-600 hover:bg-orange-500 text-white font-medium text-xs shadow-xs"
        size="sm"
      >
        <PanelRightOpen className="mr-1.5 h-3.5 w-3.5" />
        {matchedRecords.length > 0
          ? "サイドパネルで開く"
          : "サイドパネルを開く"}
      </Button>

      <div className="flex items-center justify-center pt-2 border-t border-border/80 text-[10px] text-muted-foreground">
        <a
          href={env.VITE_SITE_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-0.5 hover:text-foreground transition-colors"
        >
          Webを開く
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
    </div>
  );
}

export default App;
