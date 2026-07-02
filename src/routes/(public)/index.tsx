import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  Globe,
  Lock,
  Search,
  Shield,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { JpText } from "@/components/JpText";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/(public)/")({
  component: RouteComponent,
});

function RouteComponent() {
  const [activeTab, setActiveTab] = useState("security");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // デモスマホ画面用のアニメーションステート
  const [demoStep, setDemoStep] = useState(0);
  const [_copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setDemoStep((prev) => {
        const next = (prev + 1) % 5;
        if (next === 0) {
          setCopied(false);
        }
        if (next === 4) {
          setCopied(true);
        }
        return next;
      });
    }, 2800);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 antialiased font-sans transition-colors duration-300 break-words overflow-x-hidden">
      {/* インラインスタイルでカスタムアニメーションを注入 */}
      <style>{`
        @keyframes border-flow {
          0% { stroke-dashoffset: 40; }
          100% { stroke-dashoffset: 0; }
        }
        .animate-border-flow {
          animation: border-flow 3s linear infinite;
        }
      `}</style>

      <main>
        {/* ─── ① HERO SECTION ─── */}
        <section className="relative overflow-hidden py-16 md:py-28 bg-white dark:bg-zinc-950">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-12 gap-12 items-center">
            {/* 左側コピー・アクション */}
            <div className="md:col-span-6 text-center md:text-left flex flex-col items-center md:items-start z-10">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 dark:bg-orange-500/10 px-3.5 py-1 text-xs font-semibold text-orange-600 dark:text-orange-400 mb-6 border border-orange-100 dark:border-orange-500/20 tracking-geist-ui">
                <Shield className="h-3.5 w-3.5" />{" "}
                金融機関レベルのデータ暗号鍵保護を採用
              </div>
              <h1 className="text-[26px] sm:text-5xl lg:text-6xl font-extrabold tracking-geist-hero leading-[1.12] text-[#171717] dark:text-zinc-100">
                <JpText>家族の「パスワード忘れた」を</JpText>
                <br />
                <span className="text-[#f97316] dark:text-orange-400">
                  <JpText>たった1分</JpText>
                </span>
                <JpText>で解決する。</JpText>
              </h1>

              {/* モバイル専用: コンパクトなイラスト表示で情緒的つながりを創出 */}
              <div className="block md:hidden my-6 w-full max-w-[90%] rounded-2xl overflow-hidden bg-[#fafafa] dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800 p-3 shadow-sm transition-transform duration-300">
                <img
                  src="/hero-image.png"
                  alt="ファミリーイラスト"
                  className="w-full h-full object-contain rounded-xl"
                />
              </div>

              <JpText
                as="p"
                className="mt-6 max-w-xl text-base text-[#4d4d4d] dark:text-zinc-400 sm:text-lg leading-relaxed"
              >
                PoohMa（プーマ）は、実際のパスワードを1文字もサーバーに預けません。ご家族にしか分からない「ヒント」を安全に共有する、全く新しいアカウント管理帳です。
              </JpText>

              <div className="mt-8 flex w-full flex-col sm:flex-row gap-4 justify-center md:justify-start">
                <Button
                  variant="default"
                  className="h-13 px-8 text-base w-full sm:w-auto font-semibold bg-[#171717] hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-all shadow-md rounded-lg"
                >
                  <Link to="/login">アプリを使ってみる</Link>
                </Button>
                <Button
                  variant="outline"
                  className="h-13 px-8 text-base w-full sm:w-auto font-semibold shadow-border hover:bg-zinc-50 dark:hover:bg-zinc-900 border-none rounded-lg"
                  onClick={() => {
                    const el = document.getElementById("demo-section");
                    if (el != null) el.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  デモを見る
                </Button>
              </div>

              {/* デカ文字・社会的証明実績 */}
              <div className="mt-12 border-t border-zinc-100 dark:border-zinc-800 pt-8 grid grid-cols-2 gap-6 w-full max-w-md text-left">
                <div className="bg-[#fafafa] dark:bg-zinc-900/50 p-4 rounded-xl shadow-card">
                  <p className="text-3xl font-extrabold text-[#f97316] dark:text-orange-400 tracking-geist-h2 font-sans">
                    100%
                  </p>
                  <p className="text-xs text-[#666666] dark:text-zinc-400 mt-1 font-medium">
                    実パスワード不保持
                  </p>
                </div>
                <div className="bg-[#fafafa] dark:bg-zinc-900/50 p-4 rounded-xl shadow-card">
                  <p className="text-3xl font-extrabold text-[#f97316] dark:text-orange-400 tracking-geist-h2 font-sans">
                    E2E
                  </p>
                  <p className="text-xs text-[#666666] dark:text-zinc-400 mt-1 font-medium">
                    端末間暗号化セキュリティ
                  </p>
                </div>
              </div>
            </div>

            {/* 右側ビジュアル (画像A + フローティングカード) */}
            <div className="hidden md:flex md:col-span-6 relative w-full justify-center items-center">
              <div className="absolute w-[85%] h-[85%] rounded-full bg-orange-100/30 dark:bg-orange-500/5 blur-3xl z-0"></div>

              <div className="relative z-10 w-full max-w-md md:max-w-lg aspect-auto rounded-2xl overflow-hidden shadow-card border border-zinc-200/50 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/80 p-5 transition-transform duration-500 hover:scale-[1.01]">
                <img
                  src="/hero-image.png"
                  alt="ファミリーイラスト"
                  className="w-full h-full object-contain rounded-xl"
                />
              </div>

              {/* フローティングミニカード (奥行き感の創出) */}
              <div className="absolute bottom-[-15px] right-[10px] md:bottom-[-20px] md:right-[-10px] z-20 bg-white dark:bg-zinc-900 border border-orange-200/60 dark:border-orange-500/30 rounded-2xl p-4 shadow-xl max-w-[190px] hidden sm:block animate-bounce [animation-duration:5s]">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span className="text-[9px] font-bold font-mono text-zinc-500 dark:text-zinc-400 tracking-wider uppercase">
                    Netflix
                  </span>
                </div>
                <p className="text-[12px] font-bold text-zinc-800 dark:text-zinc-100">
                  共有アカウント
                </p>
                <div className="bg-orange-50 dark:bg-orange-950/40 text-[#f97316] dark:text-orange-400 text-[10px] font-semibold px-2 py-1 rounded-md mt-1.5 border border-orange-100/50 dark:border-orange-950/50">
                  ヒント: ポチの誕生日
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── ② PROBLEM SECTION ─── */}
        <section className="bg-zinc-50/50 dark:bg-zinc-900/10 py-16 md:py-32 border-y border-zinc-100 dark:border-zinc-800/80">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <div className="text-center max-w-xl mx-auto mb-12">
              <span className="text-xs font-bold text-orange-500 dark:text-orange-400 uppercase tracking-widest">
                我が家のあるある
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-geist-h1 mt-2 text-[#171717] dark:text-zinc-100">
                <JpText>こんな「パスワードどこだっけ？」ありませんか？</JpText>
              </h2>
            </div>

            {/* チャットUI */}
            <div className="w-full max-w-md mx-auto bg-[#7591b6] dark:bg-zinc-900/90 rounded-3xl overflow-hidden shadow-2xl border border-zinc-200/20">
              {/* トークルームヘッダー */}
              <div className="bg-[#7591b6]/95 dark:bg-zinc-900/95 backdrop-blur-md border-b border-[#637d9e] dark:border-zinc-800 px-5 py-3.5 flex items-center justify-between text-white">
                <div className="flex items-center gap-2.5">
                  <span className="font-bold text-sm tracking-geist-ui">
                    家族トーク
                  </span>
                  <span className="text-[10px] bg-white/20 dark:bg-zinc-800 px-2 py-0.5 rounded-full font-bold">
                    3
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-emerald-400 font-semibold">
                    オンライン
                  </span>
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                </div>
              </div>

              {/* トーク内容 */}
              <div className="p-4 md:p-6 space-y-6 text-left h-[330px] overflow-y-auto no-scrollbar flex flex-col justify-end">
                {/* ママからの発信 */}
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center text-xs font-bold text-pink-600 dark:text-pink-400 shrink-0 shadow-sm border border-pink-200/30">
                    ママ
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-white/80 dark:text-zinc-400 ml-1">
                      ママ
                    </span>
                    <div className="bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 text-[13px] md:text-[14px] px-3.5 py-2.5 rounded-2xl rounded-tl-none shadow-sm max-w-[240px] leading-relaxed relative">
                      お父さん、アマプラのパスワード変えた？
                      ログインできないんだけど。
                    </div>
                  </div>
                </div>

                {/* パパの返信 */}
                <div className="flex items-start gap-3 justify-end">
                  <div className="flex flex-col gap-0.5 items-end">
                    <span className="text-[10px] text-white/80 dark:text-zinc-400 mr-1">
                      パパ
                    </span>
                    <div className="bg-[#06c755] text-white text-[13px] md:text-[14px] px-3.5 py-2.5 rounded-2xl rounded-tr-none shadow-sm max-w-[240px] leading-relaxed relative">
                      あれ？変えてないよ。メモした紙どこにやったっけな…
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-xs font-bold text-teal-600 dark:text-teal-400 shrink-0 shadow-sm border border-teal-200/30">
                    パパ
                  </div>
                </div>

                {/* おじいちゃんの割り込み */}
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-xs font-bold text-amber-600 dark:text-amber-400 shrink-0 shadow-sm border border-amber-200/30">
                    祖父
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-white/80 dark:text-zinc-400 ml-1">
                      おじいちゃん
                    </span>
                    <div className="bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 text-[13px] md:text-[14px] px-3.5 py-2.5 rounded-2xl rounded-tl-none shadow-sm max-w-[240px] leading-relaxed relative">
                      ルーターの裏のやつじゃダメなのか？
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <JpText
              as="p"
              className="text-center text-[#666666] dark:text-zinc-400 text-sm mt-8 max-w-lg mx-auto leading-relaxed"
            >
              デリケートなパスワードをLINEやメモ用紙でやり取りするのは、紛失や誤送信のリスクが高く危険です。PoohMaがあれば、紙も危険なテキスト送信も不要になります。
            </JpText>
          </div>
        </section>

        {/* ─── ③ CORE VALUE SECTION ─── */}
        <section
          id="features"
          className="py-16 md:py-32 bg-white dark:bg-zinc-950"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-xl mx-auto mb-16 px-1">
              <span className="text-xs font-bold text-orange-500 dark:text-orange-400 uppercase tracking-widest">
                主な特徴
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-geist-h1 mt-2 text-[#171717] dark:text-zinc-100">
                <JpText>家族みんなが安心して使える3つの理由</JpText>
              </h2>
            </div>

            <div className="w-full max-w-4xl mx-auto">
              {/* タブナビゲーション (モダンピルタブ) */}
              <div className="flex border border-zinc-200/50 dark:border-zinc-800 mb-10 p-1.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl max-w-md mx-auto shadow-inner">
                {["security", "easy", "free"].map((tab, idx) => (
                  <Button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2.5 text-center text-sm font-semibold rounded-lg transition-all border-none shadow-none cursor-pointer ${
                      activeTab === tab
                        ? "bg-white dark:bg-zinc-800 text-[#171717] dark:text-zinc-50 shadow-sm border border-zinc-200/30"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 bg-transparent hover:bg-zinc-100/50 dark:hover:bg-zinc-800/30"
                    }`}
                  >
                    {idx === 0
                      ? "安全に守る"
                      : idx === 1
                        ? "みんなで使う"
                        : "データエクスポート"}
                  </Button>
                ))}
              </div>

              {/* タブコンテンツ */}
              <div className="border border-zinc-200/60 dark:border-zinc-800 rounded-3xl p-5 sm:p-8 md:p-10 bg-white dark:bg-zinc-900/20 shadow-card min-h-[300px] flex flex-col md:flex-row gap-10 items-center justify-between transition-all duration-300 overflow-hidden">
                {activeTab === "security" && (
                  <>
                    <div className="space-y-5 max-w-md">
                      <div className="h-12 w-12 rounded-xl bg-orange-50 dark:bg-orange-500/10 text-[#f97316] dark:text-orange-400 flex items-center justify-center shadow-border">
                        <Lock className="h-6 w-6" />
                      </div>
                      <h3 className="text-xl sm:text-2xl font-bold tracking-geist-h2 text-[#171717] dark:text-zinc-100">
                        実パスワードを預からない「ヒント共有」
                      </h3>
                      <p className="text-[#4d4d4d] dark:text-zinc-400 text-sm md:text-base leading-relaxed">
                        サーバーに保存されるのは、家族にしか解けない「パスワードのヒント」だけ。もしデータベースが完全にハッキングされたとしても、実際のパスワードが流出することは物理的に不可能です。
                      </p>
                    </div>

                    {/* SVG機能アイコン: 安全/保護 */}
                    <div className="w-full max-w-[200px] md:w-64 aspect-square bg-[#fafafa] dark:bg-zinc-900/60 rounded-2xl border border-zinc-100 dark:border-zinc-800/80 flex flex-col items-center justify-center p-6 text-center shrink-0 shadow-sm mx-auto mt-6 md:mt-0">
                      <div className="w-32 h-32 text-[#f97316] dark:text-orange-400 flex items-center justify-center">
                        <svg
                          className="w-full h-full"
                          viewBox="0 0 100 100"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <title>安全にまもるアイコン</title>
                          <path
                            d="M50 12L80 24V50C80 70.8 67 86.4 50 90C33 86.4 20 70.8 20 50V24L50 12Z"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="currentColor"
                            fillOpacity="0.05"
                          />
                          <rect
                            x="38"
                            y="46"
                            width="24"
                            height="18"
                            rx="3"
                            stroke="currentColor"
                            strokeWidth="3"
                            fill="currentColor"
                            fillOpacity="0.1"
                          />
                          <path
                            d="M44 46V38C44 34.7 46.7 32 50 32C53.3 32 56 34.7 56 38V46"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                          <circle cx="50" cy="55" r="3" fill="currentColor" />
                        </svg>
                      </div>
                    </div>
                  </>
                )}

                {activeTab === "easy" && (
                  <>
                    <div className="space-y-5 max-w-md">
                      <div className="h-12 w-12 rounded-xl bg-orange-50 dark:bg-orange-500/10 text-[#f97316] dark:text-orange-400 flex items-center justify-center shadow-border">
                        <Users className="h-6 w-6" />
                      </div>
                      <h3 className="text-xl sm:text-2xl font-bold tracking-geist-h2 text-[#171717] dark:text-zinc-100">
                        Wikiのように家族全員でかんたん編集
                      </h3>
                      <p className="text-[#4d4d4d] dark:text-zinc-400 text-sm md:text-base leading-relaxed">
                        フォルダ作成や共有範囲の指定がボタン一つ。スマホ操作が苦手なおじいちゃんやおばあちゃんでも、アプリを開くだけで迷わず直感的に利用可能です。
                      </p>
                    </div>

                    {/* SVG機能アイコン: 簡単/家族 */}
                    <div className="w-full max-w-[200px] md:w-64 aspect-square bg-[#fafafa] dark:bg-zinc-900/60 rounded-2xl border border-zinc-100 dark:border-zinc-800/80 flex flex-col items-center justify-center p-6 text-center shrink-0 shadow-sm mx-auto mt-6 md:mt-0">
                      <div className="w-32 h-32 text-[#f97316] dark:text-orange-400 flex items-center justify-center">
                        <svg
                          className="w-full h-full"
                          viewBox="0 0 120 120"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <title>みんなでつかうアイコン</title>
                          <circle
                            cx="60"
                            cy="35"
                            r="14"
                            stroke="currentColor"
                            strokeWidth="3"
                            fill="currentColor"
                            fillOpacity="0.05"
                          />
                          <circle
                            cx="35"
                            cy="78"
                            r="14"
                            stroke="currentColor"
                            strokeWidth="3"
                            fill="currentColor"
                            fillOpacity="0.05"
                          />
                          <circle
                            cx="85"
                            cy="78"
                            r="14"
                            stroke="currentColor"
                            strokeWidth="3"
                            fill="currentColor"
                            fillOpacity="0.05"
                          />
                          <path
                            d="M50 45L40 68M70 45L80 68M49 78H71"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeDasharray="3 3"
                          />
                          <circle
                            cx="60"
                            cy="65"
                            r="8"
                            stroke="currentColor"
                            strokeWidth="3"
                            fill="currentColor"
                            fillOpacity="0.1"
                          />
                          <path
                            d="M60 73V83H65M60 79H63"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                        </svg>
                      </div>
                    </div>
                  </>
                )}

                {activeTab === "free" && (
                  <>
                    <div className="space-y-5 max-w-md">
                      <div className="h-12 w-12 rounded-xl bg-orange-50 dark:bg-orange-500/10 text-[#f97316] dark:text-orange-400 flex items-center justify-center shadow-border">
                        <Download className="h-6 w-6" />
                      </div>
                      <h3 className="text-xl sm:text-2xl font-bold tracking-geist-h2 text-[#171717] dark:text-zinc-100">
                        いつでもCSVエクスポート可能
                      </h3>
                      <p className="text-[#4d4d4d] dark:text-zinc-400 text-sm md:text-base leading-relaxed">
                        「サービスを解約したいけれどデータが残るのが不安」という心配は不要です。登録したすべてのデータはいつでも安全なCSV/プレーンテキストとして手元にエクスポートして退会できます。
                      </p>
                    </div>

                    {/* SVG機能アイコン: 自由/エクスポート */}
                    <div className="w-full max-w-[200px] md:w-64 aspect-square bg-[#fafafa] dark:bg-zinc-900/60 rounded-2xl border border-zinc-100 dark:border-zinc-800/80 flex flex-col items-center justify-center p-6 text-center shrink-0 shadow-sm mx-auto mt-6 md:mt-0">
                      <div className="w-32 h-32 text-[#f97316] dark:text-orange-400 flex items-center justify-center">
                        <svg
                          className="w-full h-full"
                          viewBox="0 0 120 120"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <title>いつでもやめられるアイコン</title>
                          <rect
                            x="25"
                            y="35"
                            width="70"
                            height="55"
                            rx="6"
                            stroke="currentColor"
                            strokeWidth="3"
                            fill="currentColor"
                            fillOpacity="0.05"
                          />
                          <path
                            d="M75 55L90 40M90 40H78M90 40V52"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <rect
                            x="42"
                            y="55"
                            width="22"
                            height="16"
                            rx="2"
                            stroke="currentColor"
                            strokeWidth="3"
                            fill="currentColor"
                            fillOpacity="0.1"
                          />
                          <path
                            d="M47 55V48C47 43.5 50.5 41 53.5 42C56.5 43 57 46.5 57 48"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                        </svg>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ─── ④ ACTUAL SCREEN SECTION ─── */}
        <section
          id="demo-section"
          className="bg-[#fffbeb] dark:bg-[#1a160d] py-16 md:py-32 border-y border-amber-100 dark:border-amber-900/20"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col items-center">
            <div className="text-center max-w-xl mx-auto mb-16">
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">
                操作デモ
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-geist-h1 mt-2 text-zinc-900 dark:text-zinc-100">
                <JpText>覚えるのはパスワードではなく「ヒント」だけ</JpText>
              </h2>
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                実際のアプリが動作するステップをリアルタイムに体験してください。
              </p>
            </div>

            {/* スマートフォンモックアップ */}
            <div className="w-full max-w-[300px] aspect-[9/19.5] bg-zinc-950 dark:bg-zinc-900 rounded-[46px] p-3 border-[8px] border-zinc-800 dark:border-zinc-700 shadow-2xl relative overflow-hidden transition-all duration-300">
              {/* iPhoneスピーカー・ダイナミックアイランド */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-5 bg-zinc-850 rounded-full z-30 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-900 mr-2"></div>
                <div className="w-10 h-1 bg-zinc-900 rounded-full"></div>
              </div>

              {/* スクリーン内部 */}
              <div className="w-full h-full bg-white dark:bg-zinc-950 rounded-[36px] overflow-hidden relative flex flex-col pt-8 text-left text-zinc-800 dark:text-zinc-100 select-none">
                {/* アプリケーションヘッダー */}
                <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-900 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-xs flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <img
                      src="/poohma_icon.png"
                      alt="PoohMa"
                      className="h-5 w-5 object-contain"
                    />
                    <span className="font-bold text-xs tracking-geist-ui font-sans">
                      PoohMa
                    </span>
                  </div>
                  <span className="text-[9px] bg-orange-50 dark:bg-orange-950/40 text-[#f97316] dark:text-orange-400 px-1.5 py-0.5 rounded font-semibold border border-orange-100/30">
                    ファミリー
                  </span>
                </div>

                {/* スクリーン内部コンテンツ */}
                <div className="flex-1 p-3 overflow-hidden relative">
                  {/* ステップ0 & 1: アカウント一覧画面 */}
                  {(demoStep === 0 || demoStep === 1) && (
                    <div className="space-y-3 transition-opacity duration-300">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-3 w-3 text-zinc-400" />
                        <div className="w-full bg-zinc-50 dark:bg-zinc-900 text-[10px] pl-7 pr-3 py-2 rounded-lg border border-zinc-200/50 dark:border-zinc-800 text-zinc-400 font-medium">
                          サービスを検索...
                        </div>
                      </div>

                      <div className="text-[10px] font-bold text-zinc-400 tracking-wider uppercase mt-3 pl-1">
                        アカウント一覧
                      </div>

                      <div className="space-y-1.5">
                        {/* Netflixアイテム */}
                        <div
                          className={`p-2.5 rounded-xl border flex items-center justify-between transition-all duration-300 ${
                            demoStep === 1
                              ? "bg-orange-50/60 dark:bg-orange-950/30 border-orange-200 dark:border-orange-500/40 scale-[0.98]"
                              : "bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800/80 shadow-xs"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-red-100 dark:bg-red-950 flex items-center justify-center text-[10px] font-extrabold text-red-600">
                              N
                            </div>
                            <div>
                              <div className="text-[11px] font-bold">
                                Netflix
                              </div>
                              <div className="text-[8px] text-zinc-400">
                                family@example.com
                              </div>
                            </div>
                          </div>
                          <span className="text-[8px] text-[#f97316] font-semibold bg-orange-50 dark:bg-orange-950/30 px-1.5 py-0.5 rounded">
                            ヒントあり
                          </span>
                        </div>

                        {/* 他のアカウント */}
                        <div className="p-2.5 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between opacity-60">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-[10px] font-extrabold text-blue-600">
                              A
                            </div>
                            <div>
                              <div className="text-[11px] font-bold">
                                Amazon Prime
                              </div>
                              <div className="text-[8px] text-zinc-400">
                                family@example.com
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="p-2.5 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between opacity-60">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-[10px] font-extrabold text-emerald-600">
                              W
                            </div>
                            <div>
                              <div className="text-[11px] font-bold">
                                Family Wi-Fi
                              </div>
                              <div className="text-[8px] text-zinc-400">
                                Router-5G-1024
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* モッククリックカーソル */}
                      {demoStep === 1 && (
                        <div className="absolute right-12 bottom-16 w-6 h-6 rounded-full bg-orange-500/30 border border-orange-500/80 flex items-center justify-center z-40 animate-ping">
                          <div className="w-2.5 h-2.5 rounded-full bg-orange-500"></div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ステップ2: フェード遷移中 */}
                  {demoStep === 2 && (
                    <div className="w-full h-full flex flex-col items-center justify-center transition-all duration-300">
                      <div className="w-7 h-7 rounded-full border-2 border-orange-500 border-t-transparent animate-spin"></div>
                    </div>
                  )}

                  {/* ステップ3 & 4: アカウント詳細/ヒント公開画面 */}
                  {(demoStep === 3 || demoStep === 4) && (
                    <div className="space-y-4 h-full flex flex-col justify-between pb-1 transition-opacity duration-300">
                      <div className="space-y-3.5">
                        {/* 戻るボタン風 */}
                        <div className="text-[9px] text-zinc-400 font-bold flex items-center gap-1 cursor-pointer">
                          <span>←</span> 戻る
                        </div>

                        {/* Netflixメイン情報 */}
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950 flex items-center justify-center text-sm font-black text-red-600 shadow-sm border border-red-200/20">
                            N
                          </div>
                          <div>
                            <h4 className="text-sm font-extrabold">Netflix</h4>
                            <p className="text-[9px] text-[#666666] dark:text-zinc-400">
                              共有アカウント情報
                            </p>
                          </div>
                        </div>

                        {/* ログイン情報 */}
                        <div className="space-y-2 border border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/20 p-2.5 rounded-xl">
                          <div>
                            <span className="block text-[8px] font-bold text-zinc-400 tracking-wider">
                              メールアドレス
                            </span>
                            <div className="text-[10.5px] font-semibold mt-0.5">
                              family@example.com
                            </div>
                          </div>
                          <div className="border-t border-zinc-100 dark:border-zinc-900 pt-1.5">
                            <span className="block text-[8px] font-bold text-zinc-400 tracking-wider">
                              パスワード
                            </span>
                            <div className="text-[10.5px] font-mono tracking-widest text-zinc-400 mt-0.5">
                              ••••••••••••
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* スライドアップするヒントカード */}
                      <div className="bg-[#fafafa] dark:bg-zinc-900 border border-orange-200 dark:border-orange-500/40 rounded-xl p-3 shadow-card transform translate-y-0 transition-transform duration-500 ease-out z-20">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="text-[8px] font-bold bg-[#f97316] text-white px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
                            ヒント
                          </span>
                          <span className="text-[9px] text-zinc-400 font-medium">
                            ※ パスワードは預かっていません
                          </span>
                        </div>

                        <p className="text-[12px] font-extrabold text-[#171717] dark:text-zinc-100 py-1 bg-white dark:bg-zinc-950 px-2 rounded-md border border-zinc-100 dark:border-zinc-800 shadow-inner">
                          ポチの誕生日 ＋ いつもの4桁
                        </p>

                        <button
                          type="button"
                          className={`mt-2.5 w-full py-1.5 text-[9px] font-extrabold rounded-md border-none flex items-center justify-center gap-1 transition-all ${
                            demoStep === 4
                              ? "bg-emerald-500 text-white shadow-sm"
                              : "bg-[#171717] hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                          }`}
                        >
                          {demoStep === 4 ? (
                            <>
                              <Check className="w-2.5 h-2.5" /> コピー完了！
                            </>
                          ) : (
                            <>
                              <Copy className="w-2.5 h-2.5" /> ヒントをコピー
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── ⑤ SECURITY SECTION ─── */}
        <section
          id="security"
          className="py-16 md:py-32 bg-white dark:bg-zinc-950"
        >
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <span className="text-xs font-bold text-orange-500 dark:text-orange-400 uppercase tracking-widest">
                高い安全性
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-geist-h1 mt-2 text-[#171717] dark:text-zinc-100">
                <JpText>
                  開発チームであっても、あなたのパスワードを絶対に見られません
                </JpText>
              </h2>
            </div>

            {/* パスワード不保持の強力な宣言 */}
            <div className="mb-14 bg-orange-50/50 dark:bg-orange-500/5 border border-orange-200/50 dark:border-orange-500/20 rounded-2xl p-5 sm:p-6 md:p-8 text-center max-w-3xl mx-auto overflow-hidden">
              <h3 className="text-lg sm:text-xl font-extrabold text-[#f97316] dark:text-orange-400 tracking-geist-h2 mb-2">
                <JpText>「私たちは実パスワードを1文字も預かりません」</JpText>
              </h3>
              <JpText
                as="p"
                className="text-sm text-[#4d4d4d] dark:text-zinc-400 leading-relaxed max-w-xl mx-auto"
              >
                暗号化技術により、すべてのパスワードヒントはあなたのスマホ内でロックされ、サーバーには完全に判読不能な状態で保管されます。鍵を持っているのは家族だけです。
              </JpText>
            </div>

            {/* Vercelワークフロー流の3ステップ図解 */}
            <div className="border border-zinc-200/60 dark:border-zinc-800 bg-[#fafafa]/50 dark:bg-zinc-900/10 rounded-3xl p-8 md:p-12 shadow-inner relative overflow-hidden">
              {/* ステップ接続用のアニメーションSVGグラデーションライン */}
              <div className="absolute top-[88px] left-[15%] w-[70%] h-1 hidden md:block z-0 overflow-hidden">
                <svg
                  className="w-full h-full"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <title>データフローライン</title>
                  <path
                    d="M 0,2 H 800"
                    stroke="url(#flow-gradient)"
                    strokeWidth="3"
                    strokeDasharray="10 8"
                    className="animate-border-flow"
                  />
                  <defs>
                    <linearGradient
                      id="flow-gradient"
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="0"
                    >
                      <stop offset="0%" stopColor="#f97316" />
                      <stop offset="50%" stopColor="#de1d8d" />
                      <stop offset="100%" stopColor="#0a72ef" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10 relative z-10">
                {/* ステップ1 */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800 rounded-2xl p-6 relative flex flex-col items-center text-center shadow-sm">
                  <div className="absolute -top-4 left-6 bg-[#171717] dark:bg-zinc-100 text-white dark:text-zinc-900 font-mono text-xs w-7 h-7 rounded-full flex items-center justify-center font-bold shadow-md">
                    1
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-orange-50 dark:bg-orange-500/10 text-[#f97316] dark:text-orange-400 flex items-center justify-center mb-4 shadow-border">
                    <Lock className="h-6 w-6" />
                  </div>
                  <h4 className="text-base font-extrabold mb-2 tracking-geist-ui">
                    手元で自動ロック
                  </h4>
                  <JpText
                    as="p"
                    className="text-xs text-[#666666] dark:text-zinc-400 leading-relaxed"
                  >
                    インターネットに出る前に、ご家族だけの端末鍵（E2E暗号化）で完全に鍵が掛けられます。
                  </JpText>
                </div>

                {/* モバイル向け矢印コネクター */}
                <div className="flex md:hidden justify-center my-1 text-[#f97316]/50 dark:text-orange-400/30 animate-pulse">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="3"
                  >
                    <title>次のステップへ</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 13l-7 7-7-7"
                    />
                  </svg>
                </div>

                {/* ステップ2 */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800 rounded-2xl p-6 relative flex flex-col items-center text-center shadow-sm">
                  <div className="absolute -top-4 left-6 bg-[#171717] dark:bg-zinc-100 text-white dark:text-zinc-900 font-mono text-xs w-7 h-7 rounded-full flex items-center justify-center font-bold shadow-md">
                    2
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-orange-50 dark:bg-orange-500/10 text-[#f97316] dark:text-orange-400 flex items-center justify-center mb-4 shadow-border">
                    <Globe className="h-6 w-6" />
                  </div>
                  <h4 className="text-base font-extrabold mb-2 tracking-geist-ui">
                    暗号化のまま安全通信
                  </h4>
                  <JpText
                    as="p"
                    className="text-xs text-[#666666] dark:text-zinc-400 leading-relaxed"
                  >
                    頑丈なデジタル金庫に守られた状態で通信経路を通るため、途中でハッキングされても解読は不可能です。
                  </JpText>
                </div>

                {/* モバイル向け矢印コネクター */}
                <div className="flex md:hidden justify-center my-1 text-[#f97316]/50 dark:text-orange-400/30 animate-pulse">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="3"
                  >
                    <title>次のステップへ</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 13l-7 7-7-7"
                    />
                  </svg>
                </div>

                {/* ステップ3 */}
                <div className="bg-white dark:bg-zinc-900 border border-orange-200/60 dark:border-orange-500/30 rounded-2xl p-6 relative flex flex-col items-center text-center ring-2 ring-orange-500/10 dark:ring-orange-500/5 shadow-md">
                  <div className="absolute -top-4 left-6 bg-[#f97316] text-white font-mono text-xs w-7 h-7 rounded-full flex items-center justify-center font-bold shadow-md">
                    3
                  </div>

                  {/* 生成したお手上げ管理人クマ画像 */}
                  <div className="h-16 w-16 rounded-full bg-orange-50 dark:bg-zinc-800 border border-orange-100 dark:border-zinc-700 flex items-center justify-center mb-3 overflow-hidden shadow-sm relative transition-all duration-300 hover:scale-105">
                    <img
                      src="/manager_bear.png"
                      alt="管理人クマ"
                      className="w-full h-full object-cover scale-110"
                    />
                  </div>

                  <h4 className="text-base font-extrabold mb-2 tracking-geist-ui text-[#f97316] dark:text-orange-400">
                    サーバー保管
                  </h4>
                  <p className="text-xs text-[#666666] dark:text-zinc-400 leading-relaxed">
                    <JpText>カギは家族のスマホ内にのみ保管されるため、</JpText>
                    <strong className="font-extrabold">
                      <JpText>
                        開発チームであっても中身を開けられません。
                      </JpText>
                    </strong>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── ⑥ FAQ / CTA SECTION ─── */}
        <section
          id="faq"
          className="bg-zinc-50 dark:bg-zinc-900/20 py-16 md:py-32 border-t border-zinc-100 dark:border-zinc-850"
        >
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-xl mx-auto mb-16">
              <span className="text-xs font-bold text-orange-500 dark:text-orange-400 uppercase tracking-widest">
                よくある質問
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-geist-h1 mt-2 text-[#171717] dark:text-zinc-100">
                よくある質問
              </h2>
            </div>

            {/* 精緻なFAQアコーディオン */}
            <div className="space-y-4 bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800 rounded-3xl p-4 sm:p-5 md:p-6 shadow-card transition-all overflow-hidden">
              {[
                {
                  q: "パスワードを教え合うのが心配です。",
                  a: "大丈夫です。\nPoohMaは「家族にだけ伝わる絶妙なヒント」を登録・共有する全く新しい仕組みです。\n「実パスワードそのもの」を入力・共有することは一切ありません。",
                },
                {
                  q: "月額料金や追加費用はかかりますか？",
                  a: "基本的な家族アカウント管理・共有機能はすべて無料でご利用いただけます。現状の共有機能で費用が発生することはございません。",
                },
                {
                  q: "スマホを紛失した場合はどうなりますか？",
                  a: "アカウントは端末に紐づいておらず、Googleアカウントにのみ紐づいていますので、端末復旧後に改めて同じGoogleアカウントでログインいただければ、引き続きデータにアクセスすることができます。",
                },
              ].map((item, index) => (
                <div
                  key={item.q}
                  className="border-b border-zinc-100 dark:border-zinc-800/80 last:border-0 pb-4 last:pb-0 pt-4 first:pt-0"
                >
                  <Button
                    type="button"
                    className="flex w-full items-center justify-between font-bold text-left text-sm md:text-base py-2 bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/40 border-none shadow-none text-zinc-900 dark:text-zinc-100 focus-visible:ring-0 cursor-pointer"
                    onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className={`h-4.5 w-4.5 text-zinc-400 transition-transform duration-300 ${
                        openFaq === index
                          ? "transform rotate-180 text-[#f97316] dark:text-orange-400"
                          : ""
                      }`}
                    />
                  </Button>

                  {openFaq === index && (
                    <div className="mt-3 text-[#4d4d4d] dark:text-zinc-400 text-xs md:text-sm leading-relaxed pl-1 pb-1 transition-all duration-300">
                      <JpText>{item.a}</JpText>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ボトムCTAカード (ブランドカラーの「点」の運用) */}
            <div className="mt-16 md:mt-20 text-center bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800 rounded-3xl px-5 py-10 md:p-16 shadow-card relative overflow-hidden transition-all duration-300 hover:shadow-card-hover">
              {/* 装飾グラデーションバブル */}
              <div className="absolute -right-12 -top-12 w-32 h-32 bg-orange-500/10 dark:bg-orange-500/5 rounded-full blur-2xl z-0"></div>
              <div className="absolute -left-12 -bottom-12 w-32 h-32 bg-emerald-500/5 dark:bg-emerald-500/2 rounded-full blur-2xl z-0"></div>

              <div className="relative z-10 space-y-6">
                <h3 className="text-xl sm:text-3xl md:text-4xl font-extrabold tracking-geist-hero text-[#171717] dark:text-zinc-100 leading-tight">
                  <JpText>さあ、家族のパスワードメモ用紙を、</JpText>
                  <br />
                  <JpText>今すぐ無くそう。</JpText>
                </h3>
                <JpText
                  as="p"
                  className="text-[#666666] dark:text-zinc-400 text-sm md:text-base mt-4 max-w-md mx-auto leading-relaxed"
                >
                  初期設定はわずか1分。招待コードを家族に送るだけで、安全で穏やかな日常が始まります。
                </JpText>

                <div className="mt-10 max-w-sm mx-auto">
                  <Button
                    variant="default"
                    className="w-full h-13 text-base font-bold shadow-md bg-[#f97316] hover:bg-orange-600 text-white dark:bg-orange-500 dark:hover:bg-orange-600 border-none rounded-lg transition-transform hover:scale-[1.02]"
                  >
                    <Link to="/login">無料で利用を開始する</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
