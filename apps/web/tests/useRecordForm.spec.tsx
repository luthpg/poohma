// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRecordForm } from "@/hooks/useRecordForm";

vi.mock("convex/react", () => ({
  useAction: vi.fn(() => vi.fn().mockResolvedValue({})),
}));

const mockRequireUnlock = vi.fn().mockResolvedValue(true);
const mockEncryptHint = vi.fn();
let mockMasterKey: CryptoKey | null = null;

vi.mock("@/components/PasscodeProvider", () => ({
  usePasscode: () => ({
    masterKey: mockMasterKey,
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
    mockMasterKey = null;
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

  it("マウント時に masterKey がなければ requireUnlock を呼び出すこと", () => {
    mockMasterKey = null;
    renderHook(() => useRecordForm());
    expect(mockRequireUnlock).toHaveBeenCalled();
  });

  it("新規作成時（targetRecordId なし）は変更しても isFieldModified が常に false であること", () => {
    const { result } = renderHook(() => useRecordForm());

    act(() => {
      result.current.updateTitle("New Title");
      result.current.setUrl("https://new.com");
    });

    expect(result.current.isFieldModified("title")).toBe(false);
    expect(result.current.isFieldModified("url")).toBe(false);
  });

  it("編集時（targetRecordId あり）は初期値からの変更を正確に判定できること", () => {
    const initialValues = {
      title: "Google",
      url: "https://google.com",
      memo: "初期メモ",
      ownerType: "user" as const,
      tags: ["検索"],
      credentials: [
        {
          label: "メイン",
          loginId: "user@gmail.com",
          passwordHint: "初期ヒント",
        },
      ],
    };

    const { result } = renderHook(() =>
      useRecordForm(initialValues, "rec_123"),
    );

    // 初期状態では modified は false
    expect(result.current.isFieldModified("title")).toBe(false);
    expect(result.current.isFieldModified("url")).toBe(false);
    expect(result.current.isFieldModified("memo")).toBe(false);
    expect(result.current.isFieldModified("credential_0_loginId")).toBe(false);

    // タイトル変更
    act(() => {
      result.current.updateTitle("Google Updated");
    });
    expect(result.current.isFieldModified("title")).toBe(true);
    expect(result.current.isFieldModified("url")).toBe(false);

    // ログインID変更
    act(() => {
      result.current.updateCredentialField(0, "loginId", "newuser@gmail.com");
    });
    expect(result.current.isFieldModified("credential_0_loginId")).toBe(true);
    expect(result.current.isFieldModified("credential_0_passwordHint")).toBe(
      false,
    );
  });

  it("reset で復号ヒントが渡された場合、復号結果が新基準値となり初期状態では未変更と判定されること", () => {
    // 閲覧時（未復号ヒントは空文字で渡される）
    const initialValues = {
      title: "Google",
      credentials: [
        {
          label: "メイン",
          loginId: "user@gmail.com",
          passwordHint: "",
        },
      ],
    };

    const { result } = renderHook(() =>
      useRecordForm(initialValues, "rec_123"),
    );

    // 編集開始時に復号された平文ヒントで reset される
    act(() => {
      result.current.reset({
        title: "Google",
        credentials: [
          {
            label: "メイン",
            loginId: "user@gmail.com",
            passwordHint: "復号されたパスワードヒント",
          },
        ],
      });
    });

    // 復号結果が新基準値となったため、初期状態では false
    expect(result.current.isFieldModified("credential_0_passwordHint")).toBe(
      false,
    );

    // ユーザーがヒントを変更したときのみ true になる
    act(() => {
      result.current.updateCredentialField(
        0,
        "passwordHint",
        "変更されたヒント",
      );
    });
    expect(result.current.isFieldModified("credential_0_passwordHint")).toBe(
      true,
    );
  });

  it("discardDraft で clearRecordDraft が呼ばれること", async () => {
    const authRecovery = await import("@/lib/auth-recovery");
    const clearSpy = vi.spyOn(authRecovery, "clearRecordDraft");

    const { result } = renderHook(() =>
      useRecordForm(undefined, "rec_123", "draft_abc"),
    );

    act(() => {
      result.current.discardDraft();
    });

    expect(clearSpy).toHaveBeenCalledWith({
      targetRecordId: "rec_123",
      draftId: "draft_abc",
    });
  });

  it("masterKey が得られたときにドラフトがあれば自動復元されること", async () => {
    mockMasterKey = {} as CryptoKey;
    const authRecovery = await import("@/lib/auth-recovery");
    vi.spyOn(authRecovery, "loadRecordDraft").mockResolvedValue({
      values: {
        title: "Restored Service",
        titleReading: "りすとおど",
        url: "https://restored.com",
        ogpImage: "",
        ogpDescription: "",
        memo: "復元されたメモ",
        ownerType: "user",
        tags: ["テスト"],
        credentials: [
          {
            label: "メイン",
            loginId: "restored@example.com",
            passwordHint: "ヒント",
          },
        ],
      },
      initialRevision: 3,
      isEditing: true,
      accountId: "acc_123",
    });

    let hookResult: { current: ReturnType<typeof useRecordForm> } | undefined;
    await act(async () => {
      const { result } = renderHook(() =>
        useRecordForm(undefined, "rec_restore_test"),
      );
      hookResult = result;
    });

    expect(hookResult?.current.values.title).toBe("Restored Service");
    expect(hookResult?.current.values.credentials[0].loginId).toBe(
      "restored@example.com",
    );
    expect(hookResult?.current.restoredMetadata?.initialRevision).toBe(3);
    expect(hookResult?.current.restoredMetadata?.isEditing).toBe(true);
  });

  it("setBaselineValues で基準値が更新され、DBと同じヒントは未変更と判定されること", () => {
    // 閲覧時（未復号ヒントは空文字で渡される）
    const initialValues = {
      title: "Google",
      credentials: [
        {
          label: "メイン",
          loginId: "user@gmail.com",
          passwordHint: "",
        },
      ],
    };

    const { result } = renderHook(() =>
      useRecordForm(initialValues, "rec_123"),
    );

    // ドラフト復元等により値が復元された状態をシミュレート
    act(() => {
      result.current.updateCredentialField(
        0,
        "passwordHint",
        "復号されたパスワードヒント",
      );
    });

    // 基準値未同期時点では空文字と異なるため変更ありと判定される
    expect(result.current.isFieldModified("credential_0_passwordHint")).toBe(
      true,
    );

    // setBaselineValues で DB から復号された基準値を反映
    act(() => {
      result.current.setBaselineValues({
        title: "Google",
        credentials: [
          {
            label: "メイン",
            loginId: "user@gmail.com",
            passwordHint: "復号されたパスワードヒント",
          },
        ],
      });
    });

    // DB 基準値と一致するため未変更（消灯）と判定される
    expect(result.current.isFieldModified("credential_0_passwordHint")).toBe(
      false,
    );

    // ユーザーがさらにヒントを変更した場合は正しく点灯
    act(() => {
      result.current.updateCredentialField(
        0,
        "passwordHint",
        "さらに新しいヒント",
      );
    });
    expect(result.current.isFieldModified("credential_0_passwordHint")).toBe(
      true,
    );
  });

  it("マウント時にパスコード解除がキャンセルされた場合、onUnlockCancelled が呼ばれること", async () => {
    mockRequireUnlock.mockResolvedValueOnce(false);
    const onUnlockCancelled = vi.fn();

    // 新規作成画面（!targetRecordId）ではマウント時に requireUnlock が走る
    await act(async () => {
      renderHook(() =>
        useRecordForm(undefined, undefined, undefined, {
          onUnlockCancelled,
        }),
      );
    });

    expect(onUnlockCancelled).toHaveBeenCalledTimes(1);
  });

  it("編集中にオートロック（masterKey が null 化）しても、開始時アンロックが再発火しないこと", async () => {
    mockMasterKey = {} as CryptoKey;
    const { rerender } = renderHook(() =>
      useRecordForm(undefined, "rec_autolock_test"),
    );

    expect(mockRequireUnlock).not.toHaveBeenCalled();

    // 編集中にオートロック発火（masterKey が null になる）
    mockMasterKey = null;
    await act(async () => {
      rerender();
    });

    // 開始時アンロックが再発火してプロンプトが開くことはない
    expect(mockRequireUnlock).not.toHaveBeenCalled();
  });

  it("Aレコードの後にドラフトのあるBレコードへ切り替わった場合、Bレコードの初回アンロックが正常に走ること", async () => {
    mockMasterKey = {} as CryptoKey;
    const authRecovery = await import("@/lib/auth-recovery");
    vi.spyOn(authRecovery, "hasRecordDraft").mockImplementation(
      ({ targetRecordId }) => targetRecordId === "rec_B",
    );

    let currentRecordId = "rec_A";
    const { rerender } = renderHook(() =>
      useRecordForm(undefined, currentRecordId),
    );

    // Aレコード編集中にオートロック発火
    mockMasterKey = null;
    await act(async () => {
      rerender();
    });
    expect(mockRequireUnlock).not.toHaveBeenCalled();

    // Bレコード（ドラフトあり）へ切り替え
    currentRecordId = "rec_B";
    await act(async () => {
      rerender();
    });

    // Bレコード単位で初回アンロックが正しく走る
    expect(mockRequireUnlock).toHaveBeenCalledTimes(1);
  });
});
