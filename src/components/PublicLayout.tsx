import { Link, useLocation } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface PublicLayoutProps {
  children: React.ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const navigation = [
    { name: "トップ", href: "/" },
    { name: "使い方", href: "/usage" },
    { name: "FAQ", href: "/faq" },
    { name: "利用規約", href: "/terms-of-service" },
    { name: "プライバシーポリシー", href: "/privacy-policy" },
  ];

  const isActive = (href: string) => {
    if (href === "/") return location.pathname === "/";
    return location.pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased selection:bg-muted">
      {/* トップバー */}
      <header className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-md border-b border-border/60">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            {/* ロゴ */}
            <div className="flex items-center">
              <Link
                to="/"
                className="flex items-center gap-2 font-semibold tracking-[-0.96px] text-[18px] md:text-[20px]"
              >
                <img
                  src="/poohma_icon.png"
                  alt="PoohMa"
                  className="h-7 w-7 object-contain"
                />
                <span className="font-sans">PoohMa</span>
              </Link>
            </div>

            {/* PC向けナビゲーション */}
            <nav className="hidden md:flex items-center gap-1">
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`px-3 py-1.5 text-[14px] font-medium rounded-md transition-colors ${
                    isActive(item.href)
                      ? "text-foreground bg-muted font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  {item.name}
                </Link>
              ))}
            </nav>

            {/* PC向けアクションボタン */}
            <div className="hidden md:flex items-center gap-3">
              <Button
                asChild
                className="bg-foreground text-background hover:bg-foreground/90 text-[14px] font-medium rounded-md px-4 py-2 shadow-sm transition-colors"
              >
                <Link to="/login">ログイン</Link>
              </Button>
            </div>

            {/* モバイルメニュー */}
            <div className="flex md:hidden">
              <Sheet open={isOpen} onOpenChange={setIsOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">メニューを開く</span>
                  </Button>
                </SheetTrigger>

                {/* 上からスライドダウンする指定 (side="top") */}
                <SheetContent
                  side="top"
                  className="w-full bg-background border-b border-border p-6 pt-16"
                >
                  {/* アクセシビリティのためのタイトル（非表示） */}
                  <SheetHeader className="sr-only">
                    <SheetTitle>ナビゲーションメニュー</SheetTitle>
                  </SheetHeader>

                  <nav className="flex flex-col gap-1 mt-2">
                    {navigation.map((item) => (
                      <Link
                        key={item.href}
                        to={item.href}
                        onClick={() => setIsOpen(false)}
                        className={`block px-3 py-2.5 text-[15px] font-medium rounded-md ${
                          isActive(item.href)
                            ? "text-foreground bg-muted font-semibold"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        {item.name}
                      </Link>
                    ))}

                    <div className="pt-4 pb-2 border-t border-border mt-4 flex flex-col gap-2">
                      <Button
                        asChild
                        className="w-full justify-center bg-foreground text-background hover:bg-foreground/90 py-2.5"
                        onClick={() => setIsOpen(false)}
                      >
                        <Link to="/login">ログイン</Link>
                      </Button>
                    </div>
                  </nav>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="flex-1 flex flex-col w-full">{children}</main>

      {/* フッター */}
      <footer className="w-full bg-muted/30 border-t border-border py-12 mt-auto">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2">
              <span className="font-semibold tracking-tight text-foreground text-[16px]">
                PoohMa
              </span>
              <p className="text-muted-foreground text-[12px]">
                家族間アカウント・パスワードヒント安全管理アプリ
              </p>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-3 text-[13px] text-muted-foreground">
              <Link
                to="/usage"
                className="hover:text-foreground transition-colors"
              >
                使い方
              </Link>
              <Link
                to="/faq"
                className="hover:text-foreground transition-colors"
              >
                FAQ
              </Link>
              <Link
                to="/terms-of-service"
                className="hover:text-foreground transition-colors"
              >
                利用規約
              </Link>
              <Link
                to="/privacy-policy"
                className="hover:text-foreground transition-colors"
              >
                プライバシーポリシー
              </Link>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-border text-left">
            <p className="text-muted-foreground text-[12px]">
              &copy; {new Date().getFullYear()} PoohMa. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
