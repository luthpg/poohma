import { ExternalLink, PanelRightOpen, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { env } from "@/env";
import { useTheme } from "@/lib/useTheme";

export function App() {
  useTheme();
  const handleOpenSidePanel = () => {
    chrome.runtime.sendMessage({ type: "OPEN_SIDEPANEL" }).catch(() => {});
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

      <p className="text-xs text-muted-foreground leading-relaxed">
        閲覧中のサイトに応じたログインIDやパスワードヒントの参照・自動入力は、サイドパネルからご利用いただけます。
      </p>

      <Button
        onClick={handleOpenSidePanel}
        className="w-full bg-orange-600 hover:bg-orange-500 text-white font-medium text-xs shadow-xs"
        size="sm"
      >
        <PanelRightOpen className="mr-1.5 h-3.5 w-3.5" />
        サイドパネルを開く
      </Button>

      <div className="flex items-center justify-between pt-2 border-t border-border/80 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          ゼロ知識 E2EE 暗号保護
        </span>
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
