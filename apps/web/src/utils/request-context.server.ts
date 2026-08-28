import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { UAParser } from "ua-parser-js";
import { fetchGeoLocation } from "./geo-ip.server";

export interface RequestContext {
	ipAddress?: string;
	browser?: string;
	os?: string;
	deviceName?: string;
	location?: string;
}

/**
 * リクエストヘッダーおよびIPから端末・位置情報コンテキストを取得
 */
export async function getRequestContext(): Promise<RequestContext> {
	const ua = getRequestHeader("user-agent") ?? "";
	const parsed = new UAParser(ua).getResult();

	// IPアドレスの解決 (getRequestIP または x-forwarded-for / x-real-ip)
	let ipAddress: string | undefined;
	try {
		ipAddress = getRequestIP();
	} catch {
		// getRequestIP が利用できない環境への対策
	}

	if (!ipAddress) {
		const forwarded = getRequestHeader("x-forwarded-for");
		if (forwarded) {
			ipAddress = forwarded.split(",")[0]?.trim();
		} else {
			ipAddress = getRequestHeader("x-real-ip");
		}
	}

	const browser = parsed.browser.name
		? `${parsed.browser.name}${parsed.browser.version ? ` ${parsed.browser.version.split(".")[0]}` : ""}`
		: undefined;

	const os = parsed.os.name
		? `${parsed.os.name}${parsed.os.version ? ` ${parsed.os.version}` : ""}`
		: undefined;

	let deviceName: string | undefined;
	if (parsed.device.vendor || parsed.device.model) {
		deviceName =
			`${parsed.device.vendor ?? ""} ${parsed.device.model ?? ""}`.trim();
	} else if (parsed.os.name) {
		deviceName = parsed.os.name;
	}

	const location = await fetchGeoLocation(ipAddress);

	return {
		ipAddress,
		browser,
		os,
		deviceName,
		location,
	};
}
