// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	getCustomTokenFromSession,
	mockAuth,
	onIdTokenChanged,
	refreshSessionCookie,
	signInWithCustomToken,
} = vi.hoisted(() => ({
	getCustomTokenFromSession: vi.fn(),
	mockAuth: { currentUser: null },
	onIdTokenChanged: vi.fn(),
	refreshSessionCookie: vi.fn(),
	signInWithCustomToken: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
	onIdTokenChanged,
	signInWithCustomToken,
}));

vi.mock("@/services/auth.functions", () => ({
	getCustomTokenFromSession,
	refreshSessionCookie,
}));

vi.mock("@/utils/firebase", () => ({
	auth: mockAuth,
}));

vi.mock("@/utils/pwa", () => ({
	isPwaFirstLaunch: vi.fn(() => false),
	markPwaAsInitialized: vi.fn(),
}));

import {
	LOGOUT_FLAG_KEY,
	useConvexFirebaseAuth,
} from "@/hooks/useConvexFirebaseAuth";

describe("useConvexFirebaseAuth", () => {
	let store: Record<string, string> = {};
	const localStorageMock = {
		getItem: (key: string) => store[key] ?? null,
		setItem: (key: string, value: string) => {
			store[key] = value;
		},
		removeItem: (key: string) => {
			delete store[key];
		},
		clear: () => {
			store = {};
		},
	};

	beforeEach(() => {
		vi.clearAllMocks();
		store = {};
		vi.stubGlobal("localStorage", localStorageMock);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("セッション復元中に別タブでログアウトした場合は Firebase Auth を未認証のまま維持すること", async () => {
		let authStateCallback: ((user: null) => Promise<void>) | undefined;
		onIdTokenChanged.mockImplementation((_auth, callback) => {
			authStateCallback = callback;
			return vi.fn();
		});

		let resolveCustomToken:
			| ((value: { customToken: string }) => void)
			| undefined;
		getCustomTokenFromSession.mockReturnValue(
			new Promise<{ customToken: string }>((resolve) => {
				resolveCustomToken = resolve;
			}),
		);

		const { result } = renderHook(() => useConvexFirebaseAuth());
		expect(authStateCallback).toBeDefined();

		let recoveryPromise: Promise<void> | undefined;
		act(() => {
			recoveryPromise = authStateCallback?.(null);
		});
		expect(getCustomTokenFromSession).toHaveBeenCalledOnce();

		act(() => {
			localStorage.setItem(LOGOUT_FLAG_KEY, "logged-out-in-another-tab");
			window.dispatchEvent(
				new StorageEvent("storage", {
					key: LOGOUT_FLAG_KEY,
					newValue: "logged-out-in-another-tab",
				}),
			);
		});

		expect(result.current.isAuthenticated).toBe(false);
		expect(result.current.isLoading).toBe(false);

		act(() => {
			resolveCustomToken?.({ customToken: "stale-custom-token" });
		});

		await act(async () => {
			await recoveryPromise;
		});

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});
		expect(result.current.isAuthenticated).toBe(false);
		expect(mockAuth.currentUser).toBeNull();
		expect(signInWithCustomToken).not.toHaveBeenCalled();
	});
});
