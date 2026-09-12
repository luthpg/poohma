// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/../convex/_generated/api";
import {
  clearQueryCache,
  getQueryFunctionKey,
  usePersistentQuery,
} from "@/hooks/usePersistentQuery";

// convex/react モック
let mockIsAuthenticated = true;
const mockUseQueryResults = new Map<string, unknown>();

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: mockIsAuthenticated }),
  useQuery: (query: unknown, args: unknown) => {
    const fnKey = getQueryFunctionKey(query);
    const fullKey = JSON.stringify({ query: fnKey, args });
    return mockUseQueryResults.get(fullKey);
  },
}));

describe("usePersistentQuery", () => {
  beforeEach(() => {
    clearQueryCache();
    mockIsAuthenticated = true;
    mockUseQueryResults.clear();
  });

  describe("getQueryFunctionKey", () => {
    it("Convex の FunctionReference から正確な関数名を抽出できる", () => {
      const recordsKey = getQueryFunctionKey(api.records.getRecords);
      const tagsKey = getQueryFunctionKey(api.records.getAvailableTags);

      expect(recordsKey).toBe("records:getRecords");
      expect(tagsKey).toBe("records:getAvailableTags");
      expect(recordsKey).not.toBe(tagsKey);
    });

    it("文字列または _path オブジェクトからも正しく抽出できる", () => {
      expect(getQueryFunctionKey("records:getRecords")).toBe(
        "records:getRecords",
      );
      expect(getQueryFunctionKey({ _path: "records:customQuery" })).toBe(
        "records:customQuery",
      );
      expect(
        getQueryFunctionKey({
          [Symbol.for("toReferencePath")]: "records:componentQuery",
        }),
      ).toBe("records:componentQuery");
      expect(getQueryFunctionKey({ foo: "bar" })).toBe(
        JSON.stringify({ foo: "bar" }),
      );
    });
  });

  describe("キャッシュの独立性とフォールバック", () => {
    it("同一引数の異なるクエリ関数間でキャッシュが衝突・汚染されないこと", () => {
      const args = { accountId: "account_123" };

      // 1. records.getRecords のクエリ結果を設定
      const mockRecords = [
        { _id: "rec_1", title: "Amazon", ownerType: "user" },
      ];
      const recordsKey = JSON.stringify({
        query: getQueryFunctionKey(api.records.getRecords),
        args,
      });
      mockUseQueryResults.set(recordsKey, mockRecords);

      // 2. records.getAvailableTags のクエリ結果を設定
      const mockTags = ["shopping", "entertainment"];
      const tagsKey = JSON.stringify({
        query: getQueryFunctionKey(api.records.getAvailableTags),
        args,
      });
      mockUseQueryResults.set(tagsKey, mockTags);

      // 3. 両方のフックをレンダリングしてキャッシュに蓄積
      const { result: recordsHook } = renderHook(() =>
        usePersistentQuery(api.records.getRecords, args),
      );
      const { result: tagsHook } = renderHook(() =>
        usePersistentQuery(api.records.getAvailableTags, args),
      );

      expect(recordsHook.current).toEqual(mockRecords);
      expect(tagsHook.current).toEqual(mockTags);

      // 4. 画面遷移を模倣: 両方のクエリ結果が undefined（ローディング中）になる
      mockUseQueryResults.delete(recordsKey);
      mockUseQueryResults.delete(tagsKey);

      // 5. 再度レンダリングしても、キャッシュから互いに混ざることなく正しい値が返る
      const { result: reloadedRecordsHook } = renderHook(() =>
        usePersistentQuery(api.records.getRecords, args),
      );
      const { result: reloadedTagsHook } = renderHook(() =>
        usePersistentQuery(api.records.getAvailableTags, args),
      );

      expect(reloadedRecordsHook.current).toEqual(mockRecords);
      expect(reloadedTagsHook.current).toEqual(mockTags);

      // tagsHook に records のオブジェクトが混入していないことを明示的に検証
      expect(reloadedTagsHook.current).not.toEqual(mockRecords);
    });

    it("ログアウト時にキャッシュがクリアされること", () => {
      const args = { accountId: "account_123" };
      const recordsKey = JSON.stringify({
        query: getQueryFunctionKey(api.records.getRecords),
        args,
      });
      mockUseQueryResults.set(recordsKey, [{ _id: "rec_1" }]);

      const { result, rerender } = renderHook(() =>
        usePersistentQuery(api.records.getRecords, args),
      );

      // 未認証状態に変化
      mockIsAuthenticated = false;
      mockUseQueryResults.delete(recordsKey);
      rerender();

      // 未認証中はクエリをスキップする
      expect(result.current).toBeUndefined();

      // 再認証後もクエリがローディング中なら、前セッションのキャッシュは返さない
      mockIsAuthenticated = true;
      rerender();
      expect(result.current).toBeUndefined();
    });
  });
});
