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
import { Spinner } from "@/components/ui/spinner";
import { useAccount } from "@/hooks/useAccount";

export const Route = createFileRoute("/(app)")({
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

	// 未認証確定時はログイン画面へリダイレクト
	useEffect(() => {
		if (!isAuthLoading && !isAuthenticated && !hasRedirectedRef.current) {
			hasRedirectedRef.current = true;
			navigate({
				to: "/login",
				search: { redirect: location.href },
				replace: true,
			});
		}
		if (isAuthenticated) {
			hasRedirectedRef.current = false;
		}
	}, [isAuthLoading, isAuthenticated, navigate, location.href]);

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

	// 認証初期化・復元中はローディング表示
	if (isAuthLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<Spinner className="h-8 w-8 text-orange-500" />
			</div>
		);
	}

	// 未認証状態（リダイレクト遷移中）は何も描画しない
	if (!isAuthenticated) {
		return null;
	}

	// family ページは独自ヘッダーを持つため、共通ヘッダーを非表示にする
	return (
		<>
			{currentAccount?.familyId && <AppHeader user={currentAccount} />}
			<Outlet />
		</>
	);
}
