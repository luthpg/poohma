// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TagInput } from "@/components/ui/tag-input";

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

describe("TagInput Component", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("候補タグ（availableTags）がインラインチップとして描画されること", () => {
		render(
			<TagInput
				value={[]}
				onChange={vi.fn()}
				availableTags={["SNS", "仕事", "エンタメ"]}
			/>,
		);

		expect(screen.getByTestId("suggest-tag-SNS")).toBeTruthy();
		expect(screen.getByTestId("suggest-tag-仕事")).toBeTruthy();
		expect(screen.getByTestId("suggest-tag-エンタメ")).toBeTruthy();
	});

	it("未選択の候補タグをタップすると追加されること", () => {
		const onChange = vi.fn();
		render(
			<TagInput
				value={["SNS"]}
				onChange={onChange}
				availableTags={["SNS", "仕事"]}
			/>,
		);

		const workChip = screen.getByTestId("suggest-tag-仕事");
		fireEvent.click(workChip);

		expect(onChange).toHaveBeenCalledWith(["SNS", "仕事"]);
	});

	it("選択済みの候補タグをタップすると削除されること", () => {
		const onChange = vi.fn();
		render(
			<TagInput
				value={["SNS", "仕事"]}
				onChange={onChange}
				availableTags={["SNS", "仕事"]}
			/>,
		);

		const snsChip = screen.getByTestId("suggest-tag-SNS");
		fireEvent.click(snsChip);

		expect(onChange).toHaveBeenCalledWith(["仕事"]);
	});

	it("maxTags（上限）に達している場合、未選択タグをタップしても追加されないこと", async () => {
		const { toast } = await import("sonner");
		const onChange = vi.fn();
		const currentTags = Array.from({ length: 20 }, (_, i) => `tag${i}`);

		render(
			<TagInput
				value={currentTags}
				onChange={onChange}
				availableTags={["newTag", ...currentTags]}
				maxTags={20}
			/>,
		);

		const newChip = screen.getByTestId("suggest-tag-newTag");
		fireEvent.click(newChip);

		expect(onChange).not.toHaveBeenCalled();
		expect(toast.error).toHaveBeenCalledWith("タグは20個まで登録できます");
	});

	it("選択されているタグが候補チップの前方にソートされること", () => {
		render(
			<TagInput
				value={["仕事"]}
				onChange={vi.fn()}
				availableTags={["SNS", "仕事", "エンタメ"]}
			/>,
		);

		const chips = screen.getAllByRole("button", { name: /SNS|仕事|エンタメ/ });
		// 先頭のチップが選択済みの「仕事」になっていること
		expect(chips[0].textContent).toContain("仕事");
	});
});
