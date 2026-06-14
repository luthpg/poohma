import { SiGithub } from "@icons-pack/react-simple-icons";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  Database,
  EyeOff,
  Folder,
  Globe,
  Laptop,
  Lock,
  Share2,
  Shield,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  // FAQのアコーディオン状態管理
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-background font-sans text-foreground selection:bg-neutral-100 selection:text-foreground">
      {/* ナビゲーション */}
      <nav className="sticky top-0 z-50 w-full flex items-center justify-between px-6 py-4 md:px-12 backdrop-blur-md bg-white/80 dark:bg-[#0c0a09]/80 shadow-border">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-white font-bold text-lg shadow-sm">
            P
          </div>
          <span className="text-xl font-bold tracking-geist-h2 text-foreground">
            PoohMa
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            to="/login"
            className="rounded-md bg-white dark:bg-[#171717] px-4 py-1.5 text-sm font-medium transition hover:bg-neutral-50 dark:hover:bg-neutral-800 shadow-border text-foreground tracking-geist-ui"
          >
            ログイン
          </Link>
        </div>
      </nav>

      {/* ① ヒーローセクション (Hero) */}
      <header className="relative overflow-hidden px-6 pt-24 pb-20 md:pt-36 md:pb-32 max-w-7xl mx-auto">
        <div className="grid gap-16 lg:grid-cols-12 lg:items-center">
          {/* 左側：キャッチコピーとCTA */}
          <div className="lg:col-span-7 flex flex-col items-start text-left z-10">
            <Badge className="mb-6 bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-950/30 dark:text-orange-400 border-none px-3 py-1 font-medium tracking-geist-ui rounded-full">
              セキュリティを、もっと温かく、シンプルに
            </Badge>
            <h1 className="text-[40px] font-semibold leading-[1.1] tracking-geist-hero md:text-[64px] text-foreground text-left max-w-2xl">
              家族のパスワード、
              <br />
              <span className="text-orange-500">LINEで送るのをやめよう。</span>
            </h1>
            <p className="mt-8 text-[18px] md:text-[20px] leading-[1.6] text-muted-foreground max-w-xl">
              パスワードそのものではなく、我が家だけの「ヒント」を最高峰の暗号化でスマートに共有。1Passwordは難しすぎるパートナーや家族に最適です。
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#171717] dark:bg-white text-white dark:text-[#171717] px-8 py-4 text-[16px] font-medium transition hover:opacity-90 shadow-md w-full sm:w-auto text-center"
              >
                <span className="text-orange-500 font-bold">
                  Googleアカウント
                </span>
                <span>で1秒登録</span>
              </Link>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground tracking-geist-ui">
              <Check className="h-4 w-4 text-orange-500" />
              <span>初期設定不要</span>
              <span className="text-neutral-300 dark:text-neutral-700">|</span>
              <Check className="h-4 w-4 text-orange-500" />
              <span>完全無料</span>
            </div>
          </div>

          {/* 右側：デバイスモックアップ (HTML/CSS) */}
          <div className="lg:col-span-5 relative flex justify-center lg:justify-end">
            {/* 装飾用のバックグラウンドグラデーションウォッシュ */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-gradient-to-tr from-orange-400/20 to-amber-300/10 rounded-full blur-3xl -z-10" />

            {/* PC Mockup (MacBook Pro 風) */}
            <div className="w-full max-w-[500px] aspect-[16/10] bg-[#171717] dark:bg-[#262626] rounded-xl p-2.5 shadow-2xl relative border border-neutral-700/50">
              {/* インカメラ */}
              <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-neutral-900 rounded-full" />
              {/* 画面 */}
              <div className="w-full h-full bg-[#fafafa] dark:bg-[#121212] rounded-md overflow-hidden flex flex-row select-none">
                {/* サイドバー */}
                <div className="w-1/4 bg-[#f4f4f5] dark:bg-[#1a1919] p-2 flex flex-col gap-3 border-r border-neutral-200 dark:border-neutral-800">
                  <div className="flex items-center gap-1.5 px-1">
                    <div className="h-4 w-4 rounded bg-orange-500 flex items-center justify-center text-[10px] text-white font-bold">
                      P
                    </div>
                    <span className="text-[10px] font-bold text-foreground">
                      PoohMa
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="text-[8px] px-1.5 py-1 rounded bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 font-medium">
                      ホーム
                    </div>
                    <div className="text-[8px] px-1.5 py-1 text-muted-foreground hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded">
                      サービス一覧
                    </div>
                    <div className="text-[8px] px-1.5 py-1 text-muted-foreground hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded">
                      家族設定
                    </div>
                  </div>
                </div>
                {/* メインダッシュボード */}
                <div className="w-3/4 p-3 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-bold">ダッシュボード</div>
                    <div className="h-4 w-12 rounded bg-orange-500 text-white text-[8px] flex items-center justify-center font-medium">
                      + 新規登録
                    </div>
                  </div>

                  {/* カードグリッド */}
                  <div className="grid grid-cols-2 gap-2 overflow-y-auto max-h-[160px] no-scrollbar">
                    {/* Netflix カード */}
                    <div className="rounded-lg bg-white dark:bg-[#1e1e1e] p-2 shadow-card border-none flex flex-col gap-1.5">
                      <div className="flex items-center gap-1">
                        <div className="h-4 w-4 rounded bg-[#e50914] text-white font-bold text-[8px] flex items-center justify-center">
                          N
                        </div>
                        <div className="text-[8px] font-bold truncate">
                          Netflix
                        </div>
                      </div>
                      <div className="h-8 rounded bg-[#e50914] flex items-center justify-center text-[10px] text-white font-bold select-none shadow-sm">
                        NETFLIX
                      </div>
                      <div className="text-[7px] text-muted-foreground truncate">
                        動画配信サービス
                      </div>
                    </div>

                    {/* Amazon Prime カード */}
                    <div className="rounded-lg bg-white dark:bg-[#1e1e1e] p-2 shadow-card border-none flex flex-col gap-1.5">
                      <div className="flex items-center gap-1">
                        <div className="h-4 w-4 rounded bg-[#00a8e1] text-white font-bold text-[8px] flex items-center justify-center">
                          a
                        </div>
                        <div className="text-[8px] font-bold truncate">
                          Amazon Prime
                        </div>
                      </div>
                      <div className="h-8 rounded bg-[#1A232F] flex items-center justify-center text-[7px] text-white font-semibold select-none shadow-sm">
                        prime video
                      </div>
                      <div className="text-[7px] text-muted-foreground truncate">
                        配送・映画
                      </div>
                    </div>

                    {/* Spotify カード */}
                    <div className="rounded-lg bg-white dark:bg-[#1e1e1e] p-2 shadow-card border-none flex flex-col gap-1.5">
                      <div className="flex items-center gap-1">
                        <div className="h-4 w-4 rounded bg-[#1DB954] text-white font-bold text-[8px] flex items-center justify-center">
                          S
                        </div>
                        <div className="text-[8px] font-bold truncate">
                          Spotify
                        </div>
                      </div>
                      <div className="h-8 rounded bg-[#1DB954] flex items-center justify-center text-[8px] text-black font-bold select-none shadow-sm">
                        Spotify
                      </div>
                      <div className="text-[7px] text-muted-foreground truncate">
                        音楽ストリーミング
                      </div>
                    </div>

                    {/* Supermarket カード */}
                    <div className="rounded-lg bg-white dark:bg-[#1e1e1e] p-2 shadow-card border-none flex flex-col gap-1.5">
                      <div className="flex items-center gap-1">
                        <div className="h-4 w-4 rounded bg-orange-600 text-white font-bold text-[8px] flex items-center justify-center">
                          🛒
                        </div>
                        <div className="text-[8px] font-bold truncate">
                          コープスーパー
                        </div>
                      </div>
                      {/* 画像プレースホルダーとしてのスケルトン風コープ店舗イラスト */}
                      <div className="h-8 rounded bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shadow-sm relative overflow-hidden">
                        <div className="absolute top-1 left-2 h-2 w-10 bg-orange-500/20 rounded" />
                        <div className="absolute bottom-1 right-2 h-4 w-6 bg-emerald-500/30 rounded" />
                        <span className="text-[7px] text-muted-foreground">
                          Local Super
                        </span>
                      </div>
                      <div className="text-[7px] text-muted-foreground truncate">
                        ネットスーパー
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 重ね合わせるスマホ Mockup (iPhone風) */}
              <div className="absolute -bottom-6 left-2 sm:-left-6 md:-left-12 w-[130px] aspect-[9/19] bg-[#171717] dark:bg-[#262626] rounded-2xl p-1.5 shadow-2xl border border-neutral-700/50 flex flex-col z-20">
                {/* Dynamic Island */}
                <div className="w-8 h-2.5 bg-black rounded-full mx-auto mb-1 flex items-center justify-center" />
                {/* スマホ画面 */}
                <div className="flex-1 bg-white dark:bg-[#121212] rounded-xl overflow-hidden p-1.5 flex flex-col gap-2 select-none">
                  {/* アプリヘッダー */}
                  <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-1">
                    <span className="text-[7px] font-bold text-orange-500">
                      PoohMa
                    </span>
                    <span className="text-[6px] text-muted-foreground">
                      ファミリー
                    </span>
                  </div>
                  {/* カードリストのモバイル版 */}
                  <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[180px] no-scrollbar">
                    <div className="rounded border border-neutral-100 dark:border-neutral-800 p-1 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <div className="h-3 w-3 rounded-full bg-[#e50914] text-white flex items-center justify-center text-[5px] font-bold">
                          N
                        </div>
                        <span className="text-[6px] font-medium">Netflix</span>
                      </div>
                      <span className="text-[5px] bg-orange-500/10 text-orange-600 px-1 py-0.2 rounded font-semibold">
                        SHARED
                      </span>
                    </div>

                    <div className="rounded border border-neutral-100 dark:border-neutral-800 p-1 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <div className="h-3 w-3 rounded-full bg-[#00a8e1] text-white flex items-center justify-center text-[5px] font-bold">
                          a
                        </div>
                        <span className="text-[6px] font-medium">Amazon</span>
                      </div>
                      <span className="text-[5px] bg-orange-500/10 text-orange-600 px-1 py-0.2 rounded font-semibold">
                        SHARED
                      </span>
                    </div>

                    <div className="rounded border border-neutral-100 dark:border-neutral-800 p-1 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <div className="h-3 w-3 rounded-full bg-neutral-900 text-white flex items-center justify-center text-[5px] font-bold">
                          P
                        </div>
                        <span className="text-[6px] font-medium">
                          パパの銀行
                        </span>
                      </div>
                      <span className="text-[5px] bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 px-1 py-0.2 rounded font-semibold">
                        PRIVATE
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ② 課題提起セクション (Problem) */}
      <section className="bg-neutral-50 dark:bg-[#0c0a09] border-y border-border py-24 md:py-32">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16 md:mb-24">
            <Badge className="bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 border-none px-3 py-1 font-medium tracking-geist-ui rounded-full">
              PROBLEM
            </Badge>
            <h2 className="mt-4 text-[32px] md:text-[40px] font-semibold tracking-geist-h1">
              家族間アカウント共有の4大ストレス
            </h2>
            <p className="mt-4 text-[16px] md:text-[18px] text-muted-foreground">
              私たちは日常的にアカウントを共有していますが、その方法は危険で非効率です。
            </p>
          </div>

          <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
            {/* LINE風チャット画面モック */}
            <div className="lg:col-span-6 flex justify-center">
              <div className="w-full max-w-[340px] aspect-[9/18] bg-neutral-950 rounded-[36px] p-3 shadow-2xl relative border border-neutral-800">
                {/* Dynamic Island */}
                <div className="w-24 h-4 bg-black rounded-full mx-auto mb-3 flex items-center justify-center" />
                {/* LINEチャット画面 */}
                <div className="w-full h-[calc(100%-20px)] bg-[#7494c0] dark:bg-[#202731] rounded-[28px] overflow-hidden flex flex-col p-3 text-[12px]">
                  {/* ヘッダー */}
                  <div className="flex items-center justify-between text-white border-b border-white/10 pb-2 mb-2">
                    <span className="font-bold">家族のトーク</span>
                    <span className="text-[10px] opacity-75">メンバー 3</span>
                  </div>

                  {/* チャット履歴 */}
                  <div className="flex-1 flex flex-col gap-3 overflow-y-auto no-scrollbar justify-end">
                    {/* 左：パパ */}
                    <div className="flex items-start gap-2">
                      <div className="w-6 h-6 rounded-full bg-orange-300 flex items-center justify-center font-bold text-[10px] text-orange-950">
                        パ
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] text-white/70 mb-0.5">
                          パパ
                        </span>
                        <div className="bg-white text-neutral-900 rounded-lg p-2 max-w-[180px] shadow-sm relative after:content-[''] after:absolute after:top-2 after:-left-1.5 after:border-t-4 after:border-t-transparent after:border-r-6 after:border-r-white after:border-b-4 after:border-b-transparent">
                          ネトフリのパスワードなんだっけ？🤔
                        </div>
                      </div>
                    </div>

                    {/* 右：ママ */}
                    <div className="flex items-end gap-1 justify-end">
                      <span className="text-[8px] text-white/50 mb-1">
                        既読 11:42
                      </span>
                      <div className="bg-[#85e347] dark:bg-emerald-600 dark:text-white text-neutral-950 rounded-lg p-2 max-w-[180px] shadow-sm relative after:content-[''] after:absolute after:top-2 after:-right-1.5 after:border-t-4 after:border-t-transparent after:border-l-6 after:border-l-[#85e347] dark:after:border-l-emerald-600 after:border-b-4 after:border-b-transparent">
                        poohma_love_family1
                      </div>
                    </div>

                    {/* 左：パパ */}
                    <div className="flex items-start gap-2">
                      <div className="w-6 h-6 rounded-full bg-orange-300 flex items-center justify-center font-bold text-[10px] text-orange-950">
                        パ
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] text-white/70 mb-0.5">
                          パパ
                        </span>
                        <div className="bg-white text-neutral-900 rounded-lg p-2 max-w-[180px] shadow-sm relative after:content-[''] after:absolute after:top-2 after:-left-1.5 after:border-t-4 after:border-t-transparent after:border-r-6 after:border-r-white after:border-b-4 after:border-b-transparent">
                          ログインできない！😭
                        </div>
                      </div>
                    </div>

                    {/* 右：ママ */}
                    <div className="flex items-end gap-1 justify-end">
                      <span className="text-[8px] text-white/50 mb-1">
                        既読 11:43
                      </span>
                      <div className="bg-[#85e347] dark:bg-emerald-600 dark:text-white text-neutral-950 rounded-lg p-2 max-w-[180px] shadow-sm relative after:content-[''] after:absolute after:top-2 after:-right-1.5 after:border-t-4 after:border-t-transparent after:border-l-6 after:border-l-[#85e347] dark:after:border-l-emerald-600 after:border-b-4 after:border-b-transparent">
                        あ、最初のpは大文字のPね！
                      </div>
                    </div>
                  </div>

                  {/* 入力エリア */}
                  <div className="mt-2 bg-white/10 rounded-full h-7 flex items-center px-3 justify-between text-white/50 text-[10px]">
                    <span>メッセージを入力...</span>
                    <span>😊</span>
                  </div>
                </div>

                {/* アラートバルーン */}
                <div className="absolute -top-3 -right-2 sm:-right-6 bg-red-500 text-white rounded-lg p-2 text-[10px] font-semibold flex items-center gap-1 shadow-lg border border-red-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>パスワード丸見えで危険！</span>
                </div>
              </div>
            </div>

            {/* 右側：4大ストレスのカード */}
            <div className="lg:col-span-6 flex flex-col gap-4">
              <div className="p-6 rounded-lg bg-white dark:bg-[#171717] shadow-card flex gap-4">
                <div className="h-10 w-10 shrink-0 rounded-full bg-red-100 dark:bg-red-950/30 text-red-500 flex items-center justify-center font-bold text-lg">
                  1
                </div>
                <div>
                  <h3 className="font-semibold text-lg tracking-geist-h2">
                    「ねぇパスワードなんだっけ？」が毎回起きる
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    動画配信サービスやネットスーパーにログインするたび、毎回LINEや声で聞いていませんか？
                    そのたびに作業が中断されます。
                  </p>
                </div>
              </div>

              <div className="p-6 rounded-lg bg-white dark:bg-[#171717] shadow-card flex gap-4">
                <div className="h-10 w-10 shrink-0 rounded-full bg-red-100 dark:bg-red-950/30 text-red-500 flex items-center justify-center font-bold text-lg">
                  2
                </div>
                <div>
                  <h3 className="font-semibold text-lg tracking-geist-h2">
                    LINEやメモに残すセキュリティの不安
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    トーク履歴や冷蔵庫の紙メモにパスワードをそのまま書くのは、アカウント乗っ取りや外部への漏えいのリスクが常に付きまといます。
                  </p>
                </div>
              </div>

              <div className="p-6 rounded-lg bg-white dark:bg-[#171717] shadow-card flex gap-4">
                <div className="h-10 w-10 shrink-0 rounded-full bg-red-100 dark:bg-red-950/30 text-red-500 flex items-center justify-center font-bold text-lg">
                  3
                </div>
                <div>
                  <h3 className="font-semibold text-lg tracking-geist-h2">
                    1Password等は家族には難しすぎる
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    「本格的なパスワード管理ツールは、パートナーや親がめんどくさがって使ってくれない。」結局、元のLINEでの共有に戻ってしまいます。
                  </p>
                </div>
              </div>

              <div className="p-6 rounded-lg bg-white dark:bg-[#171717] shadow-card flex gap-4">
                <div className="h-10 w-10 shrink-0 rounded-full bg-red-100 dark:bg-red-950/30 text-red-500 flex items-center justify-center font-bold text-lg">
                  4
                </div>
                <div>
                  <h3 className="font-semibold text-lg tracking-geist-h2">
                    共通アカウントと個人アカウントの混在
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    「どれが家族全員で使うやつで、どれが自分だけのものか分からなくなる。」プライベートを守りながら共有する境界線が曖昧になります。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ③ 解決策の提示セクション (Solution) */}
      <section className="bg-white dark:bg-[#0c0a09] py-24 md:py-32 overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <Badge className="bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-950/30 dark:text-orange-400 border-none px-3 py-1 font-medium tracking-geist-ui rounded-full">
            SOLUTION
          </Badge>
          <h2 className="mt-4 text-[32px] md:text-[40px] font-semibold tracking-geist-h1 max-w-3xl mx-auto leading-tight">
            家族全員が迷わない、最も安全で、
            <br />
            最もシンプルなアカウントの居場所
          </h2>
          <p className="mt-6 text-[18px] text-muted-foreground max-w-xl mx-auto">
            PoohMa（プーマ）は、家族のパスワード管理のストレスを解消し、安全でクリーンなスペースを提供します。
          </p>

          {/* 盾・鍵・フォルダのビジュアル構成図 (HTML/CSS & Skeleton) */}
          <div className="mt-16 max-w-3xl mx-auto p-8 rounded-2xl bg-neutral-50 dark:bg-[#121212] shadow-card flex flex-col md:flex-row items-center justify-around gap-8 relative">
            {/* 左側：バラバラなデータ (吸い込まれる) */}
            <div className="flex flex-col gap-2 bg-white dark:bg-[#1a1a1a] p-4 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-800 z-10 w-44">
              <span className="text-[10px] font-semibold text-muted-foreground mb-1 block">
                散らばった情報
              </span>
              <div className="h-5 rounded bg-neutral-100 dark:bg-neutral-800 flex items-center px-2 text-[9px] gap-1">
                <span className="text-red-500">LINE:</span> 〇〇パスワード
              </div>
              <div className="h-5 rounded bg-neutral-100 dark:bg-neutral-800 flex items-center px-2 text-[9px] gap-1">
                <span className="text-yellow-600">メモ紙:</span> 冷蔵庫の付箋
              </div>
              <div className="h-5 rounded bg-neutral-100 dark:bg-neutral-800 flex items-center px-2 text-[9px] gap-1">
                <span className="text-blue-500">個人の脳内:</span> 合言葉
              </div>
            </div>

            {/* モバイル用移行矢印 (縦並び時) */}
            <div className="flex md:hidden flex-col items-center gap-1">
              <ArrowRight className="h-6 w-6 text-orange-500 animate-pulse rotate-90" />
              <span className="text-[9px] font-mono text-muted-foreground uppercase">
                Organize
              </span>
            </div>

            {/* 中央の移行矢印 */}
            <div className="hidden md:flex flex-col items-center gap-1">
              <ArrowRight className="h-6 w-6 text-orange-500 animate-pulse" />
              <span className="text-[9px] font-mono text-muted-foreground uppercase">
                Organize
              </span>
            </div>

            {/* 中央：オレンジフォルダ & 盾の抽象図 */}
            <div className="relative flex items-center justify-center w-36 h-36">
              {/* 光彩エフェクト */}
              <div className="absolute inset-0 bg-orange-400/20 rounded-full blur-2xl animate-pulse" />
              {/* フォルダ */}
              <Folder className="h-28 w-28 text-orange-500 fill-orange-500/10 drop-shadow-lg" />
              {/* 盾 */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/3 bg-white dark:bg-neutral-900 rounded-full p-2.5 shadow-lg border border-orange-500/20">
                <Shield className="h-8 w-8 text-orange-500 fill-orange-500/10" />
              </div>
            </div>

            {/* モバイル用移行矢印 (縦並び時) */}
            <div className="flex md:hidden flex-col items-center gap-1">
              <ArrowRight className="h-6 w-6 text-orange-500 animate-pulse rotate-90" />
              <span className="text-[9px] font-mono text-muted-foreground uppercase">
                Encrypt
              </span>
            </div>

            {/* 中央の移行矢印 */}
            <div className="hidden md:flex flex-col items-center gap-1">
              <ArrowRight className="h-6 w-6 text-orange-500 animate-pulse" />
              <span className="text-[9px] font-mono text-muted-foreground uppercase">
                Encrypt
              </span>
            </div>

            {/* 右側：整頓されたカードと暗号データ */}
            <div className="flex flex-col gap-2 bg-white dark:bg-[#1a1a1a] p-4 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-800 z-10 w-44">
              <span className="text-[10px] font-semibold text-muted-foreground mb-1 block">
                暗号化されたヒント
              </span>
              <div className="h-5 rounded bg-orange-50/80 dark:bg-orange-950/20 flex items-center justify-between px-2 text-[9px] text-orange-700 dark:text-orange-300 font-medium">
                <span>Netflixヒント</span>
                <Lock className="h-2.5 w-2.5" />
              </div>
              <div className="h-5 rounded bg-orange-50/80 dark:bg-orange-950/20 flex items-center justify-between px-2 text-[9px] text-orange-700 dark:text-orange-300 font-medium">
                <span>Amazonヒント</span>
                <Lock className="h-2.5 w-2.5" />
              </div>
              <div className="h-5 rounded bg-orange-50/80 dark:bg-orange-950/20 flex items-center justify-between px-2 text-[9px] text-orange-700 dark:text-orange-300 font-medium">
                <span>電気ガスヒント</span>
                <Lock className="h-2.5 w-2.5" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ④ 機能・推しポイント詳細セクション (Features) */}
      <section className="bg-neutral-50 dark:bg-[#0c0a09] border-y border-border py-24 md:py-32">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16 md:mb-24">
            <Badge className="bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-950/30 dark:text-orange-400 border-none px-3 py-1 font-medium tracking-geist-ui rounded-full">
              FEATURES
            </Badge>
            <h2 className="mt-4 text-[32px] md:text-[40px] font-semibold tracking-geist-h1">
              本気で使いやすさを追求した機能群
            </h2>
            <p className="mt-4 text-[16px] md:text-[18px] text-muted-foreground">
              直感的なUIと強力なセキュリティ。家族全員が快適に使える工夫を凝らしました。
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            {/* Feature 1 */}
            <div className="p-8 bg-white dark:bg-[#171717] rounded-xl shadow-card hover:shadow-card-hover transition-all flex flex-col justify-between">
              <div>
                <Badge className="bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 border-none rounded">
                  機能 1
                </Badge>
                <h3 className="mt-4 text-[24px] font-semibold tracking-geist-h2">
                  URLを入れるだけ。一目でわかるダッシュボード
                </h3>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  URLを入力した瞬間に、Webサービスのロゴや背景画像を自動で取得（OGPフェッチ）。文字だらけの無機質なリストではなく、直感的にどのサービスか見分けられます。タグによる絞り込みも爆速です。
                </p>
              </div>

              {/* ビジュアルモック */}
              <div className="mt-8 bg-neutral-50 dark:bg-[#1e1e1e] rounded-lg p-4 border border-neutral-100 dark:border-neutral-800">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] text-muted-foreground font-mono">
                      INPUT URL
                    </span>
                    <div className="h-8 rounded bg-white dark:bg-[#121212] border border-neutral-200 dark:border-neutral-800 flex items-center justify-between px-3 text-[10px]">
                      <span>https://netflix.com</span>
                      <Globe className="h-3.5 w-3.5 text-orange-500" />
                    </div>
                  </div>
                  <div className="flex items-center justify-center">
                    <ArrowRight className="h-4 w-4 text-orange-500 rotate-90 md:rotate-0" />
                  </div>
                  <div className="rounded-lg bg-white dark:bg-[#121212] p-3 shadow-sm flex items-center justify-between border border-orange-500/20">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded bg-[#e50914] text-white flex items-center justify-center font-bold text-sm">
                        N
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold">Netflix</span>
                        <span className="text-[8px] text-muted-foreground">
                          自動フェッチ完了
                        </span>
                      </div>
                    </div>
                    <Badge className="bg-orange-500/10 text-orange-600 text-[8px] border-none">
                      #動画
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="p-8 bg-white dark:bg-[#171717] rounded-xl shadow-card hover:shadow-card-hover transition-all flex flex-col justify-between">
              <div>
                <Badge className="bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 border-none rounded">
                  機能 2
                </Badge>
                <h3 className="mt-4 text-[24px] font-semibold tracking-geist-h2">
                  「家族専用」パスコードとE2EE（最高峰の安全）
                </h3>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  パスワードヒントは、家族間で決めたパスコードを使って、あなたの端末（ブラウザ）上で暗号化されてからクラウドへ送られます。サーバー側には暗号化された文字しか残らず、運営者すら覗くことはできません。
                </p>
              </div>

              {/* ビジュアルモック */}
              <div className="mt-8 bg-neutral-50 dark:bg-[#1e1e1e] rounded-lg p-4 border border-neutral-100 dark:border-neutral-800">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-around gap-2 text-[10px]">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[8px] text-muted-foreground">
                        プレーンテキスト
                      </span>
                      <div className="px-2 py-1 bg-white dark:bg-[#121212] rounded border font-mono">
                        私の秘密ヒント
                      </div>
                    </div>
                    <div className="flex flex-col items-center">
                      <Lock className="h-5 w-5 text-orange-500 animate-bounce" />
                      <span className="text-[7px] text-orange-600 font-semibold font-mono">
                        AES-GCM
                      </span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[8px] text-muted-foreground">
                        サーバー保存データ
                      </span>
                      <div className="px-2 py-1 bg-neutral-800 text-neutral-400 rounded font-mono text-[8px] max-w-[120px] truncate">
                        U2FsdGVkX19jG...
                      </div>
                    </div>
                  </div>
                  <div className="text-[9px] text-center text-muted-foreground bg-orange-50 dark:bg-orange-950/20 p-1.5 rounded text-orange-800 dark:text-orange-400 font-mono">
                    ※ サーバー管理者も暗号化前の文字は解読不可能です。
                  </div>
                </div>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="p-8 bg-white dark:bg-[#171717] rounded-xl shadow-card hover:shadow-card-hover transition-all flex flex-col justify-between">
              <div>
                <Badge className="bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 border-none rounded">
                  機能 3
                </Badge>
                <h3 className="mt-4 text-[24px] font-semibold tracking-geist-h2">
                  1つのサービスに、複数のアカウントを内包
                </h3>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  「Amazon（パパ用）」「Amazon（ママ用）」のように、サービスごとに異なるログインIDや異なるヒントを、「ラベル」付きでまとめて登録できます。「あれ、誰のアカウントだっけ？」問題を一瞬で解決。
                </p>
              </div>

              {/* ビジュアルモック */}
              <div className="mt-8 bg-neutral-50 dark:bg-[#1e1e1e] rounded-lg p-4 border border-neutral-100 dark:border-neutral-800">
                <div className="bg-white dark:bg-[#121212] rounded-lg p-3 shadow-sm border border-neutral-200 dark:border-neutral-800">
                  <div className="flex items-center gap-2 border-b dark:border-neutral-800 pb-2 mb-2">
                    <div className="h-6 w-6 rounded bg-neutral-900 text-white flex items-center justify-center font-bold text-xs">
                      a
                    </div>
                    <span className="text-[12px] font-bold">Amazon.co.jp</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between bg-neutral-50 dark:bg-[#1a1a1a] p-2 rounded">
                      <div className="flex flex-col text-[10px]">
                        <span className="font-semibold text-[9px] text-muted-foreground">
                          ID: papamail@...
                        </span>
                        <span className="font-mono text-orange-600 text-[8px]">
                          ヒント: 実家の犬の名前
                        </span>
                      </div>
                      <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[8px] border-none font-semibold">
                        パパ用
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between bg-neutral-50 dark:bg-[#1a1a1a] p-2 rounded">
                      <div className="flex flex-col text-[10px]">
                        <span className="font-semibold text-[9px] text-muted-foreground">
                          ID: mamamail@...
                        </span>
                        <span className="font-mono text-orange-600 text-[8px]">
                          ヒント: 初めて買った車の名前
                        </span>
                      </div>
                      <Badge className="bg-pink-500/10 text-pink-600 dark:text-pink-400 text-[8px] border-none font-semibold">
                        ママ用
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="p-8 bg-white dark:bg-[#171717] rounded-xl shadow-card hover:shadow-card-hover transition-all flex flex-col justify-between">
              <div>
                <Badge className="bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 border-none rounded">
                  機能 4
                </Badge>
                <h3 className="mt-4 text-[24px] font-semibold tracking-geist-h2">
                  プライベートとシェアのシームレスな切り替え
                </h3>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  「これは自分専用の仕事用銀行」「これは家族と共有するNetflix」を、スイッチひとつで切り替え可能。家族全員の共有スペースに表示するか、自分の端末のみに秘めておくかを自由に制御できます。
                </p>
              </div>

              {/* ビジュアルモック */}
              <div className="mt-8 bg-neutral-50 dark:bg-[#1e1e1e] rounded-lg p-4 border border-neutral-100 dark:border-neutral-800">
                <div className="flex items-center justify-around gap-4">
                  {/* スイッチ */}
                  <div className="flex flex-col items-center gap-2 bg-white dark:bg-[#121212] p-3 rounded-lg border dark:border-neutral-800 shadow-sm">
                    <span className="text-[8px] text-muted-foreground font-semibold">
                      公開ステータス
                    </span>
                    <div className="flex items-center gap-1.5 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-full cursor-pointer select-none">
                      <span className="text-[8px] px-2 py-0.5 rounded-full bg-orange-500 text-white font-bold">
                        SHARED
                      </span>
                      <span className="text-[8px] px-2 py-0.5 text-muted-foreground font-semibold">
                        PRIVATE
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    <ArrowRight className="h-4 w-4 text-orange-500" />
                  </div>
                  {/* フォルダ */}
                  <div className="flex flex-col items-center gap-1 bg-white dark:bg-[#121212] p-3 rounded-lg border dark:border-neutral-800 shadow-sm w-28">
                    <Folder className="h-10 w-10 text-orange-500 fill-orange-500/10" />
                    <span className="text-[8px] font-semibold text-center text-foreground">
                      ファミリー共有フォルダへ格納
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ⑤ テクニカル・セキュリティセクション (For Tech/Developers) */}
      <section className="bg-white dark:bg-[#0c0a09] py-24 md:py-32">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid gap-16 lg:grid-cols-12 lg:items-start">
            {/* 左側：説明 */}
            <div className="lg:col-span-5 flex flex-col items-start text-left">
              <Badge className="bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-950/30 dark:text-orange-400 border-none px-3 py-1 font-medium tracking-geist-ui rounded-full">
                FOR DEVELOPERS
              </Badge>
              <h2 className="mt-4 text-[32px] md:text-[40px] font-semibold tracking-geist-h1 leading-tight text-foreground">
                最高峰の安全性を、
                <br />
                技術で裏付ける
              </h2>
              <p className="mt-6 text-[16px] text-muted-foreground leading-relaxed">
                PoohMaは、ITエンジニアやセキュリティ意識の高い主導入者の方々に納得していただけるよう、堅牢なセキュリティアーキテクチャを開示しています。
              </p>

              <div className="mt-8 flex flex-wrap gap-2">
                <Badge className="bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 border-none px-2 py-1 rounded font-mono text-[10px]">
                  WebCrypto API (PBKDF2/AES-GCM) ●
                </Badge>
                <Badge className="bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 border-none px-2 py-1 rounded font-mono text-[10px]">
                  Client-side Encryption ●
                </Badge>
                <Badge className="bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 border-none px-2 py-1 rounded font-mono text-[10px]">
                  Server-side SSRF Prevention ●
                </Badge>
                <Badge className="bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 border-none px-2 py-1 rounded font-mono text-[10px]">
                  DNS Resolution & Dynamic IP Verification ●
                </Badge>
                <Badge className="bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 border-none px-2 py-1 rounded font-mono text-[10px]">
                  TanStack Start & Supabase & Firebase Auth ●
                </Badge>
              </div>
            </div>

            {/* 右側：フロー図 (HTML/CSS & Skeletons) */}
            <div className="lg:col-span-7 flex flex-col gap-8 w-full">
              {/* E2EE Flow */}
              <div className="p-6 rounded-xl bg-neutral-50 dark:bg-[#121212] shadow-card border border-neutral-100 dark:border-neutral-800 flex flex-col gap-4">
                <div className="flex items-center justify-between border-b dark:border-neutral-800 pb-2">
                  <h3 className="text-sm font-semibold tracking-geist-h2 font-mono flex items-center gap-1.5">
                    <Shield className="h-4 w-4 text-orange-500" />
                    <span>End-to-End Encryption (E2EE) Flow</span>
                  </h3>
                  <span className="text-[9px] bg-orange-500/10 text-orange-600 px-1.5 py-0.5 rounded font-mono font-semibold">
                    CLIENT SIDE
                  </span>
                </div>

                <div className="flex flex-col md:flex-row gap-4 items-stretch text-[10px] font-mono">
                  {/* Browser */}
                  <div className="flex-1 p-3 bg-white dark:bg-[#1a1a1a] rounded border border-orange-500/15 flex flex-col gap-2 relative">
                    <div className="absolute top-1 right-2 text-[8px] text-orange-500 font-semibold">
                      あなたの端末上 (Browser)
                    </div>
                    <div className="mt-2 flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 p-1.5 rounded">
                      <Laptop className="h-3.5 w-3.5" />
                      <span>パスコード入力</span>
                    </div>
                    <div className="h-0.5 bg-neutral-200 dark:bg-neutral-800 my-1" />
                    <div className="bg-orange-500/10 text-orange-700 dark:text-orange-400 p-1.5 rounded text-[8px] flex flex-col gap-1">
                      <span className="font-bold">WBKDF2</span>
                      <span>WebCrypto API / 鍵導出</span>
                    </div>
                    <div className="bg-orange-500/10 text-orange-700 dark:text-orange-400 p-1.5 rounded text-[8px] flex flex-col gap-1">
                      <span className="font-bold">AES-GCM (暗号化)</span>
                      <span>データヒント暗号化</span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="flex items-center justify-center font-bold text-neutral-300">
                    <ArrowRight className="h-6 w-6 text-neutral-400 rotate-90 md:rotate-0" />
                  </div>

                  {/* Server & DB */}
                  <div className="flex-1 flex flex-col gap-3">
                    <div className="p-3 bg-white dark:bg-[#1a1a1a] rounded border dark:border-neutral-800 flex items-center gap-2">
                      <Cpu className="h-5 w-5 text-neutral-400" />
                      <div className="flex flex-col">
                        <span className="font-bold text-[9px]">
                          PoohMaサーバー (Nitro)
                        </span>
                        <span className="text-[8px] text-muted-foreground">
                          暗号化済みの文字列を中継のみ
                        </span>
                      </div>
                    </div>
                    <div className="p-3 bg-white dark:bg-[#1a1a1a] rounded border border-emerald-500/15 flex items-center gap-2">
                      <Database className="h-5 w-5 text-emerald-500" />
                      <div className="flex flex-col">
                        <span className="font-bold text-[9px] text-emerald-600 dark:text-emerald-400">
                          Supabase (DB)
                        </span>
                        <span className="text-[8px] text-muted-foreground">
                          暗号化データのみ格納
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SSRF Prevention Flow */}
              <div className="p-6 rounded-xl bg-neutral-50 dark:bg-[#121212] shadow-card border border-neutral-100 dark:border-neutral-800 flex flex-col gap-4">
                <div className="flex items-center justify-between border-b dark:border-neutral-800 pb-2">
                  <h3 className="text-sm font-semibold tracking-geist-h2 font-mono flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 text-orange-500" />
                    <span>SSRF Prevention Flow (Server-Side)</span>
                  </h3>
                  <span className="text-[9px] bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 px-1.5 py-0.5 rounded font-mono font-semibold">
                    SERVER SIDE
                  </span>
                </div>

                <div className="flex flex-col gap-4 text-[10px] font-mono">
                  {/* SSRF シーケンス */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center text-center">
                    <div className="p-2 bg-white dark:bg-[#1a1a1a] rounded border dark:border-neutral-800">
                      <span className="block font-bold">1. 外部URL入力</span>
                      <span className="text-[8px] text-muted-foreground">
                        fetch要求
                      </span>
                    </div>
                    <div className="hidden md:block text-neutral-400">→</div>
                    <div className="p-2 bg-white dark:bg-[#1a1a1a] rounded border dark:border-neutral-800">
                      <span className="block font-bold">2. DNS動的解決</span>
                      <span className="text-[8px] text-muted-foreground">
                        IPの検証
                      </span>
                    </div>
                    <div className="hidden md:block text-neutral-400">→</div>
                    <div className="p-2 bg-white dark:bg-[#1a1a1a] rounded border border-orange-500/15">
                      <span className="block font-bold text-orange-600 dark:text-orange-400">
                        3. プライベートIP検証
                      </span>
                      <span className="text-[8px] text-muted-foreground">
                        ローカル検証
                      </span>
                    </div>
                    <div className="hidden md:block text-neutral-400">→</div>
                    <div className="p-2 bg-white dark:bg-[#1a1a1a] rounded border border-emerald-500/15">
                      <span className="block font-bold text-emerald-600 dark:text-emerald-400">
                        4. 完全ブロック
                      </span>
                      <span className="text-[8px] text-muted-foreground">
                        不正アクセス防止
                      </span>
                    </div>
                  </div>
                  <div className="bg-neutral-100 dark:bg-neutral-800 p-2 rounded text-[8px] text-muted-foreground leading-normal font-sans">
                    サーバー側でSSRF（Server-Side Request
                    Forgery）対策を徹底。DNS解決による動的IP検証を実施し、プライベートIPへの不正アクセスを完全ブロックします。
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ⑥ かんたん3ステップ (How It Works) */}
      <section className="bg-neutral-50 dark:bg-[#0c0a09] border-y border-border py-24 md:py-32">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <Badge className="bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-950/30 dark:text-orange-400 border-none px-3 py-1 font-medium tracking-geist-ui rounded-full">
            HOW IT WORKS
          </Badge>
          <h2 className="mt-4 text-[32px] md:text-[40px] font-semibold tracking-geist-h1">
            かんたん3ステップ
          </h2>
          <p className="mt-4 text-[16px] md:text-[18px] text-muted-foreground max-w-xl mx-auto">
            PoohMaを始めるのはとても簡単です。特別なアプリのインストールは不要で、ブラウザからすぐに利用可能です。
          </p>

          {/* 3連スマホUIモック */}
          <div className="mt-16 grid gap-8 md:grid-cols-3 max-w-5xl mx-auto">
            {/* Step 1 */}
            <div className="flex flex-col items-center">
              <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/10 text-[14px] font-bold text-orange-600 shadow-border">
                1
              </div>
              <h3 className="font-semibold text-lg tracking-geist-h2 mb-4">
                アカウント作成
              </h3>

              {/* スマホ画面モック */}
              <div className="w-full max-w-[240px] aspect-[9/18] bg-neutral-900 rounded-[28px] p-2 shadow-lg border dark:border-neutral-800 flex flex-col">
                <div className="w-16 h-2 bg-black rounded-full mx-auto mb-2" />
                <div className="flex-1 bg-white dark:bg-[#121212] rounded-xl p-3 flex flex-col justify-center gap-4 text-center">
                  <Folder className="h-10 w-10 text-orange-500 mx-auto fill-orange-500/10" />
                  <div className="text-[12px] font-bold">
                    PoohMa アカウント作成
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="h-7 rounded border dark:border-neutral-800 flex items-center justify-center gap-1.5 text-[8px] font-semibold bg-neutral-50 dark:bg-neutral-800/50 cursor-pointer hover:bg-neutral-100">
                      <span className="text-orange-500 font-bold">G</span>{" "}
                      Googleでサインイン
                    </div>
                    <div className="h-7 rounded border dark:border-neutral-800 flex items-center justify-center gap-1.5 text-[8px] font-semibold bg-neutral-50 dark:bg-neutral-800/50 cursor-pointer hover:bg-neutral-100">
                      Firebase Auth ログイン
                    </div>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-xs text-muted-foreground leading-normal max-w-[200px]">
                Googleアカウント等を利用して、1秒でアカウントを作成します。
              </p>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-center">
              <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/10 text-[14px] font-bold text-orange-600 shadow-border">
                2
              </div>
              <h3 className="font-semibold text-lg tracking-geist-h2 mb-4">
                家族グループ・パスコード設定
              </h3>

              {/* スマホ画面モック */}
              <div className="w-full max-w-[240px] aspect-[9/18] bg-neutral-900 rounded-[28px] p-2 shadow-lg border dark:border-neutral-800 flex flex-col">
                <div className="w-16 h-2 bg-black rounded-full mx-auto mb-2" />
                <div className="flex-1 bg-white dark:bg-[#121212] rounded-xl p-3 flex flex-col justify-between text-left">
                  <div className="flex flex-col gap-2">
                    <div className="text-[9px] font-bold">
                      家族グループの作成
                    </div>
                    <div className="p-2 bg-neutral-50 dark:bg-neutral-800/50 rounded flex justify-between items-center">
                      <span className="font-mono text-[8px] font-bold text-neutral-600 dark:text-neutral-400">
                        F4MILY-A1B2-C3D4
                      </span>
                      <Share2 className="h-3 w-3 text-orange-500 cursor-pointer" />
                    </div>
                    <p className="text-[7px] text-muted-foreground">
                      招待コードをパートナーに共有してください。
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="text-[9px] font-bold">
                      家族パスコードを設定
                    </div>
                    <div className="h-7 rounded border dark:border-neutral-800 flex items-center px-2 text-[8px] bg-neutral-50 dark:bg-neutral-800/50 justify-between">
                      <span>••••••••••••</span>
                      <Lock className="h-3 w-3 text-neutral-400" />
                    </div>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-xs text-muted-foreground leading-normal max-w-[200px]">
                家族コードを発行してパートナーを招待し、暗号化用の「家族共通パスコード」を設定します。
              </p>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center">
              <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/10 text-[14px] font-bold text-orange-600 shadow-border">
                3
              </div>
              <h3 className="font-semibold text-lg tracking-geist-h2 mb-4">
                アカウント情報を登録
              </h3>

              {/* スマホ画面モック */}
              <div className="w-full max-w-[240px] aspect-[9/18] bg-neutral-900 rounded-[28px] p-2 shadow-lg border dark:border-neutral-800 flex flex-col">
                <div className="w-16 h-2 bg-black rounded-full mx-auto mb-2" />
                <div className="flex-1 bg-white dark:bg-[#121212] rounded-xl p-3 flex flex-col justify-between text-left">
                  <div className="flex flex-col gap-2 overflow-y-auto no-scrollbar">
                    <div className="text-[9px] font-bold">アカウントの登録</div>

                    <div className="flex flex-col gap-0.5">
                      <span className="text-[7px] text-muted-foreground font-semibold">
                        URL
                      </span>
                      <div className="h-6 rounded border dark:border-neutral-800 flex items-center px-2 text-[7px] bg-neutral-50">
                        https://netflix.com
                      </div>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <span className="text-[7px] text-muted-foreground font-semibold">
                        タイトル
                      </span>
                      <div className="h-6 rounded border dark:border-neutral-800 flex items-center px-2 text-[7px] bg-neutral-50">
                        Netflix
                      </div>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <span className="text-[7px] text-muted-foreground font-semibold">
                        ログインID
                      </span>
                      <div className="h-6 rounded border dark:border-neutral-800 flex items-center px-2 text-[7px] bg-neutral-50">
                        netflix@family.com
                      </div>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <span className="text-[7px] text-muted-foreground font-semibold">
                        パスワードのヒント
                      </span>
                      <div className="h-6 rounded border dark:border-neutral-800 flex items-center px-2 text-[7px] bg-neutral-50 justify-between">
                        <span>実家で飼っていた猫の名前</span>
                        <EyeOff className="h-2.5 w-2.5 text-neutral-400" />
                      </div>
                    </div>
                  </div>

                  <div className="h-6 w-full rounded bg-orange-500 text-white text-[8px] flex items-center justify-center font-bold cursor-pointer hover:bg-orange-600 mt-2">
                    登録する
                  </div>
                </div>
              </div>
              <p className="mt-4 text-xs text-muted-foreground leading-normal max-w-[200px]">
                URLとログインID、パスワードの「ヒント」を入力して登録すれば、共有スペースにカードが現れます。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ⑦ よくある質問 (FAQ) */}
      <section className="bg-white dark:bg-[#0c0a09] py-24 md:py-32">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-16 md:mb-24">
            <Badge className="bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 border-none px-3 py-1 font-medium tracking-geist-ui rounded-full">
              FAQ
            </Badge>
            <h2 className="mt-4 text-[32px] md:text-[40px] font-semibold tracking-geist-h1">
              よくある質問
            </h2>
          </div>

          <div className="flex flex-col gap-4">
            {[
              {
                q: "パスワードそのものを保存するのは怖いのですが？",
                a: "PoohMaではパスワードそのものではなく「自分たちにしか分からないヒント（例：実家の犬の名前、初めて買った車の名前）」を登録することを推奨しています。さらに、そのヒント自体も、家族独自のパスコードを使用してあなたの端末（ブラウザ）上で強力に暗号化（E2EE）されてから送信されるため、極めて安全です。",
              },
              {
                q: "家族のパスコードを忘れたらどうなりますか？",
                a: "エンドツーエンド暗号化（E2EE）の特性上、暗号を復号するためのキーはサーバー側には保存されていません。そのため、運営者であっても復号することは不可能です。家族共通のパスコードは、家族間で大切に管理してください（技術的にはMasterKeyとソルトを使用した堅牢な仕組みをとっています）。",
              },
              {
                q: "本当に無料で使えますか？将来的に有料化しますか？",
                a: "はい、すべての機能を完全無料でご利用いただけます。家族間の基本的なパスワード共有を助けるインフラとして提供されており、広告やプレミアムオプションなどの強制はありません。安心してご使用ください。",
              },
              {
                q: "プライベートとシェアの切り替えは後からでも変更可能ですか？",
                a: "はい、変更可能です。各サービスレコードの詳細画面から、トグルの切り替え（PRIVATE ⇄ SHARED）を行うだけで、いつでもリアルタイムに共有設定を変更することができます。",
              },
            ].map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={faq.q}
                  className="rounded-lg bg-neutral-50 dark:bg-[#121212] shadow-card transition-all"
                >
                  <button
                    type="button"
                    onClick={() => toggleFaq(index)}
                    className="w-full flex items-center justify-between p-5 text-left font-medium text-[16px] tracking-geist-h2 text-foreground"
                  >
                    <span>Q: {faq.q}</span>
                    {isOpen ? (
                      <ChevronUp className="h-5 w-5 text-orange-500 shrink-0" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-neutral-400 shrink-0" />
                    )}
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-300 ${
                      isOpen
                        ? "max-h-96 border-t dark:border-neutral-800"
                        : "max-h-0"
                    }`}
                  >
                    <p className="p-5 text-sm leading-relaxed text-muted-foreground">
                      A: {faq.a}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ⑧ フッターボトムCTA & フッター */}
      <section className="relative overflow-hidden py-24 md:py-32 border-t border-border">
        {/* 背景グラデーションウォッシュ */}
        <div className="absolute inset-0 bg-gradient-to-tr from-orange-100/40 via-amber-50/20 to-rose-100/30 dark:from-orange-950/10 dark:via-neutral-950 dark:to-stone-950 -z-10" />

        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-[32px] md:text-[48px] font-semibold tracking-geist-hero leading-tight">
            さあ、家族のアカウントを
            <br />
            スマートに一元管理しよう。
          </h2>
          <p className="mt-6 text-[16px] md:text-[18px] text-muted-foreground max-w-lg mx-auto">
            LINEでのパスワード送信を今すぐやめて、最高峰のプライバシーに守られた「ヒント共有」を始めましょう。
          </p>

          <div className="mt-10 flex justify-center">
            <Link
              to="/login"
              className="rounded-full bg-orange-500 hover:bg-orange-600 text-white font-semibold px-8 py-4 text-[16px] transition shadow-lg inline-flex items-center gap-2"
            >
              今すぐ無料で始める
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* フッター */}
      <footer className="border-t border-border bg-white dark:bg-[#0c0a09] py-12 text-center text-sm text-muted-foreground">
        <div className="mb-4 flex flex-wrap justify-center items-center gap-6">
          <Link
            to="/terms-of-service"
            className="hover:text-foreground transition-colors tracking-geist-ui"
          >
            利用規約
          </Link>
          <Link
            to="/privacy-policy"
            className="hover:text-foreground transition-colors tracking-geist-ui"
          >
            プライバシーポリシー
          </Link>
          <a
            href="https://github.com/luthpg/poohma-start"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors flex items-center gap-1.5 tracking-geist-ui"
          >
            <SiGithub className="h-4 w-4" />
            GitHub
          </a>
        </div>
        &copy; 2026 PoohMa - Family Password Hint Manager
      </footer>
    </div>
  );
}
