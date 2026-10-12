import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { fn } from "@storybook/test";
import { TagInput } from "../components/ui/tag-input";

const meta: Meta<typeof TagInput> = {
  title: "UI/TagInput",
  component: TagInput,
  tags: ["autodocs"],
  args: {
    onChange: fn(),
    placeholder: "タグを入力 (Enterで確定)...",
    availableTags: ["仕事", "家計", "サブスク", "金融", "SNS", "エンタメ"],
  },
};

export default meta;
type Story = StoryObj<typeof TagInput>;

export const Empty: Story = {
  args: {
    value: [],
  },
};

export const WithTags: Story = {
  args: {
    value: ["仕事", "サブスク"],
  },
};

export const WithoutSuggestions: Story = {
  args: {
    value: ["金融"],
    availableTags: [],
  },
};

export const MaxTagsReached: Story = {
  args: {
    value: ["タグ1", "タグ2", "タグ3", "タグ4", "タグ5"],
    maxTags: 5,
  },
};
