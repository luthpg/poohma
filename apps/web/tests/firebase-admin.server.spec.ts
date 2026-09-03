import { describe, expect, it, vi } from "vitest";

const verifySessionCookieMock = vi.fn();
const revokeRefreshTokensMock = vi.fn();

vi.mock("firebase-admin", () => {
	return {
		default: {
			apps: [{}],
			app: () => ({
				auth: () => ({
					verifySessionCookie: verifySessionCookieMock,
					revokeRefreshTokens: revokeRefreshTokensMock,
				}),
			}),
			initializeApp: vi.fn(),
			credential: { cert: vi.fn() },
		},
	};
});

describe("firebase-admin.server: verifySessionCookie", () => {
	it("デフォルトでは外部通信を防ぐため checkRevoked=false でFirebase Admin SDKを呼び出すこと", async () => {
		verifySessionCookieMock.mockResolvedValue({ uid: "user_a" });
		const { verifySessionCookie } = await import(
			"../src/services/firebase-admin.server"
		);

		await verifySessionCookie("dummy-session-cookie");

		expect(verifySessionCookieMock).toHaveBeenCalledWith(
			"dummy-session-cookie",
			false,
		);
	});

	it("明示的に checkRevoked=true を指定した場合は true でFirebase Admin SDKを呼び出すこと", async () => {
		verifySessionCookieMock.mockResolvedValue({ uid: "user_a" });
		const { verifySessionCookie } = await import(
			"../src/services/firebase-admin.server"
		);

		await verifySessionCookie("dummy-session-cookie", true);

		expect(verifySessionCookieMock).toHaveBeenCalledWith(
			"dummy-session-cookie",
			true,
		);
	});

	it("Firebase側でセッションが失効(revoked)している場合、verifySessionCookie がエラーをスローすること", async () => {
		verifySessionCookieMock.mockRejectedValue(
			Object.assign(new Error("Session cookie has been revoked"), {
				code: "auth/session-cookie-revoked",
			}),
		);
		const { verifySessionCookie } = await import(
			"../src/services/firebase-admin.server"
		);

		await expect(verifySessionCookie("revoked-session-cookie")).rejects.toThrow(
			"revoked",
		);
	});

	it("revokeRefreshTokens が渡された uid で Firebase Admin SDK を呼び出すこと", async () => {
		revokeRefreshTokensMock.mockResolvedValue(undefined);
		const { revokeRefreshTokens } = await import(
			"../src/services/firebase-admin.server"
		);

		await revokeRefreshTokens("user_uid_123");

		expect(revokeRefreshTokensMock).toHaveBeenCalledWith("user_uid_123");
	});
});
