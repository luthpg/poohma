import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useAccount } from "@/hooks/useAccount";

export const Route = createFileRoute("/(app)")({
  beforeLoad: async ({ context, location }) => {
    if (!context.user) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
        replace: true,
      });
    }

    if (!context.user.familyId && location.pathname !== "/family") {
      throw redirect({ to: "/family", replace: true });
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { user } = Route.useRouteContext();
  const { activeAccount, isLoading } = useAccount();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const currentAccount = activeAccount || user;

  useEffect(() => {
    if (
      !isLoading &&
      activeAccount &&
      !activeAccount.familyId &&
      pathname !== "/family"
    ) {
      navigate({ to: "/family", replace: true });
    }
  }, [activeAccount, isLoading, pathname, navigate]);

  // family ページは独自ヘッダーを持つため、共通ヘッダーを非表示にする
  return (
    <>
      {currentAccount?.familyId && <AppHeader user={currentAccount} />}
      <Outlet />
    </>
  );
}
