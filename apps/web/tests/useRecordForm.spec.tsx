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

    expect(result.current.values.credentials[0]).toMatchObject({
      label: "メイン",
      loginId: "user@example.com",
      passwordHint: "hint123",
    });
  });

  it("初期生成されたcredentialに一意なIDが付与されていること", () => {
    const { result } = renderHook(() => useRecordForm());
    expect(result.current.values.credentials[0].id).toBeDefined();
    expect(typeof result.current.values.credentials[0].id).toBe("string");
    expect(result.current.values.credentials[0].id?.length).toBeGreaterThan(0);
  });

  it("addCredential で追加されたクレデンシャルに既存と重複しない一意なIDが付与されること", () => {
    const { result } = renderHook(() => useRecordForm());
    const initialId = result.current.values.credentials[0].id;

    act(() => result.current.addCredential());
    expect(result.current.values.credentials).toHaveLength(2);

    const newId = result.current.values.credentials[1].id;
    expect(newId).toBeDefined();
    expect(typeof newId).toBe("string");
    expect(newId).not.toBe(initialId);
  });

  it("複数credentialの中間行を削除した際、残ったcredentialのIDおよび値が正しく維持されること", () => {
    const { result } = renderHook(() => useRecordForm());

    // 1行目のフィールド設定
    act(() => {
      result.current.updateCredentialField(0, "label", "1行目");
      result.current.updateCredentialField(0, "loginId", "user1@example.com");
    });
    const id1 = result.current.values.credentials[0].id;

    // 2行目追加 & 設定
    act(() => result.current.addCredential());
    act(() => {
      result.current.updateCredentialField(1, "label", "2行目");
      result.current.updateCredentialField(1, "loginId", "user2@example.com");
    });
    const id2 = result.current.values.credentials[1].id;

    // 3行目追加 & 設定
    act(() => result.current.addCredential());
    act(() => {
      result.current.updateCredentialField(2, "label", "3行目");
      result.current.updateCredentialField(2, "loginId", "user3@example.com");
    });
    const id3 = result.current.values.credentials[2].id;

    expect(result.current.values.credentials).toHaveLength(3);

    // 中間行（index 1: 2行目）を削除
    act(() => result.current.removeCredential(1));

    expect(result.current.values.credentials).toHaveLength(2);

    // 削除後: 旧1行目と旧3行目が残っており、IDと値が完全に一致すること（キーや入力値のズレがないこと）
    expect(result.current.values.credentials[0]).toEqual({
      id: id1,
      label: "1行目",
      loginId: "user1@example.com",
      passwordHint: "",
    });
    expect(result.current.values.credentials[1]).toEqual({
      id: id3,
      label: "3行目",
      loginId: "user3@example.com",
      passwordHint: "",
    });
    expect(result.current.values.credentials.some((c) => c.id === id2)).toBe(
      false,
    );
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
    expect(hookResult?.current.values.credentials[0].id).toBeDefined();
    expect(typeof hookResult?.current.values.credentials[0].id).toBe("string");
    expect(hookResult?.current.restoredMetadata?.initialRevision).toBe(3);
    expect(hookResult?.current.restoredMetadata?.isEditing).toBe(true);
  });

  it("IDを持たない複数credentialを含むドラフト復元時に、各行に重複しない一意なIDが付与されること", async () => {
    mockMasterKey = {} as CryptoKey;
    const authRecovery = await import("@/lib/auth-recovery");
    vi.spyOn(authRecovery, "loadRecordDraft").mockResolvedValue({
      values: {
        title: "Multi Draft",
        titleReading: "まるち",
        url: "",
        ogpImage: "",
        ogpDescription: "",
        memo: "",
        ownerType: "user",
        tags: [],
        credentials: [
          { label: "1つ目", loginId: "u1@example.com", passwordHint: "" },
          { label: "2つ目", loginId: "u2@example.com", passwordHint: "" },
        ],
      },
      initialRevision: 1,
      isEditing: true,
      accountId: "acc_123",
    });

    let hookResult: { current: ReturnType<typeof useRecordForm> } | undefined;
    await act(async () => {
      const { result } = renderHook(() =>
        useRecordForm(undefined, "rec_multi_restore_test"),
      );
      hookResult = result;
    });

    const creds = hookResult?.current.values.credentials;
    expect(creds).toHaveLength(2);
    expect(creds?.[0].id).toBeDefined();
    expect(creds?.[1].id).toBeDefined();
    expect(creds?.[0].id).not.toBe(creds?.[1].id);
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

  it("reset 実行時に initialValuesJsonRef が更新され、復号ヒント反映直後に isDirty が false のままであること", () => {
    const { result } = renderHook(() =>
      useRecordForm({
        title: "Test",
        credentials: [
          {
            label: "メイン",
            loginId: "user@example.com",
            passwordHint: "",
          },
        ],
      }),
    );

    expect(result.current.isDirty).toBe(false);

    // 編集開始時に復号されたヒントを reset でセット
    act(() => {
      result.current.reset({
        title: "Test",
        credentials: [
          {
            label: "メイン",
            loginId: "user@example.com",
            passwordHint: "復号された平文ヒント",
          },
        ],
      });
    });

    // 基準値が同期されたため、isDirty は false のまま
    expect(result.current.isDirty).toBe(false);

    // ユーザーがフィールドを変更したときは isDirty が true になる
    act(() => {
      result.current.updateTitle("Updated Title");
    });
    expect(result.current.isDirty).toBe(true);
  });

  it("OGP 取得待機後に submit された場合、解決された OGP タイトルや画像が payload に正しく反映されること", async () => {
    const { useAction } = await import("convex/react");
    vi.mocked(useAction).mockReturnValue(
      vi.fn().mockResolvedValue({
        title: "OGP 取得タイトル",
        image: "https://example.com/ogp.jpg",
        description: "OGP 説明文",
      }),
    );

    const { result } = renderHook(() => useRecordForm());

    // URL を設定して handleUrlBlur をトリガー
    act(() => {
      result.current.setUrl("https://example.com");
    });

    let blurPromise: Promise<unknown>;
    act(() => {
      blurPromise = result.current.handleUrlBlur();
    });

    const submitAction = vi.fn().mockResolvedValue(undefined);

    // OGP 完了を待たずに即座に submit を呼ぶ
    let submitSuccess = false;
    await act(async () => {
      submitSuccess = await result.current.submit(submitAction);
      await blurPromise;
    });

    expect(submitSuccess).toBe(true);
    expect(submitAction).toHaveBeenCalledTimes(1);
    const submittedPayload = submitAction.mock.calls[0][0];
    expect(submittedPayload.title).toBe("OGP 取得タイトル");
    expect(submittedPayload.ogpImage).toBe("https://example.com/ogp.jpg");
    expect(submittedPayload.ogpDescription).toBe("OGP 説明文");
  });

  it("OGP 取得中に URL が変更されて submit された場合、以前の URL の OGP 結果が payload に混入しないこと", async () => {
    const { useAction } = await import("convex/react");
    let resolveOgpA: (value: unknown) => void;
    const ogpAPromise = new Promise((resolve) => {
      resolveOgpA = resolve;
    });

    const mockAction = vi.fn().mockImplementation(({ url }) => {
      if (url === "https://example-a.com") return ogpAPromise;
      return Promise.resolve({});
    });
    vi.mocked(useAction).mockReturnValue(mockAction);

    const { result } = renderHook(() => useRecordForm());

    // URL A を設定して blur（取得開始）
    act(() => {
      result.current.setUrl("https://example-a.com");
    });
    let blurPromise: Promise<unknown>;
    act(() => {
      blurPromise = result.current.handleUrlBlur();
    });

    // 取得完了前に URL B へ変更
    act(() => {
      result.current.setUrl("https://example-b.com");
    });

    const submitAction = vi.fn().mockResolvedValue(undefined);

    // URL B のまま blur せず即座に submit
    let submitSuccess = false;
    await act(async () => {
      submitSuccess = await result.current.submit(submitAction);
      // 後から URL A の OGP 取得が解決
      resolveOgpA?.({
        title: "Site A Title",
        image: "https://example-a.com/a.jpg",
        description: "Site A Desc",
      });
      await blurPromise;
    });

    expect(submitSuccess).toBe(true);
    expect(submitAction).toHaveBeenCalledTimes(1);
    const submittedPayload = submitAction.mock.calls[0][0];
    // URL B の payload に URL A の情報が一切混入していないこと
    expect(submittedPayload.url).toBe("https://example-b.com");
    expect(submittedPayload.title).toBe("");
    expect(submittedPayload.ogpImage).toBeUndefined();
    expect(submittedPayload.ogpDescription).toBeUndefined();
  });

  it("OGP 取得中に URL が空に変更されて submit された場合、以前の URL の OGP 結果が payload に混入しないこと", async () => {
    const { useAction } = await import("convex/react");
    let resolveOgpA: (value: unknown) => void;
    const ogpAPromise = new Promise((resolve) => {
      resolveOgpA = resolve;
    });

    const mockAction = vi.fn().mockImplementation(() => ogpAPromise);
    vi.mocked(useAction).mockReturnValue(mockAction);

    const { result } = renderHook(() => useRecordForm());

    act(() => {
      result.current.setUrl("https://example-a.com");
    });
    let blurPromise: Promise<unknown>;
    act(() => {
      blurPromise = result.current.handleUrlBlur();
    });

    // 取得完了前に URL を空に変更
    act(() => {
      result.current.setUrl("");
    });

    const submitAction = vi.fn().mockResolvedValue(undefined);

    let submitSuccess = false;
    await act(async () => {
      submitSuccess = await result.current.submit(submitAction);
      resolveOgpA?.({
        title: "Site A Title",
        image: "https://example-a.com/a.jpg",
        description: "Site A Desc",
      });
      await blurPromise;
    });

    expect(submitSuccess).toBe(true);
    const submittedPayload = submitAction.mock.calls[0][0];
    expect(submittedPayload.url).toBeUndefined();
    expect(submittedPayload.title).toBe("");
    expect(submittedPayload.ogpImage).toBeUndefined();
    expect(submittedPayload.ogpDescription).toBeUndefined();
  });

  it("URL A 取得中に URL B へ変更して blur した場合、遅延した URL A の結果が URL B のフォーム状態を上書きしないこと", async () => {
    const { useAction } = await import("convex/react");
    let resolveOgpA: (value: unknown) => void;
    const ogpAPromise = new Promise((resolve) => {
      resolveOgpA = resolve;
    });

    const mockAction = vi.fn().mockImplementation(({ url }) => {
      if (url === "https://example-a.com") return ogpAPromise;
      if (url === "https://example-b.com") {
        return Promise.resolve({
          title: "Site B Title",
          image: "https://example-b.com/b.jpg",
          description: "Site B Desc",
        });
      }
      return Promise.resolve({});
    });
    vi.mocked(useAction).mockReturnValue(mockAction);

    const { result } = renderHook(() => useRecordForm());

    // 1. URL A を入力して blur
    act(() => {
      result.current.setUrl("https://example-a.com");
    });
    let blurPromiseA: Promise<unknown>;
    act(() => {
      blurPromiseA = result.current.handleUrlBlur();
    });

    // 2. URL B に変更して blur（URL B は即座に解決）
    act(() => {
      result.current.setUrl("https://example-b.com");
    });
    await act(async () => {
      await result.current.handleUrlBlur();
    });

    // この時点で URL B の結果が反映されている
    expect(result.current.values.ogpImage).toBe("https://example-b.com/b.jpg");
    expect(result.current.values.ogpDescription).toBe("Site B Desc");
    expect(result.current.values.title).toBe("Site B Title");

    // 3. 遅れて URL A の Promise が解決
    await act(async () => {
      resolveOgpA?.({
        title: "Site A Title",
        image: "https://example-a.com/a.jpg",
        description: "Site A Desc",
      });
      await blurPromiseA;
    });

    // URL A の古い結果で上書きされず、URL B の状態が維持されていること
    expect(result.current.values.ogpImage).toBe("https://example-b.com/b.jpg");
    expect(result.current.values.ogpDescription).toBe("Site B Desc");
    expect(result.current.values.title).toBe("Site B Title");
  });

  it("既存レコード編集時、URL 未変更なら既存の ogpImage / ogpDescription が維持されること", async () => {
    const initialValues = {
      title: "Existing Service",
      url: "https://existing.com",
      ogpImage: "https://existing.com/existing.jpg",
      ogpDescription: "Existing description",
      credentials: [
        {
          label: "メイン",
          loginId: "user@example.com",
          passwordHint: "",
        },
      ],
    };

    const { result } = renderHook(() =>
      useRecordForm(initialValues, "rec_exist_test"),
    );

    // メモのみ変更
    act(() => {
      result.current.setMemo("新しいメモ");
    });

    const submitAction = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      await result.current.submit(submitAction);
    });

    expect(submitAction).toHaveBeenCalledTimes(1);
    const submittedPayload = submitAction.mock.calls[0][0];
    expect(submittedPayload.url).toBe("https://existing.com");
    expect(submittedPayload.ogpImage).toBe("https://existing.com/existing.jpg");
    expect(submittedPayload.ogpDescription).toBe("Existing description");
    expect(submittedPayload.memo).toBe("新しいメモ");
  });

  it("既存レコード編集時、URL を変更した場合は古い ogpImage / ogpDescription がクリアされ payload に混入しないこと", async () => {
    const initialValues = {
      title: "Existing Service",
      url: "https://old.com",
      ogpImage: "https://old.com/old.jpg",
      ogpDescription: "Old description",
      credentials: [
        {
          label: "メイン",
          loginId: "user@example.com",
          passwordHint: "",
        },
      ],
    };

    const { result } = renderHook(() =>
      useRecordForm(initialValues, "rec_url_change_test"),
    );

    // URL を new.com に変更（blur せず即 submit）
    act(() => {
      result.current.setUrl("https://new.com");
    });

    const submitAction = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      await result.current.submit(submitAction);
    });

    expect(submitAction).toHaveBeenCalledTimes(1);
    const submittedPayload = submitAction.mock.calls[0][0];
    expect(submittedPayload.url).toBe("https://new.com");
    expect(submittedPayload.ogpImage).toBeUndefined();
    expect(submittedPayload.ogpDescription).toBeUndefined();
  });

  it("ドラフトが存在したにもかかわらず loadRecordDraft が null（復号失敗等）を返した場合、toast.error が呼ばれること", async () => {
    mockMasterKey = {} as CryptoKey;
    const authRecovery = await import("@/lib/auth-recovery");
    vi.spyOn(authRecovery, "hasRecordDraft").mockReturnValue(true);
    vi.spyOn(authRecovery, "loadRecordDraft").mockResolvedValue(null);

    const { toast } = await import("sonner");

    await act(async () => {
      renderHook(() => useRecordForm(undefined, "rec_failed_restore"));
    });

    expect(toast.error).toHaveBeenCalledWith(
      "未保存の下書きの復元に失敗しました",
    );
  });
});
