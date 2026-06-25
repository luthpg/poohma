// @vitest-environment jsdom

import { useRouteContext } from "@tanstack/react-router";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import { PasscodeProvider, usePasscode } from "@/components/PasscodeProvider";
import * as cryptoLib from "@/lib/crypto";

vi.mock("@tanstack/react-router", () => ({
  useRouteContext: vi.fn(),
}));

vi.mock("@/lib/crypto", () => {
  return {
    deriveKeyFromPasscode: vi.fn(),
    unwrapMasterKey: vi.fn(),
    exportKeyToBase64: vi.fn(),
    importKeyFromBase64: vi.fn(),
    decrypt: vi.fn(),
    encrypt: vi.fn(),
    unwrapDEK: vi.fn(),
    wrapDEK: vi.fn(),
    generateDEK: vi.fn(),
  };
});

describe("PasscodeProvider E2EE State Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("should show passcode prompt and unlock when requireUnlock is called without a master key", async () => {
    (useRouteContext as Mock).mockReturnValue({
      user: {
        familyId: "family-1",
        family: {
          name: "Test Family",
          masterKeyEncrypted: "encrypted-key",
          masterKeyIv: "iv",
          masterKeySalt: "salt",
        },
      },
    });

    const mockDerivedKey = {} as CryptoKey;
    const mockUnwrappedKey = { type: "secret" } as unknown as CryptoKey;

    (cryptoLib.deriveKeyFromPasscode as Mock).mockResolvedValue(mockDerivedKey);
    (cryptoLib.unwrapMasterKey as Mock).mockResolvedValue(mockUnwrappedKey);
    (cryptoLib.exportKeyToBase64 as Mock).mockResolvedValue(
      "base64-exported-key",
    );

    let requireUnlockRef: (() => Promise<boolean>) | null = null;
    let unlockResult = false;

    const TestComponent = () => {
      const { requireUnlock, isLocked } = usePasscode();
      requireUnlockRef = requireUnlock;
      return <div>{isLocked ? "Locked" : "Unlocked"}</div>;
    };

    render(
      <PasscodeProvider>
        <TestComponent />
      </PasscodeProvider>,
    );

    expect(screen.getByText("Locked")).toBeTruthy();

    // Trigger unlock prompt
    // biome-ignore lint/style/noNonNullAssertion: use non-null assertion for testing
    const unlockPromise = requireUnlockRef!();
    unlockPromise.then((res) => {
      unlockResult = res;
    });

    // Check if modal appears
    await waitFor(() => {
      expect(screen.getByText("家族パスコードの入力")).toBeTruthy();
    });

    // Input passcode
    const input = screen.getByPlaceholderText("パスコード");
    fireEvent.change(input, { target: { value: "my-passcode" } });

    // Submit form
    const submitButton = screen.getByRole("button", { name: "ロック解除" });
    fireEvent.click(submitButton);

    // Wait for unlock process
    await waitFor(() => {
      expect(cryptoLib.deriveKeyFromPasscode).toHaveBeenCalledWith(
        "my-passcode",
        "salt",
      );
      expect(cryptoLib.unwrapMasterKey).toHaveBeenCalledWith(
        "encrypted-key",
        "iv",
        mockDerivedKey,
      );
    });

    // The modal should close and state should be unlocked
    await waitFor(() => {
      expect(unlockResult).toBe(true);
      expect(screen.getByText("Unlocked")).toBeTruthy();
    });

    // Verify it was NOT saved to sessionStorage
    expect(sessionStorage.getItem("poohma_master_key_family-1")).toBeNull();
  });

  it("should remain Locked on mount even if sessionStorage has data, and clear master key when user logs out", async () => {
    let currentUser = {
      familyId: "family-1",
      family: {
        name: "Test Family",
        masterKeyEncrypted: "encrypted-key",
        masterKeyIv: "iv",
        masterKeySalt: "salt",
      },
    };

    (useRouteContext as Mock).mockImplementation(() => ({
      user: currentUser,
    }));

    // Setup initial sessionStorage state (which should be ignored now)
    sessionStorage.setItem("poohma_master_key_family-1", "existing-base64-key");

    let requireUnlockRef: (() => Promise<boolean>) | null = null;

    const TestComponent = () => {
      const { isLocked, masterKey, requireUnlock } = usePasscode();
      requireUnlockRef = requireUnlock;
      return (
        <div>
          <div data-testid="lock-status">
            {isLocked ? "Locked" : "Unlocked"}
          </div>
          <div data-testid="key-status">{masterKey ? "HasKey" : "NoKey"}</div>
        </div>
      );
    };

    const { rerender } = render(
      <PasscodeProvider>
        <TestComponent />
      </PasscodeProvider>,
    );

    // Should be locked initially on mount (sessionStorage is ignored)
    expect(screen.getByTestId("lock-status").textContent).toBe("Locked");
    expect(screen.getByTestId("key-status").textContent).toBe("NoKey");
    expect(cryptoLib.importKeyFromBase64).not.toHaveBeenCalled();

    // Now unlock it manually
    const mockDerivedKey = {} as CryptoKey;
    const mockUnwrappedKey = { type: "secret" } as unknown as CryptoKey;
    (cryptoLib.deriveKeyFromPasscode as Mock).mockResolvedValue(mockDerivedKey);
    (cryptoLib.unwrapMasterKey as Mock).mockResolvedValue(mockUnwrappedKey);

    // biome-ignore lint/style/noNonNullAssertion: testing ref is non-null
    requireUnlockRef!();
    await waitFor(() => {
      expect(screen.getByText("家族パスコードの入力")).toBeTruthy();
    });

    const input = screen.getByPlaceholderText("パスコード");
    fireEvent.change(input, { target: { value: "my-passcode" } });
    const submitButton = screen.getByRole("button", { name: "ロック解除" });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByTestId("lock-status").textContent).toBe("Unlocked");
      expect(screen.getByTestId("key-status").textContent).toBe("HasKey");
    });

    // Simulate logout by changing the mock context value before rerender
    currentUser = {
      familyId: null,
      family: null,
    } as unknown as typeof currentUser;

    rerender(
      <PasscodeProvider>
        <TestComponent />
      </PasscodeProvider>,
    );

    await waitFor(() => {
      // familyId is null, so isLocked should be false (Unlocked), but masterKey should be cleared (NoKey)
      expect(screen.getByTestId("lock-status").textContent).toBe("Unlocked");
      expect(screen.getByTestId("key-status").textContent).toBe("NoKey");
    });
  });
});

