import { ExternalLink, PanelRightOpen, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export function App() {
  const handleOpenSidePanel = () => {
    chrome.runtime.sendMessage({ type: "OPEN_SIDEPANEL" }).catch(() => {});
    window.close();
  };

  return (
    <div className="w-72 p-4 bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 space-y-3 font-sans">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-white font-bold text-sm shadow-sm">
          🐻
        </div>
        <div>
          <h1 className="text-sm font-bold leading-none">PoohMa</h1>
          <span className="text-[10px] text-stone-500 dark:text-stone-400">
            家族向けアカウント管理
          </span>
        </div>
      </div>

      <p className="text-xs text-stone-600 dark:text-stone-400">
        閲覧中のサイトのログインIDやパスワードヒントを参照・入力するには、サイドパネルを開いてください。
      </p>

      <Button onClick={handleOpenSidePanel} className="w-full" size="sm">
        <PanelRightOpen className="mr-1.5 h-3.5 w-3.5" />
        サイドパネルを開く
      </Button>

      <div className="flex items-center justify-between pt-2 border-t border-stone-200 dark:border-stone-800 text-[10px] text-stone-400">
        <span className="flex items-center gap-1">
          <Shield className="h-3 w-3 text-amber-600" />
          E2EE 暗号保護
        </span>
        <a
          href="https://poohma.ciderlabs.link"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-0.5 hover:text-stone-600 dark:hover:text-stone-200"
        >
          Webを開く
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
    </div>
  );
}

export default App;
