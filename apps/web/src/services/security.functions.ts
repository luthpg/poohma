import { createServerFn } from "@tanstack/react-start";
import { getRequestContext } from "@/utils/request-context.server";

/**
 * 接続元の端末・IP・位置情報コンテキストを取得する
 */
export const getClientRequestContext = createServerFn({
	method: "GET",
}).handler(async () => {
	return await getRequestContext();
});
