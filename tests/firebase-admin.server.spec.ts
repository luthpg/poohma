import { describe, expect, it, vi } from "vitest";

const verifySessionCookieMock = vi.fn();

vi.mock("firebase-admin", () => {
  return {
    default: {
      apps: [{}],
      app: () => ({
        auth: () => ({
          verifySessionCookie: verifySessionCookieMock,
        }),
      }),
      initializeApp: vi.fn(),
      credential: { cert: vi.fn() },
    },
  };
});

describe("firebase-admin.server: verifySessionCookie", () => {
  it("checkRevoked を有効化(true)した状態でFirebase Admin SDKを呼び出すこと", async () => {
    verifySessionCookieMock.mockResolvedValue({ uid: "user_a" });
    const { verifySessionCookie } = await import(
      "../src/services/firebase-admin.server"
    );

    await verifySessionCookie("dummy-session-cookie");

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
});
