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
      expect(cryptoLib.exportKeyToBase64).toHaveBeenCalledWith(
        mockUnwrappedKey,
      );
    });

    // The modal should close and state should be unlocked
    await waitFor(() => {
      expect(unlockResult).toBe(true);
      expect(screen.getByText("Unlocked")).toBeTruthy();
    });

    // Verify it was saved to sessionStorage
    expect(sessionStorage.getItem("poohma_master_key_family-1")).toBe(
      "base64-exported-key",
    );
  });

  it("should clear master key and sessionStorage when familyId changes or user logs out", async () => {
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

    // Setup initial sessionStorage state
    sessionStorage.setItem("poohma_master_key_family-1", "existing-base64-key");
    const mockImportedKey = { type: "secret" } as unknown as CryptoKey;
    (cryptoLib.importKeyFromBase64 as Mock).mockResolvedValue(mockImportedKey);

    const TestComponent = () => {
      const { isLocked } = usePasscode();
      return <div>{isLocked ? "Locked" : "Unlocked"}</div>;
    };

    const { rerender } = render(
      <PasscodeProvider>
        <TestComponent />
      </PasscodeProvider>,
    );

    // After mount, it should try to import key from sessionStorage
    await waitFor(() => {
      expect(cryptoLib.importKeyFromBase64).toHaveBeenCalledWith(
        "existing-base64-key",
      );
      expect(screen.getByText("Unlocked")).toBeTruthy();
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
      expect(sessionStorage.getItem("poohma_master_key_family-1")).toBeNull();
    });
  });
});
