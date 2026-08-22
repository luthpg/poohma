import type { Doc } from "./_generated/dataModel";

/**
 * レコードのコンテンツ閲覧・編集権限（個人所有者または共有家族メンバー）を検証
 */
export function requireContentAccess(
  user: Doc<"users">,
  record: Doc<"serviceRecords">,
) {
  const isPersonalOwner =
    record.ownerType === "user" && record.accountId === user._id;
  const isFamilyMember =
    record.ownerType === "family" &&
    record.ownerFamilyId !== undefined &&
    record.ownerFamilyId === user.familyId;

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
  const isPersonalOwner =
    record.ownerType === "user" && record.accountId === user._id;
  const isFamilyAdmin =
    record.ownerType === "family" &&
    record.ownerFamilyId !== undefined &&
    record.ownerFamilyId === user.familyId &&
    (record.admins ?? []).includes(user._id);

  if (!isPersonalOwner && !isFamilyAdmin) {
    throw new Error(
      "Access denied: admin rights required to manage sharing for this record",
    );
  }
}

/** 後方互換性エイリアス */
export const requireRecordAccess = requireContentAccess;
