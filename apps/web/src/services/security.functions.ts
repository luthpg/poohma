import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { env } from "@/env/client";
import {
	adminAuth,
	verifySessionCookie,
} from "@/services/firebase-admin.server";
import { getRequestContext } from "@/utils/request-context.server";

function createConvexClient() {
	return new ConvexHttpClient(env.VITE_CONVEX_URL as string);
}

/**
 * サーバー側でセッションCookieを検証し、ConvexHttpClient を認証済み状態で作成する
 */
async function getAuthenticatedConvexClient() {
	const sessionCookie = getCookie("session");
	if (!sessionCookie) throw new Error("Unauthenticated: No session cookie");

	const decodedToken = await verifySessionCookie(sessionCookie);
	const customToken = await adminAuth().createCustomToken(decodedToken.uid);

	const client = createConvexClient();
	client.setAuth(customToken);
	return { client, uid: decodedToken.uid };
}

/**
 * 接続元の端末・IP・位置情報コンテキストを取得する
 */
export const getClientRequestContext = createServerFn({
	method: "GET",
}).handler(async () => {
	return await getRequestContext();
});

/**
 * CSVエクスポート用レコード取得 Server Function（サーバー側で通知もスケジュール）
 */
export const fetchRecordsForExportServerFn = createServerFn({
	method: "POST",
})
	.validator((data: { accountId?: string }) => data)
	.handler(async ({ data }) => {
		const context = await getRequestContext();
		const { client } = await getAuthenticatedConvexClient();

		return await client.mutation(api.records.fetchRecordsForExport, {
			accountId: data.accountId as Id<"users"> | undefined,
			...context,
		});
	});

/**
 * 生体認証登録・解除通知 Server Function
 */
export const notifyBiometricEventServerFn = createServerFn({
	method: "POST",
})
	.validator(
		(data: { event: "registered" | "removed"; accountId?: string }) => data,
	)
	.handler(async ({ data }) => {
		try {
			const context = await getRequestContext();
			const { client } = await getAuthenticatedConvexClient();

			return await client.mutation(api.users.notifyBiometricEvent, {
				event: data.event,
				accountId: data.accountId as Id<"users"> | undefined,
				...context,
			});
		} catch (e) {
			console.warn("Failed to notify biometric event:", e);
			return { success: false };
		}
	});
