import type { Doc, Id } from "./_generated/dataModel";

/**
 * レコードの実効的な所有種別を取得するヘルパー
 */
export function getEffectiveOwnerType(
  record: Doc<"serviceRecords">,
): "user" | "family" {
  return record.ownerType ?? "user";
}

/**
 * レコードの実効的な所有家族IDを取得するヘルパー
 */
export function getEffectiveOwnerFamilyId(
  record: Doc<"serviceRecords">,
): typeof record.ownerFamilyId {
  if (record.ownerType === "family") return record.ownerFamilyId;
  return undefined;
}

/**
 * レコードの実効的な管理者アカウントID配列を取得するヘルパー
 */
export function getEffectiveAdmins(
  record: Doc<"serviceRecords">,
): Id<"users">[] {
  return record.admins ?? [];
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
 * ユーザーの実効的な家族ロールを取得するヘルパー
 */
export function getEffectiveFamilyRole(user: Doc<"users">): "admin" | "viewer" {
  return user.familyRole ?? "admin";
}

/**
 * ユーザーがレコードの管理者（変更・削除・管理権限を持つ）であるかを判定するヘルパー
 */
export function isRecordAdmin(
  user: Doc<"users">,
  record: Doc<"serviceRecords">,
): boolean {
  // 家族境界チェック：レコードの家族IDが定義されており、ユーザーの家族IDと異なる場合は拒否
  if (
    record.familyId !== undefined &&
    user.familyId !== undefined &&
    record.familyId !== user.familyId
  ) {
    return false;
  }

  const ownerType = getEffectiveOwnerType(record);
  const ownerFamilyId = getEffectiveOwnerFamilyId(record);

  // 個人所有レコード: 作成者本人のみ
  if (ownerType === "user" && record.accountId === user._id) {
    return true;
  }

  // 家族共有レコード:
  if (
    ownerType === "family" &&
    ownerFamilyId !== undefined &&
    ownerFamilyId === user.familyId
  ) {
    // ファミリー管理者は無条件で全共有レコードの管理者
    if (getEffectiveFamilyRole(user) === "admin") {
      return true;
    }
    // 個別管理者（admins に含まれるデフォルト閲覧者、または自分で共有した閲覧者）
    const admins = getEffectiveAdmins(record);
    return admins.includes(user._id);
  }

  return false;
}

/**
 * レコードの管理権限（共有解除・管理者変更・削除・更新等）を検証
 */
export function requireAdminAccess(
  user: Doc<"users">,
  record: Doc<"serviceRecords">,
) {
  if (!isRecordAdmin(user, record)) {
    throw new Error(
      "Access denied: admin rights required to manage this record",
    );
  }
}
