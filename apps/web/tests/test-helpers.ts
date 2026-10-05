import type { Id } from "../convex/_generated/dataModel";

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
    updatedAt: Date.now(),
    ...data,
  };
}
