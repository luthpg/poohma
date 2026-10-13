import type { IndexGroupKey } from "@poohma/shared/utils/index-group";
import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { fn } from "@storybook/test";
import { IndexScrollBar } from "../components/IndexScrollBar";

const ALL_JAPANESE_GROUPS: IndexGroupKey[] = [
  "あ",
  "か",
  "さ",
  "た",
  "な",
  "は",
  "ま",
  "や",
  "ら",
  "わ",
  "#",
];

const PARTIAL_GROUPS: IndexGroupKey[] = ["あ", "か", "さ", "た", "な"];

const meta: Meta<typeof IndexScrollBar> = {
  title: "Components/IndexScrollBar",
  component: IndexScrollBar,
  tags: ["autodocs"],
  args: {
    availableGroups: ALL_JAPANESE_GROUPS,
    onSelectGroup: fn(),
  },
  decorators: [
    (Story) => (
      <div className="relative h-[650px] w-full max-w-sm mx-auto overflow-hidden rounded-2xl border bg-background/50 p-6 flex flex-col justify-between">
        <div className="text-xs text-muted-foreground">
          五十音インデックススクロールバープレビュー
        </div>
        <div className="space-y-4 my-auto text-sm text-muted-foreground/75 text-center">
          <p>右側のバーをタップまたはドラッグして操作できます</p>
        </div>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof IndexScrollBar>;

export const Default: Story = {
  args: {
    availableGroups: ALL_JAPANESE_GROUPS,
  },
};

export const PartialGroups: Story = {
  args: {
    availableGroups: PARTIAL_GROUPS,
  },
};

export const SingleGroup: Story = {
  args: {
    availableGroups: ["あ"],
  },
};
