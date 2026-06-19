// @vitest-environment jsdom

import { del } from "idb-keyval";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptPasscodeWithBiometrics,
  disableBiometricUnlock,
  isBiometricEnabledForUser,
  isBiometricSupported,
  registerBiometricUnlock,
} from "@/lib/biometric";

// PRF拡張用のダミーデータ（32バイトの決定論的シードをシミュレート）
const MOCK_PRF_SEED = new Uint8Array(32).fill(7).buffer;

// idb-keyval のモック化（テスト間でストアを共有）
const store = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: string) => store.get(key)),
  set: vi.fn(async (key: string, val: unknown) => {
    store.set(key, val);
  }),
  del: vi.fn(async (key: string) => {
    store.delete(key);
  }),
}));

describe("生体認証解除機能のテスト (PRF拡張対応版: src/lib/biometric.ts)", () => {
  const mockUserId = "test-user-123";
  const mockPasscode = "SuperSecurePasscode123!";

  beforeEach(() => {
    vi.restoreAllMocks();
    store.clear();

    // PublicKeyCredential のモック
    Object.defineProperty(globalThis, "PublicKeyCredential", {
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi
          .fn()
          .mockResolvedValue(true),
      },
      writable: true,
      configurable: true,
    });

    // 登録時のダミー Credential (PRF拡張の結果を返すようにモック)
    const mockCredential = {
      rawId: new Uint8Array([1, 2, 3, 4]).buffer,
      id: "AQIDBA",
      type: "public-key",
      response: {},
      getClientExtensionResults: vi.fn().mockReturnValue({
        prf: {
          enabled: true,
          results: {
            first: MOCK_PRF_SEED, // ここでダミーのシードを返す
          },
        },
      }),
    };

    // 認証(解除)時のダミー Assertion (PRF拡張の結果を返すようにモック)
    const mockAssertion = {
      id: "AQIDBA",
      type: "public-key",
      rawId: new Uint8Array([1, 2, 3, 4]).buffer,
      response: {
        authenticatorData: new ArrayBuffer(0),
        clientDataJSON: new ArrayBuffer(0),
        signature: new ArrayBuffer(0),
      },
      getClientExtensionResults: vi.fn().mockReturnValue({
        prf: {
          results: {
            first: MOCK_PRF_SEED, // 登録時と同じシードが生成されたとシミュレート
          },
        },
      }),
    };

    Object.defineProperty(navigator, "credentials", {
      value: {
        create: vi.fn().mockResolvedValue(mockCredential),
        get: vi.fn().mockResolvedValue(mockAssertion),
      },
      writable: true,
      configurable: true,
    });
  });

  describe("isBiometricSupported", () => {
    it("プラットフォーム認証器が利用可能な場合 true を返すこと", async () => {
      const supported = await isBiometricSupported();
      expect(supported).toBe(true);
    });

    it("PublicKeyCredential が存在しない場合 false を返すこと", async () => {
      Object.defineProperty(globalThis, "PublicKeyCredential", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      const supported = await isBiometricSupported();
      expect(supported).toBe(false);
    });
  });

  describe("isBiometricEnabledForUser", () => {
    it("未登録の場合 false を返すこと", async () => {
      const enabled = await isBiometricEnabledForUser(mockUserId);
      expect(enabled).toBe(false);
    });
  });

  describe("registerBiometricUnlock (PRF拡張版)", () => {
    it("WebAuthn PRF拡張を用いてパスコードを暗号化し、生の鍵(encryptionKey)を保存せずにIndexedDBへ格納すること", async () => {
      await registerBiometricUnlock(mockUserId, mockPasscode);

      // navigator.credentials.create が呼ばれたか検証
      expect(navigator.credentials.create).toHaveBeenCalledOnce();
      const createArgs =
        // biome-ignore lint/suspicious/noExplicitAny: for tests
        vi.mocked(navigator.credentials.create).mock.calls[0][0] as any;

      // PRF拡張がリクエストに含まれているか検証
      expect(createArgs.publicKey.extensions?.prf).toBeDefined();

      // IndexedDB に保存されたデータの構造を検証
      // biome-ignore lint/suspicious/noExplicitAny: for tests
      const savedData = store.get(`poohma_biometric_${mockUserId}`) as any;
      expect(savedData).toBeDefined();
      expect(savedData.credentialId).toBeTypeOf("string");
      expect(savedData.encryptedPasscode).toBeTypeOf("string");
      expect(savedData.iv).toBeTypeOf("string");
      expect(savedData.prfSalt).toBeTypeOf("string"); // 【追加】PRF導出用のソルトが保存されていること

      // 🚨 【最重要セキュリティ要件】生の暗号鍵が含まれていないこと！
      expect(savedData.encryptionKey).toBeUndefined();

      // 暗号化されたパスコードは元のパスコードと異なること
      expect(savedData.encryptedPasscode).not.toBe(mockPasscode);
    });
  });

  describe("decryptPasscodeWithBiometrics (PRF拡張版)", () => {
    it("生体認証ゲート通過後に、PRF拡張から導出された鍵を用いて正しいパスコードを復号できること", async () => {
      // 1. 登録フローを実行してダミーデータを IndexedDB にセット
      await registerBiometricUnlock(mockUserId, mockPasscode);

      // 2. 復号フローを実行
      const decrypted = await decryptPasscodeWithBiometrics(mockUserId);

      // 3. 検証
      expect(decrypted).toBe(mockPasscode);

      // navigator.credentials.get が呼ばれ、PRF拡張がリクエストされたか検証
      expect(navigator.credentials.get).toHaveBeenCalledOnce();
      const getArgs = // biome-ignore lint/suspicious/noExplicitAny: for tests
        vi.mocked(navigator.credentials.get).mock.calls[0][0] as any;
      expect(getArgs.publicKey.userVerification).toBe("required");
      expect(getArgs.publicKey.extensions?.prf?.eval?.first).toBeDefined(); // ソルトが渡されているか
    });

    it("未登録ユーザーの場合エラーをスローすること", async () => {
      await expect(
        decryptPasscodeWithBiometrics("unknown-user"),
      ).rejects.toThrow("生体認証が有効になっていません。");
    });
  });

  describe("disableBiometricUnlock", () => {
    it("IndexedDB から生体認証データが正しく削除されること", async () => {
      await registerBiometricUnlock(mockUserId, mockPasscode);
      expect(await isBiometricEnabledForUser(mockUserId)).toBe(true);

      await disableBiometricUnlock(mockUserId);
      expect(await isBiometricEnabledForUser(mockUserId)).toBe(false);
      expect(del).toHaveBeenCalledWith(`poohma_biometric_${mockUserId}`);
    });
  });
});
