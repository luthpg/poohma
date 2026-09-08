import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  HelpCircle,
  KeyRound,
  Lock,
  ShieldCheck,
  Smartphone,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/(public)/usage")({
  component: UsagePage,
});

function UsagePage() {
  // メインのステップバイステップガイド
  const steps = [
    {
      number: "01",
      title: "家族グループの作成・参加",
      description:
        "アプリにログイン後、新しい「家族」を作成するか、共有された招待コードを入力して家族グループに参加します。このとき、家族専用の「マスターキー」が安全に生成されます。",
      icon: UserPlus,
    },
    {
      number: "02",
      title: "アカウントとヒントの登録",
      description:
        "動画配信サービスやWi-Fiなどの「ログインID」と、家族だけが推測できる「パスワードのヒント」を入力して保存します。実パスワードそのものは一切入力・保存しません。",
      icon: KeyRound,
    },
    {
      number: "03",
      title: "パスコードロックと安全な閲覧",
      description:
        "登録したヒントを見るには、各自が設定した「画面ロック用パスコード」の入力が必要です。これにより、スマホを置き忘れた際などの身近な覗き見を完全に防ぎます。",
      icon: Lock,
    },
  ];

  // よく読まれる個別トピック・応用ガイド
  const topics = [
    {
      title: "実パスワードを保存しない理由",
      description:
        "PoohMaがなぜ安全なのか、ヒント管理による心理的・技術的なセキュリティの仕組みを解説します。",
      category: "セキュリティ",
    },
    {
      title: "マスターキーの管理と注意点",
      description:
        "エンドツーエンド暗号化（E2EE）の要となるマスターキーの仕組みと、安全な運用のコツ。",
      category: "高度な設定",
    },
    {
      title: "機種変更時のデータの引き継ぎ",
      description:
        "スマートフォンを新しく買い替えた際に、家族のデータを安全に同期・復元する手順について。",
      category: "サポート",
    },
  ];

  return (
    <>
      {/* ヒーローセクション */}
      <section className="border-b border-border/60 bg-gradient-to-b from-background to-muted/20">
        <div className="mx-auto max-w-[1200px] px-4 py-16 text-center md:py-24">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[12px] font-medium text-muted-foreground mb-4">
            <Smartphone className="h-3.5 w-3.5" />
            はじめてのPoohMa
          </span>
          <h1 className="text-[32px] md:text-[44px] font-semibold tracking-[-1.5px] leading-tight text-foreground mb-4">
            使い方ガイド
          </h1>
          <p className="text-[15px] md:text-[16px] text-muted-foreground max-w-[540px] mx-auto leading-relaxed">
            PoohMa（プーマ）は、家族のアカウント情報を「パスワードのヒント」で安全に共有するサービスです。初期設定から日々の使い方までをご案内します。
          </p>
        </div>
      </section>

      {/* メインステップセクション */}
      <section className="mx-auto max-w-[1200px] w-full px-4 py-16 md:py-24">
        <div className="mb-12 text-center md:text-left">
          <h2 className="text-[20px] md:text-[24px] font-semibold tracking-[-0.6px] text-foreground mb-2">
            3ステップで始める共有管理
          </h2>
          <p className="text-[14px] text-muted-foreground">
            まずはこの3つの手順に沿って、家族との安全なパスワードヒント共有をスタートしましょう。
          </p>
        </div>

        {/* ステップカード群 (モバイル: 1カラム / PC: 3カラム) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className="relative flex flex-col bg-card rounded-xl p-6 shadow-[0_0_0_1px_rgba(0,0,0,0.08)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="font-mono text-[24px] font-bold text-muted-foreground/30 tracking-tight">
                    {step.number}
                  </span>
                </div>
                <h3 className="text-[16px] font-semibold tracking-tight text-foreground mb-2.5">
                  {step.title}
                </h3>
                <p className="text-[14px] text-muted-foreground leading-relaxed flex-1">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 応用トピック & FAQ誘導セクション */}
      <section className="border-t border-border bg-muted/20 w-full">
        <div className="mx-auto max-w-[1200px] px-4 py-16 md:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* 左側：セクション見出し */}
            <div className="lg:col-span-1 space-y-4 text-center md:text-left">
              <h2 className="text-[20px] md:text-[24px] font-semibold tracking-[-0.6px] text-foreground">
                詳細な解説と応用
              </h2>
              <p className="text-[14px] text-muted-foreground leading-relaxed">
                セキュリティの仕様や、より高度な管理方法について知りたい方は、こちらのトピックをご覧ください。
              </p>
              <div className="pt-2 hidden md:block">
                <Button asChild variant="outline" className="gap-2 text-[13px]">
                  <Link to="/faq">
                    <HelpCircle className="h-4 w-4" />
                    よくある質問（FAQ）へ
                  </Link>
                </Button>
              </div>
            </div>

            {/* 右側：トピックリンク一覧 */}
            <div className="lg:col-span-2 space-y-4">
              {topics.map((topic) => (
                <div
                  key={topic.title}
                  className="group block bg-card rounded-lg p-5 shadow-[0_0_0_1px_rgba(0,0,0,0.06)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06)] hover:shadow-[0_0_0_1px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.12)] transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1.5">
                      <span className="inline-block text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        {topic.category}
                      </span>
                      <h3 className="text-[15px] font-medium text-foreground group-hover:text-foreground/80 transition-colors">
                        {topic.title}
                      </h3>
                      <p className="text-[13px] text-muted-foreground leading-relaxed">
                        {topic.description}
                      </p>
                    </div>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowRight className="h-4 w-4 text-foreground" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* モバイル用：FAQボタン (スマホ時のみ下部に表示) */}
            <div className="block md:hidden text-center pt-4">
              <Button
                asChild
                variant="outline"
                className="w-full justify-center gap-2 py-5 text-[14px]"
              >
                <Link to="/faq">
                  <HelpCircle className="h-4 w-4" />
                  よくある質問（FAQ）へ
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* 最後に配置するコンテキストCTA */}
      <section className="border-t border-border w-full bg-background">
        <div className="mx-auto max-w-[1200px] px-4 py-16 text-center md:py-20">
          <div className="max-w-[500px] mx-auto space-y-6">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <ShieldCheck className="h-6 w-6 text-foreground" />
            </div>
            <h2 className="text-[22px] md:text-[26px] font-semibold tracking-[-0.8px] text-foreground">
              さあ、家族ではじめましょう
            </h2>
            <p className="text-[14px] text-muted-foreground leading-relaxed">
              登録はわずか1分。パスワードを教え合う心理的ストレスや、メモ紛失による漏洩リスクから家族を解放します。
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Button
                asChild
                className="w-full sm:w-auto bg-foreground text-background hover:bg-foreground/90 text-[14px] px-6 py-5 rounded-md shadow-sm"
              >
                <Link to="/login">アカウントを作成する</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
