import { beforeEach, describe, expect, it, vi } from "vitest";

// WXT auto-import mock
// @ts-expect-error global stub
globalThis.defineBackground = (fn: unknown) => fn;

let mockStore: Record<string, unknown> = {};

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    setAuth = vi.fn();
    query = (...args: unknown[]) => queryMock(...args);
  },
}));

vi.mock("@/lib/auth", () => ({
  getValidIdToken: vi.fn(async () => "valid_token"),
  getAuthStorage: vi.fn(async () => mockStore),
  clearAuthSession: vi.fn(async () => {
    mockStore = {};
  }),
  exchangeCustomToken: vi.fn(),
  setAuthSession: vi.fn(),
}));

describe("Extension Background syncSessionState Deduping and Race Prevention", () => {
  beforeEach(() => {
    vi.resetModules();
    mockStore = {
      user: { _id: "user_1", userId: "uid_1" },
      activeAccountId: "user_1",
      family: {
        _id: "fam_1",
        name: "Old Family",
        masterKeyEncrypted: "old_enc",
      },
    };

    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (keys: string[]) => {
            const res: Record<string, unknown> = {};
            for (const k of keys) {
              if (k in mockStore) res[k] = mockStore[k];
            }
            return res;
          }),
          set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(mockStore, items);
          }),
          remove: vi.fn(async (keys: string[]) => {
            for (const k of keys) delete mockStore[k];
          }),
          setAccessLevel: vi.fn(async () => {}),
        },
        onChanged: {
          addListener: vi.fn(),
        },
      },
      runtime: {
        id: "ext_id",
        getURL: vi.fn((path: string) => `chrome-extension://ext_id/${path}`),
        sendMessage: vi.fn(async () => {}),
        onMessage: { addListener: vi.fn() },
      },
      tabs: {
        onUpdated: { addListener: vi.fn() },
        onActivated: { addListener: vi.fn() },
        onRemoved: { addListener: vi.fn() },
      },
      action: {
        setBadgeText: vi.fn(async () => {}),
        setBadgeBackgroundColor: vi.fn(async () => {}),
      },
    });

    queryMock.mockReset();
  });

  it("dedupes concurrent calls to syncSessionState into a single query", async () => {
    let resolveQuery: (val: unknown) => void = () => {};
    queryMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveQuery = resolve;
        }),
    );

    const { syncSessionState } = await import("../entrypoints/background");

    const p1 = syncSessionState();
    const p2 = syncSessionState();

    // 非同期タスクの microtask を待機
    await new Promise((r) => setTimeout(r, 10));

    expect(queryMock).toHaveBeenCalledTimes(1);

    resolveQuery({
      user: { _id: "user_1", userId: "uid_1" },
      accounts: [{ _id: "user_1" }],
      family: {
        _id: "fam_1",
        name: "Updated Family",
        masterKeyEncrypted: "new_enc",
      },
    });

    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1).toBe(true);
    expect(res2).toBe(true);
    expect((mockStore.family as { name: string })?.name).toBe("Updated Family");
  });

  it("drops stale sync result if storage activeAccount or user changes before completion", async () => {
    let resolveQuery: (val: unknown) => void = () => {};
    queryMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveQuery = resolve;
        }),
    );

    const { syncSessionState } = await import("../entrypoints/background");

    const syncPromise = syncSessionState();

    await new Promise((r) => setTimeout(r, 10));

    // 取得待機中にログアウトまたは別アカウントに切り替わった状態をシミュレート
    mockStore.user = null;
    mockStore.activeAccountId = null;

    resolveQuery({
      user: { _id: "user_1", userId: "uid_1" },
      accounts: [{ _id: "user_1" }],
      family: { _id: "fam_1", name: "Stale Overwrite Attempt" },
    });

    const res = await syncPromise;
    expect(res).toBe(false);
    expect(mockStore.user).toBeNull();
  });

  it("fails GET_ALL_RECORDS and returns empty records if syncSessionState fails", async () => {
    let capturedHandler:
      | ((
          message: { type: string },
          sender: unknown,
          sendResponse: (res: { success: boolean; records: unknown[] }) => void,
        ) => boolean | undefined)
      | null = null;

    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async () => mockStore),
          set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(mockStore, items);
          }),
          remove: vi.fn(async () => {}),
          setAccessLevel: vi.fn(async () => {}),
        },
        onChanged: { addListener: vi.fn() },
      },
      runtime: {
        id: "ext_id",
        getURL: vi.fn((path: string) => `chrome-extension://ext_id/${path}`),
        sendMessage: vi.fn(async () => {}),
        onMessage: {
          addListener: vi.fn((handler) => {
            capturedHandler = handler;
          }),
        },
      },
      tabs: {
        onUpdated: { addListener: vi.fn() },
        onActivated: { addListener: vi.fn() },
        onRemoved: { addListener: vi.fn() },
      },
      action: {
        setBadgeText: vi.fn(async () => {}),
        setBadgeBackgroundColor: vi.fn(async () => {}),
      },
    });

    queryMock.mockRejectedValue(new Error("Convex query failed"));

    const bg = await import("../entrypoints/background");
    if (typeof bg.default === "function") {
      (bg.default as () => void)();
    }

    expect(capturedHandler).toBeDefined();

    const responsePromise = new Promise<{
      success: boolean;
      records: unknown[];
    }>((resolve) => {
      capturedHandler!({ type: "GET_ALL_RECORDS" }, {}, resolve);
    });

    const res = await responsePromise;
    expect(res.success).toBe(false);
    expect(res.records).toEqual([]);
  });
});
