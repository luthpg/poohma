import type { Doc } from "./_generated/dataModel";

/**
 * レコードに対するアクセス権限を検証し、権限がなければ例外をスローする
 */
export function requireRecordAccess(
  user: Doc<"users">,
  record: Doc<"serviceRecords">,
) {
  // レコードがファミリーに属している場合、ユーザーも同一ファミリーに所属していなければならない
  if (record.familyId !== undefined && record.familyId !== user.familyId) {
    throw new Error(
      "Access denied: You don't have permission to access this record",
    );
  }

  const isOwner = record.userId === user.userId;
  const isFamilyShared =
    record.visibility === "SHARED" &&
    record.familyId !== undefined &&
    record.familyId === user.familyId;

  if (!isOwner && !isFamilyShared) {
    throw new Error(
      "Access denied: You don't have permission to access this record",
    );
  }
}
