import type { Doc } from "./_generated/dataModel";

/**
 * 移行期間中のレコードから実効的な所有種別を取得するヘルパー
 */
export function getEffectiveOwnerType(
  record: Doc<"serviceRecords">,
): "user" | "family" {
  if (record.ownerType) return record.ownerType;
  const legacy = record as Record<string, unknown>;
  return legacy.visibility === "SHARED" ? "family" : "user";
}

/**
 * 移行期間中のレコードから実効的な所有家族IDを取得するヘルパー
 */
export function getEffectiveOwnerFamilyId(
  record: Doc<"serviceRecords">,
): typeof record.ownerFamilyId {
  if (record.ownerType === "family") return record.ownerFamilyId;
  if (!record.ownerType) {
    const legacy = record as Record<string, unknown>;
    if (legacy.visibility === "SHARED") return record.familyId;
  }
  return undefined;
}

/**
 * 移行期間中のレコードから実効的な管理者アカウントID配列を取得するヘルパー
 */
export function getEffectiveAdmins(
  record: Doc<"serviceRecords">,
): typeof record.admins {
  if (record.admins) return record.admins;
  if (!record.ownerType) {
    const legacy = record as Record<string, unknown>;
    if (legacy.visibility === "SHARED") return [record.accountId];
  }
  return [];
}

/**
 * レコードのコンテンツ閲覧・編集権限（個人所有者または共有家族メンバー）を検証
 */
export function requireContentAccess(
  user: Doc<"users">,
  record: Doc<"serviceRecords">,
) {
  // 家族境界チェック：レコードの家族IDが定義されており、ユーザーの家族IDと異なる場合は拒否
  if (
    record.familyId !== undefined &&
    user.familyId !== undefined &&
    record.familyId !== user.familyId
  ) {
    throw new Error(
      "Access denied: You don't have permission to access this record",
    );
  }

  const ownerType = getEffectiveOwnerType(record);
  const ownerFamilyId = getEffectiveOwnerFamilyId(record);

  const isPersonalOwner = ownerType === "user" && record.accountId === user._id;
  const isFamilyMember =
    ownerType === "family" &&
    ownerFamilyId !== undefined &&
    ownerFamilyId === user.familyId;

  if (!isPersonalOwner && !isFamilyMember) {
    throw new Error(
      "Access denied: You don't have permission to access this record",
    );
  }
}

/**
 * レコードの管理権限（共有解除・管理者変更・削除等）を検証
 */
export function requireAdminAccess(
  user: Doc<"users">,
  record: Doc<"serviceRecords">,
) {
  // 家族境界チェック
  if (
    record.familyId !== undefined &&
    user.familyId !== undefined &&
    record.familyId !== user.familyId
  ) {
    throw new Error(
      "Access denied: You don't have permission to access this record",
    );
  }

  const ownerType = getEffectiveOwnerType(record);
  const ownerFamilyId = getEffectiveOwnerFamilyId(record);
  const admins = getEffectiveAdmins(record) ?? [];

  const isPersonalOwner = ownerType === "user" && record.accountId === user._id;
  const isFamilyAdmin =
    ownerType === "family" &&
    ownerFamilyId !== undefined &&
    ownerFamilyId === user.familyId &&
    admins.includes(user._id);

  if (!isPersonalOwner && !isFamilyAdmin) {
    throw new Error(
      "Access denied: admin rights required to manage sharing for this record",
    );
  }
}
