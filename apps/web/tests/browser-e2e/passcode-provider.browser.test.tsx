import { useRouteContext } from "@tanstack/react-router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	type Mock,
	test,
	vi,
} from "vitest";
import { PasscodeProvider, usePasscode } from "@/components/PasscodeProvider";
import {
	deriveKeyFromPasscode,
	generateMasterKey,
	wrapMasterKey,
} from "@/lib/crypto";

vi.mock("@tanstack/react-router", () => ({
	useRouteContext: vi.fn(),
	useRouter: vi
		.fn()
		.mockReturnValue({ invalidate: vi.fn(), navigate: vi.fn() }),
	useNavigate: vi.fn().mockReturnValue(vi.fn()),
	Link: ({
		children,
		onClick,
		to,
	}: {
		children: React.ReactNode;
		onClick?: () => void;
		to: string;
	}) => (
		<a href={to} onClick={onClick}>
			{children}
		</a>
	),
}));

vi.mock("convex/react", () => ({
	useMutation: () => vi.fn().mockResolvedValue({ success: true }),
	useQuery: () => undefined,
	useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

vi.mock("@/services/security.functions", () => ({
	getClientRequestContext: vi.fn().mockResolvedValue({}),
}));

describe("PasscodeProvider (実ブラウザ Chromium UI結合)", () => {
	const testPasscode = "passcode-test-1234";
	const testSalt = "salt-test-987654";
	let realWrappedMasterKey: { encrypted: string; iv: string };

	beforeEach(async () => {
		sessionStorage.clear();
		localStorage.clear();

		// 実ブラウザの Web Crypto API で本物の暗号化データを生成
		const kek = await deriveKeyFromPasscode(testPasscode, testSalt);
		const masterKey = await generateMasterKey();
		realWrappedMasterKey = await wrapMasterKey(masterKey, kek);

		(useRouteContext as Mock).mockReturnValue({
			user: {
				_id: "user-1",
				familyId: "family-1",
				family: {
					name: "Test Family",
					masterKeyEncrypted: realWrappedMasterKey.encrypted,
					masterKeyIv: realWrappedMasterKey.iv,
					masterKeySalt: testSalt,
				},
			},
		});
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	test("初期状態はlockedであり、requireUnlockでダイアログ表示〜パスコード入力〜実復号まで完結する", async () => {
		const contextRef: { current: ReturnType<typeof usePasscode> | null } = {
			current: null,
		};

		const Consumer = () => {
			const passcodeContext = usePasscode();
			contextRef.current = passcodeContext;

			return (
				<div>
					<div data-testid="lock-status">
						{passcodeContext.isLocked ? "LOCKED" : "UNLOCKED"}
					</div>
					<button
						type="button"
						data-testid="unlock-trigger"
						onClick={() => passcodeContext.requireUnlock()}
					>
						Unlock Trigger
					</button>
				</div>
			);
		};

		render(
			<PasscodeProvider>
				<Consumer />
			</PasscodeProvider>,
		);

		// 1. 初期状態は LOCKED
		expect(screen.getByTestId("lock-status").textContent).toBe("LOCKED");

		// 2. requireUnlock() を実行するとアンロックダイアログが表示される
		fireEvent.click(screen.getByTestId("unlock-trigger"));

		await waitFor(() => {
			expect(screen.getByPlaceholderText(/パスコード/i)).toBeDefined();
		});

		// 3. 正しいパスコードを入力
		const input = screen.getByPlaceholderText(/パスコード/i);
		fireEvent.change(input, { target: { value: testPasscode } });

		// 4. アンロックボタンをクリック
		const submitButton = screen.getByRole("button", { name: "ロック解除" });
		fireEvent.click(submitButton);

		// 5. UNLOCKED に遷移することを確認
		await waitFor(() => {
			expect(screen.getByTestId("lock-status").textContent).toBe("UNLOCKED");
		});

		// 6. 暗号化 & 復号が実ブラウザ上で機能することを確認
		expect(contextRef.current).not.toBeNull();
		const currentContext = contextRef.current;
		if (!currentContext) {
			throw new Error("Context should be initialized");
		}

		const plainText = "秘密のマスターパスワード: 123456";
		const encryptedData = await currentContext.encryptHint(plainText);
		expect(encryptedData.encrypted).toBeTruthy();

		const decryptedText = await currentContext.decryptHint(
			encryptedData.encrypted,
			encryptedData.iv,
			encryptedData.dekEncrypted,
			encryptedData.dekIv,
		);
		expect(decryptedText).toBe(plainText);
	});
});
