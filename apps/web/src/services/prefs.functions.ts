import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";

export interface DashboardPrefs {
	sort: string;
	view: string;
}

export const getDashboardPrefsFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<DashboardPrefs> => {
		const sort = getCookie("poohma_dashboard_sort") || "name-asc";
		const view = getCookie("poohma_dashboard_view") || "card";
		return { sort, view };
	},
);

export const setDashboardPrefsFn = createServerFn({ method: "POST" })
	.validator((data: { sort?: string; view?: string }) => data)
	.handler(async ({ data }) => {
		if (data.sort) {
			setCookie("poohma_dashboard_sort", data.sort, {
				maxAge: 60 * 60 * 24 * 365,
				path: "/",
			});
		}
		if (data.view) {
			setCookie("poohma_dashboard_view", data.view, {
				maxAge: 60 * 60 * 24 * 365,
				path: "/",
			});
		}
		return { success: true };
	});

export function getClientCookie(name: string): string | undefined {
	if (typeof document === "undefined") return undefined;
	const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
	return match ? decodeURIComponent(match[1]) : undefined;
}

export function setClientCookie(name: string, value: string, maxAgeDays = 365) {
	if (typeof document === "undefined") return;
	const maxAge = maxAgeDays * 24 * 60 * 60;
	// biome-ignore lint/suspicious/noDocumentCookie: UI表示設定（sort/view）の非機密データ同期保存のため
	document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax`;
}

/**
 * ダッシュボードの設定（sort, view）を取得する。
 * クライアント（CSR）環境では document.cookie から同期取得して不要なサーバー往復（HTTP RTT）を回避する。
 * SSR 時はサーバー側で getDashboardPrefsFn を実行して Cookie を読み取る。
 */
export async function getDashboardPrefs(): Promise<DashboardPrefs> {
	if (typeof document !== "undefined") {
		const sort = getClientCookie("poohma_dashboard_sort") || "name-asc";
		const view = getClientCookie("poohma_dashboard_view") || "card";
		return { sort, view };
	}
	return await getDashboardPrefsFn();
}

/**
 * ダッシュボードの設定（sort, view）を保存する。
 * クライアント環境では document.cookie に即時反映し、サーバー側 Cookie にも非同期で同期する。
 */
export function setDashboardPrefs(data: { sort?: string; view?: string }) {
	if (typeof document !== "undefined") {
		if (data.sort) {
			setClientCookie("poohma_dashboard_sort", data.sort);
		}
		if (data.view) {
			setClientCookie("poohma_dashboard_view", data.view);
		}
		return;
	}
	setDashboardPrefsFn({ data }).catch(console.error);
}
