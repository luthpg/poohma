// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BulkVisibilityModal } from "@/components/records/BulkVisibilityModal";

describe("BulkVisibilityModal Component", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const defaultProps = {
    isOpen: true,
    selectedCount: 5,
    privateCount: 3,
    sharedCount: 2,
    onShare: vi.fn().mockResolvedValue(undefined),
    onUnshare: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
  };

  it("isOpen が false の場合はモーダルが表示されないこと", () => {
    render(<BulkVisibilityModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByTestId("bulk-visibility-modal")).toBeNull();
  });

  it("初期表示で選択ステップが表示され、件数と内訳が正しく描画されること", () => {
    render(<BulkVisibilityModal {...defaultProps} />);

    expect(screen.getByTestId("bulk-visibility-modal")).toBeTruthy();
    expect(screen.getByText("選択したレコードの共有設定")).toBeTruthy();
    expect(
      screen.getByText("選択した 5 件のレコードの共有状態を一括で変更します。"),
    ).toBeTruthy();

    // 内訳の確認
    expect(screen.getByText(/自分のみ 3 件/)).toBeTruthy();
    expect(screen.getByText(/家族共有 2 件/)).toBeTruthy();

    // 選択肢ボタンの確認
    expect(screen.getByTestId("select-unshare-option")).toBeTruthy();
    expect(screen.getByTestId("select-share-option")).toBeTruthy();
  });

  it("「家族に共有」を選択すると確認画面が表示され、Mutation はまだ実行されないこと", () => {
    render(<BulkVisibilityModal {...defaultProps} />);

    const shareOption = screen.getByTestId("select-share-option");
    fireEvent.click(shareOption);

    // Mutation はまだ呼ばれていないこと
    expect(defaultProps.onShare).not.toHaveBeenCalled();
    expect(defaultProps.onUnshare).not.toHaveBeenCalled();

    // 確認画面のタイトルと変更方向の表示
    expect(screen.getByText("家族共有への一括変更確認")).toBeTruthy();
    expect(
      screen.getByText("選択したレコードを家族全員と共有します。"),
    ).toBeTruthy();

    // 変更方向（PRIVATE → SHARED）と件数
    expect(screen.getByText("自分のみ")).toBeTruthy();
    expect(screen.getByText("家族全員に共有")).toBeTruthy();
    expect(screen.getByText("5 件")).toBeTruthy();

    // 確定ボタンの存在
    expect(screen.getByTestId("confirm-share-button")).toBeTruthy();
  });

  it("「自分のみ」を選択すると確認画面が表示され、Mutation はまだ実行されないこと", () => {
    render(<BulkVisibilityModal {...defaultProps} />);

    const unshareOption = screen.getByTestId("select-unshare-option");
    fireEvent.click(unshareOption);

    // Mutation はまだ呼ばれていないこと
    expect(defaultProps.onShare).not.toHaveBeenCalled();
    expect(defaultProps.onUnshare).not.toHaveBeenCalled();

    // 確認画面のタイトルと変更方向の表示
    expect(screen.getByText("共有解除（個人用）への一括変更確認")).toBeTruthy();
    expect(
      screen.getByText(
        "選択したレコードの家族共有を解除し、自分のみの閲覧に変更します。",
      ),
    ).toBeTruthy();

    // 変更方向（SHARED → PRIVATE）と件数（sharedCount: 2 が解除対象）
    expect(screen.getByText("家族全員に共有")).toBeTruthy();
    expect(screen.getByText("自分のみ（個人用）")).toBeTruthy();
    expect(screen.getByText("2 件")).toBeTruthy();

    // 確定ボタンの存在
    expect(screen.getByTestId("confirm-unshare-button")).toBeTruthy();
  });

  it("確認画面で「戻る」をクリックすると選択画面に戻り、Mutation は実行されないこと", () => {
    render(<BulkVisibilityModal {...defaultProps} />);

    // 「家族に共有」を選択して確認画面へ
    fireEvent.click(screen.getByTestId("select-share-option"));
    expect(screen.getByText("家族共有への一括変更確認")).toBeTruthy();

    // 「戻る」をクリック
    const backButton = screen.getByTestId("back-to-select-button");
    fireEvent.click(backButton);

    // 選択画面に戻っていること
    expect(screen.getByText("選択したレコードの共有設定")).toBeTruthy();
    expect(defaultProps.onShare).not.toHaveBeenCalled();
  });

  it("選択画面で「キャンセル」をクリックすると onClose が呼ばれ、Mutation は実行されないこと", () => {
    render(<BulkVisibilityModal {...defaultProps} />);

    const cancelButton = screen.getByTestId("cancel-visibility-button");
    fireEvent.click(cancelButton);

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    expect(defaultProps.onShare).not.toHaveBeenCalled();
    expect(defaultProps.onUnshare).not.toHaveBeenCalled();
  });

  it("家族共有確認画面で「家族に共有する」をクリックすると onShare が実行されること", async () => {
    let resolveShare: () => void = () => {};
    const sharePromise = new Promise<void>((resolve) => {
      resolveShare = resolve;
    });
    const onShare = vi.fn().mockImplementation(() => sharePromise);

    render(<BulkVisibilityModal {...defaultProps} onShare={onShare} />);

    // 家族共有確認画面へ遷移
    fireEvent.click(screen.getByTestId("select-share-option"));

    // 確定ボタンをクリック
    const confirmButton = screen.getByTestId("confirm-share-button");
    fireEvent.click(confirmButton);

    // 実行中状態（ローディングスピナー）の確認
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/共有中/)).toBeTruthy();
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true);

    // 完了
    resolveShare();
    await waitFor(() => {
      expect(screen.queryByText(/共有中/)).toBeNull();
    });
  });

  it("共有解除確認画面で「共有を解除する」をクリックすると onUnshare が実行されること", async () => {
    let resolveUnshare: () => void = () => {};
    const unsharePromise = new Promise<void>((resolve) => {
      resolveUnshare = resolve;
    });
    const onUnshare = vi.fn().mockImplementation(() => unsharePromise);

    render(<BulkVisibilityModal {...defaultProps} onUnshare={onUnshare} />);

    // 共有解除確認画面へ遷移
    fireEvent.click(screen.getByTestId("select-unshare-option"));

    // 確定ボタンをクリック
    const confirmButton = screen.getByTestId("confirm-unshare-button");
    fireEvent.click(confirmButton);

    // 実行中状態（ローディングスピナー）の確認
    expect(onUnshare).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/解除中/)).toBeTruthy();
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true);

    // 完了
    resolveUnshare();
    await waitFor(() => {
      expect(screen.queryByText(/解除中/)).toBeNull();
    });
  });

  it("excludedUnshareRecords が渡された場合、共有解除確認画面で除外アラートとレコード一覧が表示されること", () => {
    const excluded = [
      { id: "rec-1", title: "家族メンバーのワクチン記録" },
      { id: "rec-2", title: "パートナーの健診記録" },
    ];

    render(
      <BulkVisibilityModal
        {...defaultProps}
        unshareableCount={3}
        excludedUnshareRecords={excluded}
      />,
    );

    // 共有解除確認画面へ遷移
    fireEvent.click(screen.getByTestId("select-unshare-option"));

    // 除外アラートの表示確認
    expect(
      screen.getByText("管理者権限がないため共有解除の対象外（2 件）"),
    ).toBeTruthy();
    expect(screen.getByText("家族メンバーのワクチン記録")).toBeTruthy();
    expect(screen.getByText("パートナーの健診記録")).toBeTruthy();

    // 実際の解除対象件数（3 件）の表示確認
    expect(screen.getByText("3 件")).toBeTruthy();

    // 確定ボタンは有効であること
    const confirmButton = screen.getByTestId(
      "confirm-unshare-button",
    ) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(false);
  });

  it("unshareableCount が 0 の場合、警告メッセージが表示され確定ボタンが無効化されること", () => {
    const excluded = [{ id: "rec-1", title: "家族メンバーのワクチン記録" }];

    render(
      <BulkVisibilityModal
        {...defaultProps}
        unshareableCount={0}
        excludedUnshareRecords={excluded}
      />,
    );

    // 共有解除確認画面へ遷移
    fireEvent.click(screen.getByTestId("select-unshare-option"));

    // 対象なしメッセージの確認
    expect(
      screen.getByText(
        "選択されたレコードの中に、あなたが管理者権限を持つ家族共有レコードはありません。",
      ),
    ).toBeTruthy();

    // 確定ボタンが無効化されていること
    const confirmButton = screen.getByTestId(
      "confirm-unshare-button",
    ) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
  });
});
