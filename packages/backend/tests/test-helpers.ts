import { v } from "convex/values";
import type { Id } from "../convex/_generated/dataModel";
import { internalAction } from "../convex/_generated/server";

/**
 * テスト実行時に非同期メール送信タスクが Teardown 後に漏洩するのを防止するテスト用モジュールマップ
 */
export function createTestModules(
  modules: Record<string, () => Promise<unknown>>,
): Record<string, () => Promise<unknown>> {
  return {
    ...modules,
    "../convex/actions.ts": async () => {
      const loader = modules["../convex/actions.ts"];
      const actual = loader
        ? ((await loader()) as Record<string, unknown>)
        : {};
      return {
        ...actual,
        sendTemplatedEmailInternal: internalAction({
          args: {
            email: v.string(),
            payload: v.any(),
            replyTo: v.optional(v.string()),
          },
          handler: async () => true,
        }),
      };
    },
  };
}

export const mockCryptoMaterials = {
  masterKeyEncrypted: "mockMasterKeyEncryptedBase64==",
  masterKeyIv: "mockMasterKeyIv1234==",
  masterKeySalt: "mockMasterKeySalt1234==",
  kdfIterations: 300_000,
  cryptoVersion: 1,
};

export function createTestFamilyData(
  name: string,
  overrides?: Record<string, unknown>,
) {
  return {
    name,
    ...mockCryptoMaterials,
    updatedAt: Date.now(),
    ...overrides,
  };
}

export function createTestUserData(
  data: {
    userId: string;
    email: string;
    familyRole?: "admin" | "viewer";
    displayName?: string;
    familyId?: Id<"families">;
  } & Record<string, unknown>,
) {
  return {
    familyRole: "admin" as const,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...data,
  };
}

export function createTestRecordData(
  data: {
    title: string;
    userId: string;
    accountId: Id<"users">;
    familyId: Id<"families">;
    ownerType?: "user" | "family";
  } & Record<string, unknown>,
) {
  return {
    sortKey: data.title,
    ownerType: "user" as const,
    admins: [],
    revision: 0,
    updatedByAccountId: data.accountId,
    tags: [],
    stableId: crypto.randomUUID(),
    isArchived: false,
    updatedAt: Date.now(),
    ...data,
  };
}
