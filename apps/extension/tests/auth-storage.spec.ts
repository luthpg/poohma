import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAuthSession,
  type ExtensionFamily,
  type ExtensionUser,
  getAuthStorage,
  setAuthSession,
  switchActiveAccount,
} from "../lib/auth";

describe("Extension Auth Storage & Multi-Account Management", () => {
  let mockStore: Record<string, unknown> = {};

  beforeEach(() => {
    mockStore = {};

    // chrome.storage.local & chrome.runtime モック
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (keys: string[]) => {
            const result: Record<string, unknown> = {};
            for (const key of keys) {
              if (key in mockStore) {
                result[key] = mockStore[key];
              }
            }
            return result;
          }),
          set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(mockStore, items);
          }),
          remove: vi.fn(async (keys: string[]) => {
            for (const key of keys) {
              delete mockStore[key];
            }
          }),
        },
      },
      runtime: {
        sendMessage: vi.fn(async () => {}),
      },
    });
  });

  const dummyFamily: ExtensionFamily = {
    _id: "fam_1",
    name: "Our Family",
    masterKeyEncrypted: "enc_key",
    masterKeyIv: "iv_key",
    masterKeySalt: "salt_key",
    kdfIterations: 100000,
    cryptoVersion: 1,
  };

  const dummyFamily2: ExtensionFamily = {
    _id: "fam_2",
    name: "Second Family",
    masterKeyEncrypted: "enc_key_2",
    masterKeyIv: "iv_key_2",
    masterKeySalt: "salt_key_2",
    kdfIterations: 100000,
    cryptoVersion: 1,
  };

  const dummyUser1: ExtensionUser = {
    _id: "user_1",
    userId: "firebase_uid_1",
    displayName: "User One",
    email: "user1@example.com",
    familyId: "fam_1",
    familyRole: "admin",
    family: dummyFamily,
  };

  const dummyUser2: ExtensionUser = {
    _id: "user_2",
    userId: "firebase_uid_1",
    displayName: "User Two",
    email: "user2@example.com",
    familyId: "fam_2",
    familyRole: "viewer",
    family: dummyFamily2,
  };

  it("saves auth session and resets pendingSyncNonce to null", async () => {
    mockStore.pendingSyncNonce = "old_nonce";

    await setAuthSession(
      dummyUser1,
      dummyFamily,
      "custom_token",
      "id_token",
      "refresh_token",
      [dummyUser1, dummyUser2],
    );

    const storage = await getAuthStorage();
    expect(storage.user).toEqual(dummyUser1);
    expect(storage.family).toEqual(dummyFamily);
    expect(storage.pendingSyncNonce).toBeNull();
    // Web設計準拠: ワンタイムの Custom Token はストレージに残さない（null）
    expect(storage.customToken).toBeNull();
    expect(storage.idToken).toBe("id_token");
    expect(storage.refreshToken).toBe("refresh_token");
    expect(storage.accounts).toHaveLength(2);
    expect(storage.activeAccountId).toBe("user_1");
  });

  it("falls back accounts to [user] when accounts is empty", async () => {
    mockStore.user = dummyUser1;
    mockStore.accounts = [];

    const storage = await getAuthStorage();
    expect(storage.accounts).toEqual([dummyUser1]);
    expect(storage.activeAccountId).toBe("user_1");
  });

  it("switches active account among multiple sub-accounts", async () => {
    mockStore.user = dummyUser1;
    mockStore.family = dummyFamily;
    mockStore.accounts = [dummyUser1, dummyUser2];
    mockStore.activeAccountId = "user_1";

    await switchActiveAccount("user_2");

    const storage = await getAuthStorage();
    expect(storage.activeAccountId).toBe("user_2");
    expect(storage.user).toEqual(dummyUser2);
    expect(storage.family).toEqual(dummyFamily2);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "VAULT_LOCK",
    });
  });

  it("clears auth session completely on sign out", async () => {
    await setAuthSession(
      dummyUser1,
      dummyFamily,
      "c_tok",
      "id_tok",
      "ref_tok",
      [dummyUser1],
    );

    await clearAuthSession();

    const storage = await getAuthStorage();
    expect(storage.user).toBeNull();
    expect(storage.family).toBeNull();
    expect(storage.accounts).toEqual([]);
    expect(storage.activeAccountId).toBeNull();
    expect(storage.customToken).toBeNull();
    expect(storage.idToken).toBeNull();
    expect(storage.refreshToken).toBeNull();
    expect(storage.pendingSyncNonce).toBeNull();
  });

  describe("exchangeCustomToken UID verification", () => {
    it("extracts userId from JWT idToken payload even when localId is omitted in response", async () => {
      const payload = { sub: "jwt_uid_from_sub", user_id: "jwt_uid_from_sub" };
      const base64Payload = btoa(JSON.stringify(payload));
      const dummyJwt = `header.${base64Payload}.signature`;

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          idToken: dummyJwt,
          refreshToken: "dummy_refresh",
          // localId は意図的にレスポンスに含まれない状況をシミュレート
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const { exchangeCustomToken } = await import("../lib/auth");
      const result = await exchangeCustomToken("custom_tok", "api_key");

      expect(result).not.toBeNull();
      expect(result?.userId).toBe("jwt_uid_from_sub");
      expect(result?.idToken).toBe(dummyJwt);
      expect(result?.refreshToken).toBe("dummy_refresh");
    });

    it("falls back to localId if JWT payload cannot be parsed", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          idToken: "invalid_jwt_format",
          refreshToken: "dummy_refresh",
          localId: "fallback_local_id",
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const { exchangeCustomToken } = await import("../lib/auth");
      const result = await exchangeCustomToken("custom_tok", "api_key");

      expect(result).not.toBeNull();
      expect(result?.userId).toBe("fallback_local_id");
    });
  });
});
