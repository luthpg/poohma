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
import { toast } from "sonner";
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
import * as biometricLib from "@/lib/biometric";
import * as cryptoLib from "@/lib/crypto";

vi.mock("@tanstack/react-router", () => ({
	useRouteContext: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock("@/lib/biometric", () => ({
	isBiometricSupported: vi.fn().mockResolvedValue(true),
	isBiometricEnabledForUser: vi.fn().mockResolvedValue(false),
	decryptPasscodeWithBiometrics: vi.fn(),
	disableBiometricUnlock: vi.fn(),
	registerBiometricUnlock: vi.fn(),
}));

vi.mock("@/lib/crypto", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/crypto")>();
	return {
		...actual,
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
				300_000,
				1,
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

	it("family に kdfIterations / cryptoVersion が設定されている場合、その値で deriveKeyFromPasscode が呼ばれること", async () => {
		(useRouteContext as Mock).mockReturnValue({
			user: {
				familyId: "family-1",
				family: {
					name: "Test Family",
					masterKeyEncrypted: "encrypted-key",
					masterKeyIv: "iv",
					masterKeySalt: "salt",
					kdfIterations: 500_000,
					cryptoVersion: 1,
				},
			},
		});

		const mockDerivedKey = {} as CryptoKey;
		const mockUnwrappedKey = { type: "secret" } as unknown as CryptoKey;

		(cryptoLib.deriveKeyFromPasscode as Mock).mockResolvedValue(mockDerivedKey);
		(cryptoLib.unwrapMasterKey as Mock).mockResolvedValue(mockUnwrappedKey);

		let requireUnlockRef: (() => Promise<boolean>) | null = null;

		const TestComponent = () => {
			const { requireUnlock } = usePasscode();
			requireUnlockRef = requireUnlock;
			return <div>Test</div>;
		};

		render(
			<PasscodeProvider>
				<TestComponent />
			</PasscodeProvider>,
		);

		// biome-ignore lint/style/noNonNullAssertion: use non-null assertion for testing
		requireUnlockRef!();

		await waitFor(() => {
			expect(screen.getByText("家族パスコードの入力")).toBeTruthy();
		});

		const input = screen.getByPlaceholderText("パスコード");
		fireEvent.change(input, { target: { value: "my-passcode" } });
		const submitButton = screen.getByRole("button", { name: "ロック解除" });
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(cryptoLib.deriveKeyFromPasscode).toHaveBeenCalledWith(
				"my-passcode",
				"salt",
				500_000,
				1,
			);
		});
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
		let resultContext!: ReturnType<typeof usePasscode>;
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

		let resultContext!: ReturnType<typeof usePasscode>;
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

describe("PasscodeProvider - 誤入力時の指数バックオフ・ロックアウト", () => {
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
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	const setup = async () => {
		let requireUnlockRef: (() => Promise<boolean>) | null = null;
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
		// biome-ignore lint/style/noNonNullAssertion: requireUnlockRef はセットされることが保証されている
		requireUnlockRef!();
		await waitFor(() => {
			expect(screen.getByText("家族パスコードの入力")).toBeTruthy();
		});
		return {
			input: screen.getByPlaceholderText("パスコード"),
			submitButton: () => screen.getByRole("button", { name: "ロック解除" }),
		};
	};

	it("3回連続で誤入力するとロックアウトされ、送信ボタンが非活性化されること", async () => {
		(cryptoLib.deriveKeyFromPasscode as Mock).mockResolvedValue(
			{} as CryptoKey,
		);
		(cryptoLib.unwrapMasterKey as Mock).mockRejectedValue(
			new Error("bad passcode"),
		);
		const { input, submitButton } = await setup();

		for (let i = 0; i < 2; i++) {
			fireEvent.change(input, { target: { value: "wrong" } });
			await act(async () => {
				fireEvent.click(submitButton());
			});
		}
		expect(submitButton().hasAttribute("disabled")).toBe(false);

		fireEvent.change(input, { target: { value: "wrong" } });
		await act(async () => {
			fireEvent.click(submitButton());
		});

		expect(submitButton().hasAttribute("disabled")).toBe(true);
	}, 10000);

	it("ロックアウト解除後は再試行でき、成功時に失敗カウントがリセットされること", async () => {
		(cryptoLib.deriveKeyFromPasscode as Mock).mockResolvedValue(
			{} as CryptoKey,
		);
		(cryptoLib.unwrapMasterKey as Mock).mockRejectedValue(
			new Error("bad passcode"),
		);
		const { input, submitButton } = await setup();

		for (let i = 0; i < 3; i++) {
			fireEvent.change(input, { target: { value: "wrong" } });
			await act(async () => {
				fireEvent.click(submitButton());
			});
		}
		expect(submitButton().hasAttribute("disabled")).toBe(true);

		// 3回目失敗時の遅延(1秒)を実時間で待つ
		await waitFor(
			() => {
				expect(submitButton().hasAttribute("disabled")).toBe(false);
			},
			{ timeout: 3000 },
		);

		(cryptoLib.unwrapMasterKey as Mock).mockResolvedValue({
			type: "secret",
		} as unknown as CryptoKey);
		fireEvent.change(input, { target: { value: "correct-passcode" } });
		await act(async () => {
			fireEvent.click(submitButton());
		});

		await waitFor(() => {
			expect(screen.getByText("Unlocked")).toBeTruthy();
		});
	}, 10000);

	it("キャンセル後も失敗回数が保持され、3回目の失敗でロックアウトが発動すること（回避攻撃の防止）", async () => {
		(cryptoLib.deriveKeyFromPasscode as Mock).mockResolvedValue(
			{} as CryptoKey,
		);
		(cryptoLib.unwrapMasterKey as Mock).mockRejectedValue(
			new Error("bad passcode"),
		);

		let requireUnlockRef: (() => Promise<boolean>) | null = null;
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

		// 1回目の失敗
		// biome-ignore lint/style/noNonNullAssertion: requireUnlockRef はセットされることが保証されている
		requireUnlockRef!();
		await waitFor(() => {
			expect(screen.getByText("家族パスコードの入力")).toBeTruthy();
		});
		const input = screen.getByPlaceholderText("パスコード");
		const getSubmitButton = () =>
			screen.getByRole("button", { name: "ロック解除" });
		fireEvent.change(input, { target: { value: "wrong1" } });
		await act(async () => {
			fireEvent.click(getSubmitButton());
		});

		// 2回目の失敗
		fireEvent.change(input, { target: { value: "wrong2" } });
		await act(async () => {
			fireEvent.click(getSubmitButton());
		});

		// ダイアログをキャンセル
		const cancelButton = screen.getByRole("button", { name: "キャンセル" });
		await act(async () => {
			fireEvent.click(cancelButton);
		});

		// ダイアログが閉じることを確認
		await waitFor(() => {
			expect(screen.queryByText("家族パスコードの入力")).toBeNull();
		});

		// 再度ダイアログを開く
		// biome-ignore lint/style/noNonNullAssertion: requireUnlockRef はセットされることが保証されている
		requireUnlockRef!();
		await waitFor(() => {
			expect(screen.getByText("家族パスコードの入力")).toBeTruthy();
		});

		// 3回目の失敗 → ロックアウトが発動するはず
		fireEvent.change(input, { target: { value: "wrong3" } });
		await act(async () => {
			fireEvent.click(getSubmitButton());
		});

		// 送信ボタンが非活性化されていることを確認（ロックアウトされている）
		await waitFor(() => {
			expect(getSubmitButton().hasAttribute("disabled")).toBe(true);
		});
	}, 10000);
});

describe("PasscodeProvider - 生体認証ロック解除とパスコード変更時の自動解除", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
		vi.mocked(useRouteContext).mockReturnValue({
			user: {
				id: "user-123",
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

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("生体認証でのパスコード復号成功後にマスターキー復号（unlock）が失敗した場合、生体認証データを削除して再登録案内を表示すること", async () => {
		vi.mocked(biometricLib.isBiometricSupported).mockResolvedValue(true);
		vi.mocked(biometricLib.isBiometricEnabledForUser).mockResolvedValue(true);
		vi.mocked(biometricLib.decryptPasscodeWithBiometrics).mockResolvedValue(
			"old-passcode",
		);
		// パスコードが変更されているためマスターキー復号に失敗
		(cryptoLib.deriveKeyFromPasscode as Mock).mockResolvedValue(
			{} as CryptoKey,
		);
		(cryptoLib.unwrapMasterKey as Mock).mockRejectedValue(
			new Error("bad master key or invalid passcode"),
		);

		let requireUnlockRef: (() => Promise<boolean>) | null = null;
		const TestComponent = () => {
			const { requireUnlock } = usePasscode();
			requireUnlockRef = requireUnlock;
			return <div>Test</div>;
		};

		render(
			<PasscodeProvider>
				<TestComponent />
			</PasscodeProvider>,
		);

		// ダイアログを開く
		// biome-ignore lint/style/noNonNullAssertion: testing ref is non-null
		requireUnlockRef!();

		await waitFor(() => {
			expect(screen.getByText("家族パスコードの入力")).toBeTruthy();
		});

		const biometricButton = screen.getByRole("button", {
			name: /指紋 \/ FaceID でロック解除/i,
		});
		expect(biometricButton).toBeTruthy();

		await act(async () => {
			fireEvent.click(biometricButton);
		});

		await waitFor(() => {
			expect(biometricLib.decryptPasscodeWithBiometrics).toHaveBeenCalledWith(
				"user-123",
			);
			// 生体認証保持データの削除が呼ばれること
			expect(biometricLib.disableBiometricUnlock).toHaveBeenCalledWith(
				"user-123",
			);
			// 再登録の案内トーストが表示されること
			expect(toast.error).toHaveBeenCalledWith(
				"家族パスコードが変更された可能性があるため、保存された生体認証を解除しました。新しいパスコードでロック解除後、生体認証を再登録してください。",
			);
		});
	});

	it("生体認証がキャンセル（NotAllowedError）された場合は生体認証データを削除しないこと", async () => {
		vi.mocked(biometricLib.isBiometricSupported).mockResolvedValue(true);
		vi.mocked(biometricLib.isBiometricEnabledForUser).mockResolvedValue(true);
		const cancelError = new Error("User canceled");
		cancelError.name = "NotAllowedError";
		vi.mocked(biometricLib.decryptPasscodeWithBiometrics).mockRejectedValue(
			cancelError,
		);

		let requireUnlockRef: (() => Promise<boolean>) | null = null;
		const TestComponent = () => {
			const { requireUnlock } = usePasscode();
			requireUnlockRef = requireUnlock;
			return <div>Test</div>;
		};

		render(
			<PasscodeProvider>
				<TestComponent />
			</PasscodeProvider>,
		);

		// biome-ignore lint/style/noNonNullAssertion: testing ref is non-null
		requireUnlockRef!();

		await waitFor(() => {
			expect(screen.getByText("家族パスコードの入力")).toBeTruthy();
		});

		const biometricButton = screen.getByRole("button", {
			name: /指紋 \/ FaceID でロック解除/i,
		});

		await act(async () => {
			fireEvent.click(biometricButton);
		});

		await waitFor(() => {
			expect(biometricLib.decryptPasscodeWithBiometrics).toHaveBeenCalledWith(
				"user-123",
			);
			// キャンセル時は削除されないこと
			expect(biometricLib.disableBiometricUnlock).not.toHaveBeenCalled();
		});
	});
});
