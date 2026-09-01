import { createMiddleware, createStart } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { env as clientEnv } from "@/env/client";
import { env as serverEnv } from "@/env/server";

const convexHost = (() => {
	try {
		return new URL(clientEnv.VITE_CONVEX_URL).host;
	} catch {
		return "";
	}
})();

const cspMiddleware = createMiddleware().server(({ next, request }) => {
	if (request.method !== "GET") {
		return next();
	}

	const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
	const nonce = btoa(String.fromCharCode(...nonceBytes));

	const isPreview = serverEnv.VERCEL_ENV === "preview";

	const directives = [
		"default-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'",
		"style-src 'self' 'unsafe-inline'",
		"style-src-attr 'unsafe-inline'",
		"img-src 'self' data: https:",
		"font-src 'self' data:",
		"frame-src 'self' https://docs.google.com https://drive.google.com",
		"object-src 'none'",
		"manifest-src 'self'",
		"worker-src 'self'",
		"upgrade-insecure-requests",
		...(isPreview
			? [
					`script-src 'strict-dynamic' 'nonce-${nonce}' https://vercel.live`,
					"connect-src 'self' https://vercel.live wss://ws-us3.pusher.com" +
						(convexHost ? ` wss://${convexHost} https://${convexHost}` : "") +
						" https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://www.googleapis.com https://apis.google.com",
				]
			: [
					`script-src 'strict-dynamic' 'nonce-${nonce}'`,
					"connect-src 'self'" +
						(convexHost ? ` wss://${convexHost} https://${convexHost}` : "") +
						" https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://www.googleapis.com https://apis.google.com",
				]),
	].join("; ");

	const headerName =
		serverEnv.CSP_MODE === "report-only"
			? "Content-Security-Policy-Report-Only"
			: "Content-Security-Policy";

	setResponseHeader(headerName, directives);
	setResponseHeader("X-Content-Type-Options", "nosniff");
	setResponseHeader("Referrer-Policy", "strict-origin-when-cross-origin");
	setResponseHeader(
		"Permissions-Policy",
		"camera=(), microphone=(), geolocation=(), publickey-credentials-get=(self), publickey-credentials-create=(self)",
	);

	return next({ context: { nonce } });
});

export const startInstance = createStart(() => {
	return {
		requestMiddleware: [cspMiddleware],
	};
});

declare module "@tanstack/react-router" {
	interface Register {
		start: typeof startInstance;
	}
}
