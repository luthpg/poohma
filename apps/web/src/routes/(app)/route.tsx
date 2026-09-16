import {
  createFileRoute,
  Outlet,
  useLocation,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/components/AuthProvider";
import { HoneyPotLoader } from "@/components/HoneyPotLoader";
import { useAccount } from "@/hooks/useAccount";

import { hasAnyPendingDraft } from "@/lib/auth-recovery";

const Loader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <HoneyPotLoader size="lg" animationDurationSeconds={1.5} />
  </div>
);

export const Route = createFileRoute("/(app)")({
  pendingMs: 0,
  pendingMinMs: 300,
  pendingComponent: Loader,
  component: RouteComponent,
});

function RouteComponent() {
  const { user } = Route.useRouteContext();
  const { activeAccount, isLoading: isAccountLoading } = useAccount();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const hasRedirectedRef = useRef(false);
  const hasBeenAuthenticatedRef = useRef(false);
  const isDraftRestoring =
    typeof window !== "undefined" && hasAnyPendingDraft();

  useEffect(() => {
    if (isAuthenticated) {
      hasBeenAuthenticatedRef.current = true;
      hasRedirectedRef.current = false;
    }
  }, [isAuthenticated]);

  // 未認証確定時はログイン画面へリダイレクト
  useEffect(() => {
    if (isAuthLoading || isDraftRestoring) return;

    if (!isAuthenticated && !hasRedirectedRef.current) {
      // 一度ログイン済みの状態でセッションが切れた場合、レコード画面ではインライン救済（SessionExpiredDialog）に任せて強制遷移を控える
      const isRecordEditRoute = pathname.includes("/records");
      if (hasBeenAuthenticatedRef.current && isRecordEditRoute) {
        return;
      }

      hasRedirectedRef.current = true;
      navigate({
        to: "/login",
        search: { redirect: location.href },
        replace: true,
      });
    }
  }, [
    isAuthLoading,
    isAuthenticated,
    navigate,
    location.href,
    pathname,
    isDraftRestoring,
  ]);

  const currentAccount = activeAccount || user;

  useEffect(() => {
    if (
      !isAccountLoading &&
      activeAccount &&
      !activeAccount.familyId &&
      pathname !== "/family"
    ) {
      navigate({ to: "/family", replace: true });
    }
  }, [activeAccount, isAccountLoading, pathname, navigate]);

  // 認証初期化・復元中、および未認証時（ログイン画面へのリダイレクト遷移中）はローディング表示
  if (isAuthLoading || !isAuthenticated) {
    return <Loader />;
  }

  return (
    <>
      {currentAccount?.familyId && <AppHeader user={currentAccount} />}
      <main className="flex-1">
        <Outlet />
      </main>
    </>
  );
}
