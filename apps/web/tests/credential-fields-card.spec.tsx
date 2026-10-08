// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CredentialFieldsCard } from "@/components/records/CredentialFieldsCard";
import type { RecordFormCredential } from "@/hooks/useRecordForm";

describe("CredentialFieldsCard Component", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const sampleCredential: RecordFormCredential = {
    id: "cred-1",
    label: "個人用",
    loginId: "user@example.com",
    passwordHint: "犬の名前と誕生日",
  };

  it("ログインID、パスワードヒント、ラベルの入力欄が正しく描画されること", () => {
    render(
      <CredentialFieldsCard
        index={0}
        credential={sampleCredential}
        removable={false}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    const loginIdInput = screen.getByLabelText("ログインID");
    const hintInput = screen.getByLabelText("パスワードヒント");
    const labelInput = screen.getByLabelText(/ラベル/);

    expect(loginIdInput).toBeTruthy();
    expect(hintInput).toBeTruthy();
    expect(labelInput).toBeTruthy();

    expect((loginIdInput as HTMLInputElement).value).toBe("user@example.com");
    expect((hintInput as HTMLInputElement).value).toBe("犬の名前と誕生日");
    expect((labelInput as HTMLInputElement).value).toBe("個人用");
  });

  it("パスワードヒント欄に placeholder がなく、aria-describedby で説明文と紐づいていること", () => {
    render(
      <CredentialFieldsCard
        index={0}
        credential={{ ...sampleCredential, passwordHint: "" }}
        removable={false}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    const hintInput = screen.getByLabelText("パスワードヒント");
    expect(hintInput.getAttribute("placeholder")).toBeNull();

    const describedById = hintInput.getAttribute("aria-describedby");
    expect(describedById).toBe("pw-hint-description-0");

    const description = document.getElementById("pw-hint-description-0");
    expect(description).toBeTruthy();
    expect(description?.textContent).toContain(
      "パスワードを思い出すための手がかりを書いてください",
    );
  });

  it("各入力欄の変更時に onChange が正しい引数で呼び出されること", () => {
    const onChange = vi.fn();
    render(
      <CredentialFieldsCard
        index={0}
        credential={sampleCredential}
        removable={false}
        onChange={onChange}
        onRemove={vi.fn()}
      />,
    );

    const loginIdInput = screen.getByLabelText("ログインID");
    fireEvent.change(loginIdInput, { target: { value: "new_id@example.com" } });
    expect(onChange).toHaveBeenCalledWith(0, "loginId", "new_id@example.com");

    const hintInput = screen.getByLabelText("パスワードヒント");
    fireEvent.change(hintInput, { target: { value: "新しいヒント" } });
    expect(onChange).toHaveBeenCalledWith(0, "passwordHint", "新しいヒント");

    const labelInput = screen.getByLabelText(/ラベル/);
    fireEvent.change(labelInput, { target: { value: "仕事用" } });
    expect(onChange).toHaveBeenCalledWith(0, "label", "仕事用");
  });

  it("index === 0 の場合のみ『ヒントの考え方ガイド』が表示されること", () => {
    const { rerender } = render(
      <CredentialFieldsCard
        index={0}
        credential={sampleCredential}
        removable={false}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText("ヒントの考え方ガイド")).toBeTruthy();

    rerender(
      <CredentialFieldsCard
        index={1}
        credential={sampleCredential}
        removable={true}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.queryByText("ヒントの考え方ガイド")).toBeNull();
  });

  it("removable === true の場合に削除ボタンが表示され、クリックで onRemove が発火すること", () => {
    const onRemove = vi.fn();
    const { rerender } = render(
      <CredentialFieldsCard
        index={1}
        credential={sampleCredential}
        removable={false}
        onChange={vi.fn()}
        onRemove={onRemove}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "このアカウント情報を削除" }),
    ).toBeNull();

    rerender(
      <CredentialFieldsCard
        index={1}
        credential={sampleCredential}
        removable={true}
        onChange={vi.fn()}
        onRemove={onRemove}
      />,
    );

    const deleteButton = screen.getByRole("button", {
      name: "このアカウント情報を削除",
    });
    expect(deleteButton).toBeTruthy();

    fireEvent.click(deleteButton);
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it("編集モード時に変更されたフィールドに変更インジケータクラスが付与されること", () => {
    const isFieldModified = vi.fn((fieldName: string) => {
      return fieldName === "credential_0_passwordHint";
    });

    render(
      <CredentialFieldsCard
        index={0}
        credential={sampleCredential}
        removable={false}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        isFieldModified={isFieldModified}
        isEditMode={true}
      />,
    );

    const hintContainer = screen
      .getByLabelText("パスワードヒント")
      .closest("div");
    expect(hintContainer?.className).toContain("before:opacity-100");

    const loginIdContainer = screen.getByLabelText("ログインID").closest("div");
    expect(loginIdContainer?.className).toContain("before:opacity-0");
  });

  it("labelが未設定の場合は初期状態で折りたたまれ、ボタンクリックで展開されること", () => {
    render(
      <CredentialFieldsCard
        index={0}
        credential={{ ...sampleCredential, label: "" }}
        removable={false}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    // 初期状態ではラベル入力欄が存在しない（折りたたまれている）
    expect(screen.queryByLabelText(/ラベル/)).toBeNull();

    // トグルボタンをクリック
    const toggleButton = screen.getByRole("button", {
      name: /ラベルを設定/,
    });
    expect(toggleButton).toBeTruthy();
    fireEvent.click(toggleButton);

    // 展開されてラベル入力欄が表示される
    expect(screen.getByLabelText(/ラベル/)).toBeTruthy();
  });
});
