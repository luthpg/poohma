import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";

export const Route = createFileRoute("/(app)")({
  beforeLoad: async ({ context, location }) => {
    if (!context.user) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }

    if (!context.user.familyId && location.pathname !== "/family") {
      throw redirect({ to: "/family" });
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { user } = Route.useRouteContext();

  // family ページは独自ヘッダーを持つため、共通ヘッダーを非表示にする
  return (
    <>
      {user?.familyId && <AppHeader user={user} />}
      <Outlet />
    </>
  );
}
