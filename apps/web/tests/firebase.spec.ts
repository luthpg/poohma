// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	addScope,
	credentialFromResult,
	mockAuth,
	reauthenticateWithPopup,
	setCustomParameters,
} = vi.hoisted(() => ({
	addScope: vi.fn(),
	credentialFromResult: vi.fn(),
	mockAuth: { currentUser: null as { uid: string } | null },
	reauthenticateWithPopup: vi.fn(),
	setCustomParameters: vi.fn(),
}));

vi.mock("@/env/client", () => ({
	env: {
		VITE_FIREBASE_API_KEY: "test-api-key",
		VITE_FIREBASE_PROJECT_ID: "test-project",
	},
}));

vi.mock("firebase/app", () => ({
	getApps: vi.fn(() => []),
	initializeApp: vi.fn(() => ({})),
}));

vi.mock("firebase/auth", () => {
	class MockGoogleAuthProvider {
		static credentialFromResult = credentialFromResult;
		addScope = addScope;
		setCustomParameters = setCustomParameters;
	}

	return {
		getAuth: vi.fn(() => mockAuth),
		GoogleAuthProvider: MockGoogleAuthProvider,
		reauthenticateWithPopup,
	};
});

import {
	GOOGLE_DRIVE_SCOPE,
	getGoogleDriveAccessToken,
	resetDriveTokenCache,
} from "@/utils/firebase";

describe("getGoogleDriveAccessToken", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetDriveTokenCache();
		mockAuth.currentUser = { uid: "firebase-user" };
		reauthenticateWithPopup.mockResolvedValue({ user: mockAuth.currentUser });
		credentialFromResult.mockReturnValue({ accessToken: "drive-token" });
	});

	it("現在の Firebase ユーザーを再認証して Drive token を取得すること", async () => {
		const currentUser = mockAuth.currentUser;

		await expect(getGoogleDriveAccessToken()).resolves.toBe("drive-token");

		expect(reauthenticateWithPopup).toHaveBeenCalledWith(
			currentUser,
			expect.any(Object),
		);
		expect(addScope).toHaveBeenCalledWith(GOOGLE_DRIVE_SCOPE);
		expect(setCustomParameters).toHaveBeenCalledWith({ prompt: "consent" });
		expect(mockAuth.currentUser).toBe(currentUser);
	});

	it("Firebase ユーザーが未ログインの場合は OAuth popup を開かないこと", async () => {
		mockAuth.currentUser = null;

		await expect(getGoogleDriveAccessToken()).resolves.toBeNull();

		expect(reauthenticateWithPopup).not.toHaveBeenCalled();
	});
});
