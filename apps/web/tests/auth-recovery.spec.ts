// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRecordDraft,
  formatDraftAsText,
  getDraftStorageKey,
  hasRecordDraft,
  isAuthSessionError,
  loadRecordDraft,
  saveRecordDraft,
} from "@/lib/auth-recovery";
import { generateMasterKey } from "@/lib/crypto";

describe("auth-recovery", () => {
  const store: Record<string, string> = {};
  const mockStorage = {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      for (const key of Object.keys(store)) {
        delete store[key];
      }
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };

  beforeEach(() => {
    mockStorage.clear();
    vi.stubGlobal("localStorage", mockStorage);
    vi.restoreAllMocks();
  });

  describe("isAuthSessionError", () => {
    it("Convex の Unauthenticated エラーを正しく判定すること", () => {
      expect(
        isAuthSessionError(new Error("Unauthenticated call to Convex")),
      ).toBe(true);
      expect(
        isAuthSessionError(
          new Error("Unauthenticated: ユーザー認証が必要です"),
        ),
      ).toBe(true);
    });

    it("Convex の Unauthorized エラーを正しく判定すること", () => {
      expect(isAuthSessionError(new Error("Unauthorized"))).toBe(true);
      expect(isAuthSessionError("unauthorized request")).toBe(true);
    });

    it("Firebase Auth のトークン期限切れコードを正しく判定すること", () => {
      expect(
        isAuthSessionError({
          code: "auth/user-token-expired",
          message: "The user token has expired.",
        }),
      ).toBe(true);
      expect(
        isAuthSessionError({
          code: "auth/id-token-expired",
          message: "Firebase ID token has expired.",
        }),
      ).toBe(true);
      expect(
        isAuthSessionError({
          code: "auth/session-cookie-expired",
          message: "Session cookie expired.",
        }),
      ).toBe(true);
    });

    it("業務エラーやネットワーク通常エラーはセッション切れと判定しないこと", () => {
      expect(
        isAuthSessionError(new Error("CONFLICT: レコードが競合しました")),
      ).toBe(false);
      expect(isAuthSessionError(new Error("Validation failed"))).toBe(false);
      expect(isAuthSessionError(null)).toBe(false);
      expect(isAuthSessionError(undefined)).toBe(false);
    });
  });

  describe("【B案】saveRecordDraft & loadRecordDraft (DEK wrap & localStorage)", () => {
    const mockDraftValues = {
      title: "Netflix",
      titleReading: "ねっとふりっくす",
      url: "https://netflix.com",
      ogpImage: "",
      ogpDescription: "",
      memo: "個人用アカウント",
      ownerType: "user" as const,
      tags: ["動画", "サブスク"],
      credentials: [
        {
          label: "メイン",
          loginId: "user@example.com",
          passwordHint: "犬の名前+誕生日",
        },
      ],
    };

    it("短命DEKでヒントが暗号化され、masterKeyでラップされてlocalStorageに保存・復元されること", async () => {
      const masterKey = await generateMasterKey();

      await saveRecordDraft({
        targetRecordId: "record_123",
        values: mockDraftValues,
        masterKey,
        initialRevision: 2,
        isEditing: true,
        accountId: "user_abc",
      });

      // 保存キーを確認
      const storageKey = getDraftStorageKey("record_123");
      const rawStored = localStorage.getItem(storageKey);
      expect(rawStored).toBeTruthy();

      // パスワードヒントの平文が保存されていないことを確認（Invariants遵守）
      expect(rawStored).not.toContain("犬の名前+誕生日");
      expect(rawStored).toContain("passwordHintEncrypted");
      expect(rawStored).toContain("passwordHintDekEncrypted");

      // 復号・復元
      const restored = await loadRecordDraft({
        targetRecordId: "record_123",
        masterKey,
        currentAccountId: "user_abc",
      });

      expect(restored).not.toBeNull();
      expect(restored?.values.title).toBe("Netflix");
      expect(restored?.values.credentials[0].passwordHint).toBe(
        "犬の名前+誕生日",
      );
      expect(restored?.initialRevision).toBe(2);
      expect(restored?.isEditing).toBe(true);
    });

    it("draftId により他タブの新規作成ドラフトとスコープ分離されること", async () => {
      const masterKey = await generateMasterKey();

      // タブAの新規作成
      await saveRecordDraft({
        draftId: "tab_A_uuid",
        values: { ...mockDraftValues, title: "Tab A Service" },
        masterKey,
        accountId: "user_abc",
      });

      // タブBの新規作成
      await saveRecordDraft({
        draftId: "tab_B_uuid",
        values: { ...mockDraftValues, title: "Tab B Service" },
        masterKey,
        accountId: "user_abc",
      });

      // 各タブが自身のドラフトのみを独立して取得できること
      const draftA = await loadRecordDraft({
        draftId: "tab_A_uuid",
        masterKey,
        currentAccountId: "user_abc",
      });
      const draftB = await loadRecordDraft({
        draftId: "tab_B_uuid",
        masterKey,
        currentAccountId: "user_abc",
      });

      expect(draftA?.values.title).toBe("Tab A Service");
      expect(draftB?.values.title).toBe("Tab B Service");

      // 存在判定も独立していること
      expect(hasRecordDraft({ draftId: "tab_A_uuid" })).toBe(true);
      expect(hasRecordDraft({ draftId: "tab_B_uuid" })).toBe(true);
      expect(hasRecordDraft({ draftId: "tab_C_unknown" })).toBe(false);
    });

    it("clearRecordDraft で明示的に物理破棄できること（キャンセル時・保存時）", async () => {
      const masterKey = await generateMasterKey();
      await saveRecordDraft({
        draftId: "draft_cancel_test",
        values: mockDraftValues,
        masterKey,
        accountId: "user_abc",
      });
      expect(hasRecordDraft({ draftId: "draft_cancel_test" })).toBe(true);

      clearRecordDraft({ draftId: "draft_cancel_test" });
      expect(hasRecordDraft({ draftId: "draft_cancel_test" })).toBe(false);
    });

    it("有効期限（24時間）が切れているドラフトは破棄され null を返すこと", async () => {
      const masterKey = await generateMasterKey();
      await saveRecordDraft({
        draftId: "draft_ttl_test",
        values: mockDraftValues,
        masterKey,
        accountId: "user_abc",
      });

      // 25時間後に進める
      const future = Date.now() + 25 * 60 * 60 * 1000;
      vi.spyOn(Date, "now").mockReturnValue(future);

      const restored = await loadRecordDraft({
        draftId: "draft_ttl_test",
        masterKey,
        currentAccountId: "user_abc",
      });
      expect(restored).toBeNull();
      expect(hasRecordDraft({ draftId: "draft_ttl_test" })).toBe(false);
    });

    it("accountId が null または未指定の場合は保存を抑止すること (CR-18)", async () => {
      const masterKey = await generateMasterKey();
      await saveRecordDraft({
        draftId: "draft_null_account_test",
        values: mockDraftValues,
        masterKey,
        accountId: null,
      });
      expect(hasRecordDraft({ draftId: "draft_null_account_test" })).toBe(
        false,
      );

      await saveRecordDraft({
        draftId: "draft_undefined_account_test",
        values: mockDraftValues,
        masterKey,
      });
      expect(hasRecordDraft({ draftId: "draft_undefined_account_test" })).toBe(
        false,
      );
    });

    it("保存時の accountId と異なる currentAccountId や null では復元せず null を返すこと (CR-9 / CR-NIT-1 / CR-18)", async () => {
      const masterKey = await generateMasterKey();
      await saveRecordDraft({
        draftId: "draft_account_boundary_test",
        values: mockDraftValues,
        masterKey,
        accountId: "account_user_1",
      });

      // 異なる accountId
      const mismatch = await loadRecordDraft({
        draftId: "draft_account_boundary_test",
        masterKey,
        currentAccountId: "account_user_2",
      });
      expect(mismatch).toBeNull();

      // currentAccountId が未解決（null）
      const nullAccount = await loadRecordDraft({
        draftId: "draft_account_boundary_test",
        masterKey,
        currentAccountId: null,
      });
      expect(nullAccount).toBeNull();

      // 正しい accountId
      const match = await loadRecordDraft({
        draftId: "draft_account_boundary_test",
        masterKey,
        currentAccountId: "account_user_1",
      });
      expect(match).not.toBeNull();
      expect(match?.values.title).toBe("Netflix");
    });

    it("暗号化ヒントの復号（unwrapDEK / decrypt）に失敗した場合は空文字で成功扱いとせず、null を返してドラフトを破棄すること", async () => {
      const correctMasterKey = await generateMasterKey();
      const wrongMasterKey = await generateMasterKey();

      await saveRecordDraft({
        draftId: "draft_decrypt_failure_test",
        values: mockDraftValues,
        masterKey: correctMasterKey,
        accountId: "user_abc",
      });
      expect(hasRecordDraft({ draftId: "draft_decrypt_failure_test" })).toBe(
        true,
      );

      // 異なる（不正な）masterKey で復号を試みる
      const failed = await loadRecordDraft({
        draftId: "draft_decrypt_failure_test",
        masterKey: wrongMasterKey,
        currentAccountId: "user_abc",
      });

      // 空文字ヒントで成功扱いにならず、null を返すこと
      expect(failed).toBeNull();

      // 破損・復号不可ドラフトはクリーンアップ（破棄）されること
      expect(hasRecordDraft({ draftId: "draft_decrypt_failure_test" })).toBe(
        false,
      );
    });
  });

  describe("formatDraftAsText", () => {
    it("フォーム入力内容をメモ帳用の見やすいプレーンテキストに整形すること", () => {
      const text = formatDraftAsText({
        title: "Amazon",
        titleReading: "あまぞん",
        url: "https://amazon.co.jp",
        ogpImage: "",
        ogpDescription: "",
        memo: "買い物用メモ",
        ownerType: "user",
        tags: ["EC", "通販"],
        credentials: [
          {
            label: "個人",
            loginId: "user@example.com",
            passwordHint: "猫の好物",
          },
        ],
      });

      expect(text).toContain("【サービス名】 Amazon");
      expect(text).toContain("【ふりがな】 あまぞん");
      expect(text).toContain("【URL】 https://amazon.co.jp");
      expect(text).toContain("【タグ】 EC, 通販");
      expect(text).toContain("【メモ】\n買い物用メモ");
      expect(text).toContain("ログインID: user@example.com");
      expect(text).toContain("パスワードヒント: 猫の好物");
    });
  });
});
