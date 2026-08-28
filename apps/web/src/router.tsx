import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { getGlobalStartContext } from "@tanstack/react-start";
import { setNonce } from "get-nonce";

// Import the generated route tree
import { routeTree } from "@/routeTree.gen";

// Create a new router instance
export const getRouter = () => {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 1000 * 60 * 5, // 5 minutes
			},
		},
	});

	if (typeof document !== "undefined") {
		const nonceInDocument = document.querySelector<HTMLMetaElement>(
			'meta[name="csp-nonce"]',
		)?.content;
		if (nonceInDocument) setNonce(nonceInDocument);
	}

	// CSPミドルウェアが設定したnonceを取得
	// getGlobalStartContext() はリクエストミドルウェアのcontextを返す
	const startContext = getGlobalStartContext();
	const nonce =
		typeof startContext?.nonce === "string" ? startContext.nonce : undefined;

	const router = createRouter({
		routeTree,
		context: {
			queryClient,
		},
		ssr: { nonce },

		defaultPreload: "intent",
		scrollRestoration: true,
		defaultPreloadStaleTime: 1000 * 10, // 10 seconds
		defaultPendingMs: 150,
		defaultPendingMinMs: 400,
	});

	return router;
};

// Register the router instance for type safety
declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