import { act } from "@testing-library/react";
import * as cryptoUtils from "@/lib/crypto";

describe("PasscodeProvider - decryptHint (Envelope Encryption Branching)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouteContext).mockReturnValue({
      user: {
        familyId: "family-1",
        family: {
          name: "Test Family",
          masterKeyEncrypted: "encrypted-key",
          masterKeyIv: "iv",
          masterKeySalt: "salt",
        },
      },
    });
  });

  it("【新方式】dekEncrypted と dekIv がある場合、unwrapDEK を経由して復号されること", async () => {
    // 0. 事前にアンロックに必要な鍵導出関数をスパイ・モック化
    const mockMasterKey = { tag: "mock-master-key" } as unknown as CryptoKey;
    vi.spyOn(cryptoUtils, "deriveKeyFromPasscode").mockResolvedValue(
      {} as CryptoKey,
    );
    vi.spyOn(cryptoUtils, "unwrapMasterKey").mockResolvedValue(mockMasterKey);

    // 1. 各暗号化関数の挙動をスパイ・モック化
    const unwrapDEKSpy = vi
      .spyOn(cryptoUtils, "unwrapDEK")
      .mockResolvedValue({} as CryptoKey);
    const decryptSpy = vi
      .spyOn(cryptoUtils, "decrypt")
      .mockResolvedValue("decrypted_hint_text");

    // 2. コンポーネントのレンダリング
    let resultContext: any;
    function TestComponent() {
      resultContext = usePasscode();
      return null;
    }

    render(
      <PasscodeProvider>
        <TestComponent />
      </PasscodeProvider>,
    );

    // 🔥 2.5. テスト実行前に unlock を呼び出して masterKey をセットする
    await act(async () => {
      await resultContext.unlock("dummy-passcode");
    });

    // 3. テスト対象メソッドの実行
    const decrypted = await resultContext.decryptHint(
      "encrypted_data",
      "iv_data",
      "dek_encrypted_data",
      "dek_iv_data",
    );

    // 4. アサーション
    expect(unwrapDEKSpy).toHaveBeenCalledWith(
      "dek_encrypted_data",
      "dek_iv_data",
      mockMasterKey, // 導出されたマスターキーが正しく渡されているか検証
    );
    expect(decryptSpy).toHaveBeenCalledWith(
      "encrypted_data",
      "iv_data",
      expect.anything(), // 復号された DEK が渡される
    );
    expect(decrypted).toBe("decrypted_hint_text");
  });

  it("【旧方式フォールバック】dekEncrypted がない場合、unwrapDEK を呼ばずに直接 masterKey で復号されること", async () => {
    // 0. 事前にアンロックに必要な鍵導出関数をスパイ・モック化
    const mockMasterKey = { tag: "mock-master-key" } as unknown as CryptoKey;
    vi.spyOn(cryptoUtils, "deriveKeyFromPasscode").mockResolvedValue(
      {} as CryptoKey,
    );
    vi.spyOn(cryptoUtils, "unwrapMasterKey").mockResolvedValue(mockMasterKey);

    const unwrapDEKSpy = vi.spyOn(cryptoUtils, "unwrapDEK");
    const decryptSpy = vi
      .spyOn(cryptoUtils, "decrypt")
      .mockResolvedValue("legacy_decrypted_hint_text");

    let resultContext: any;
    function TestComponent() {
      resultContext = usePasscode();
      return null;
    }

    render(
      <PasscodeProvider>
        <TestComponent />
      </PasscodeProvider>,
    );

    // 🔥 2.5. テスト実行前に unlock を呼び出して masterKey をセットする
    await act(async () => {
      await resultContext?.unlock("dummy-passcode");
    });

    const decrypted = await resultContext?.decryptHint(
      "legacy_encrypted_data",
      "legacy_iv_data",
    );

    expect(unwrapDEKSpy).not.toHaveBeenCalled();
    expect(decryptSpy).toHaveBeenCalledWith(
      "legacy_encrypted_data",
      "legacy_iv_data",
      mockMasterKey, // 旧方式なのでマスターキーが直接復号に使われるか検証
    );
    expect(decrypted).toBe("legacy_decrypted_hint_text");
  });
});
