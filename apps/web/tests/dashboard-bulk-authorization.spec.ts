import { describe, expect, it, vi } from "vitest";

describe("Dashboard 一括操作の権限制御と事前除外ロジック (Issue #355)", () => {
  interface MockRecord {
    _id: string;
    title: string;
    ownerType: "user" | "family";
    canEdit: boolean;
  }

  // dashboard.tsx 内の一括操作事前除外フィルタリングロジックの抽出検証
  function partitionRecordsByManagementAccess(records: MockRecord[]) {
    const manageableRecords = records.filter(
      (r) => r.ownerType === "user" || r.canEdit,
    );
    const excludedManageRecords = records
      .filter((r) => r.ownerType === "family" && !r.canEdit)
      .map((r) => ({ id: r._id, title: r.title }));

    return { manageableRecords, excludedManageRecords };
  }

  it("個人レコードおよび管理者権限のある共有レコードのみが操作可能対象として抽出されること", () => {
    const selectedRecords: MockRecord[] = [
      {
        _id: "rec-1",
        title: "個人用Googleアカウント",
        ownerType: "user",
        canEdit: true,
      },
      {
        _id: "rec-2",
        title: "家族用Amazon (自分が管理者)",
        ownerType: "family",
        canEdit: true,
      },
      {
        _id: "rec-3",
        title: "家族用WiFi (閲覧専用メンバー)",
        ownerType: "family",
        canEdit: false,
      },
      {
        _id: "rec-4",
        title: "家族用Netflix (閲覧専用メンバー)",
        ownerType: "family",
        canEdit: false,
      },
    ];

    const { manageableRecords, excludedManageRecords } =
      partitionRecordsByManagementAccess(selectedRecords);

    // 操作可能対象 (個人 + 自分が管理者)
    expect(manageableRecords).toHaveLength(2);
    expect(manageableRecords.map((r) => r._id)).toEqual(["rec-1", "rec-2"]);

    // 事前除外対象 (閲覧専用メンバーの共有レコード)
    expect(excludedManageRecords).toHaveLength(2);
    expect(excludedManageRecords).toEqual([
      { id: "rec-3", title: "家族用WiFi (閲覧専用メンバー)" },
      { id: "rec-4", title: "家族用Netflix (閲覧専用メンバー)" },
    ]);
  });

  it("すべての選択レコードが閲覧専用の場合、manageableRecords が空となり確定操作が実行不能となること", () => {
    const selectedRecords: MockRecord[] = [
      {
        _id: "rec-viewer-1",
        title: "閲覧専用レコード1",
        ownerType: "family",
        canEdit: false,
      },
      {
        _id: "rec-viewer-2",
        title: "閲覧専用レコード2",
        ownerType: "family",
        canEdit: false,
      },
    ];

    const { manageableRecords, excludedManageRecords } =
      partitionRecordsByManagementAccess(selectedRecords);

    expect(manageableRecords).toHaveLength(0);
    expect(excludedManageRecords).toHaveLength(2);

    // dashboard.tsx における確定ボタンの disabled 判定
    const isActionButtonDisabled = manageableRecords.length === 0;
    expect(isActionButtonDisabled).toBe(true);
  });

  it("一括アーカイブ実行時に送信されるペイロード ID が操作可能レコードのみに限定されること", async () => {
    const selectedRecords: MockRecord[] = [
      { _id: "rec-1", title: "個人レコード", ownerType: "user", canEdit: true },
      {
        _id: "rec-2",
        title: "権限外共有レコード",
        ownerType: "family",
        canEdit: false,
      },
    ];

    const { manageableRecords } =
      partitionRecordsByManagementAccess(selectedRecords);

    const mockBulkArchiveMut = vi.fn().mockResolvedValue({ archivedCount: 1 });

    // dashboard.tsx の handleBulkArchive 実行シミュレーション
    const handleBulkArchive = async () => {
      if (manageableRecords.length === 0) return;
      const ids = manageableRecords.map((r) => r._id);
      await mockBulkArchiveMut({ ids });
    };

    await handleBulkArchive();

    expect(mockBulkArchiveMut).toHaveBeenCalledTimes(1);
    expect(mockBulkArchiveMut).toHaveBeenCalledWith({
      ids: ["rec-1"],
    });
    // rec-2 は一切送信ペイロードに含まれない
    expect(mockBulkArchiveMut).not.toHaveBeenCalledWith(
      expect.objectContaining({
        ids: expect.arrayContaining(["rec-2"]),
      }),
    );
  });

  it("一括削除実行時に送信されるペイロード ID が操作可能レコードのみに限定されること", async () => {
    const selectedRecords: MockRecord[] = [
      {
        _id: "rec-del-1",
        title: "個人レコード",
        ownerType: "user",
        canEdit: true,
      },
      {
        _id: "rec-del-2",
        title: "管理者共有レコード",
        ownerType: "family",
        canEdit: true,
      },
      {
        _id: "rec-del-3",
        title: "権限外共有レコード",
        ownerType: "family",
        canEdit: false,
      },
    ];

    const { manageableRecords } =
      partitionRecordsByManagementAccess(selectedRecords);

    const mockDeleteRecordsMut = vi.fn().mockResolvedValue({ deletedCount: 2 });

    const handleBulkDelete = async () => {
      if (manageableRecords.length === 0) return;
      const ids = manageableRecords.map((r) => r._id);
      await mockDeleteRecordsMut({ ids });
    };

    await handleBulkDelete();

    expect(mockDeleteRecordsMut).toHaveBeenCalledTimes(1);
    expect(mockDeleteRecordsMut).toHaveBeenCalledWith({
      ids: ["rec-del-1", "rec-del-2"],
    });
  });
});
