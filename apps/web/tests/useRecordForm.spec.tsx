// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRecordForm } from "@/hooks/useRecordForm";

vi.mock("convex/react", () => ({
	useAction: vi.fn(() => vi.fn().mockResolvedValue({})),
}));

const mockRequireUnlock = vi.fn();
const mockEncryptHint = vi.fn();
vi.mock("@/components/PasscodeProvider", () => ({
	usePasscode: () => ({
		masterKey: null,
		requireUnlock: mockRequireUnlock,
		encryptHint: mockEncryptHint,
	}),
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

describe("useRecordForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("credentialの追加・削除ができること", () => {
		const { result } = renderHook(() => useRecordForm());
		expect(result.current.values.credentials).toHaveLength(1);

		act(() => result.current.addCredential());
		expect(result.current.values.credentials).toHaveLength(2);

		act(() => result.current.removeCredential(0));
		expect(result.current.values.credentials).toHaveLength(1);
	});

	it("最後の1件は削除できないこと", () => {
		const { result } = renderHook(() => useRecordForm());
		act(() => result.current.removeCredential(0));
		expect(result.current.values.credentials).toHaveLength(1);
	});

	it("credentialフィールドの更新ができること", () => {
		const { result } = renderHook(() => useRecordForm());
		act(() => {
			result.current.updateCredentialField(0, "label", "メイン");
			result.current.updateCredentialField(0, "loginId", "user@example.com");
			result.current.updateCredentialField(0, "passwordHint", "hint123");
		});

		expect(result.current.values.credentials[0]).toEqual({
			label: "メイン",
			loginId: "user@example.com",
			passwordHint: "hint123",
		});
	});

	it("既存credentialのidはsubmit時に保持され、新規はUUIDが割り当てられること", async () => {
		mockRequireUnlock.mockResolvedValue(true);
		mockEncryptHint.mockResolvedValue({
			encrypted: "enc",
			iv: "iv",
			dekEncrypted: "dek",
			dekIv: "dekIv",
		});

		const { result } = renderHook(() =>
			useRecordForm({
				title: "Netflix",
				credentials: [
					{
						id: "existing-id",
						label: "テスト",
						loginId: "test",
						passwordHint: "hint",
					},
				],
			}),
		);

		const action = vi.fn().mockResolvedValue(undefined);
		let submitResult: boolean | undefined;
		await act(async () => {
			submitResult = await result.current.submit(action);
		});

		expect(submitResult).toBe(true);
		expect(action).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Netflix",
				credentials: [
					expect.objectContaining({
						id: "existing-id",
						passwordHint: "enc",
						passwordHintIv: "iv",
					}),
				],
			}),
		);
	});

	it("ロック解除がキャンセルされた場合、送信アクションは呼ばれず false を返すこと", async () => {
		mockRequireUnlock.mockResolvedValue(false);
		const { result } = renderHook(() =>
			useRecordForm({
				title: "Netflix",
				credentials: [{ label: "", loginId: "", passwordHint: "hint" }],
			}),
		);

		const action = vi.fn();
		let submitResult: boolean | undefined;
		await act(async () => {
			submitResult = await result.current.submit(action);
		});

		expect(action).not.toHaveBeenCalled();
		expect(submitResult).toBe(false);
	});

	it("バリデーションエラー時は送信アクションを呼ばないこと", async () => {
		const { result } = renderHook(() =>
			useRecordForm({
				title: "Netflix",
				memo: "a".repeat(10001),
			}),
		);

		const action = vi.fn();
		let submitResult: boolean | undefined;
		await act(async () => {
			submitResult = await result.current.submit(action);
		});

		expect(action).not.toHaveBeenCalled();
		expect(submitResult).toBe(false);
	});

	it("resetでフォーム値が再初期化されること", () => {
		const { result } = renderHook(() =>
			useRecordForm({
				title: "Initial",
			}),
		);
		expect(result.current.values.title).toBe("Initial");

		act(() => {
			result.current.reset({
				title: "Reset Title",
				ownerType: "family",
			});
		});

		expect(result.current.values.title).toBe("Reset Title");
		expect(result.current.values.ownerType).toBe("family");
	});
});
