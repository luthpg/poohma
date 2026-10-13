import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { fn } from "@storybook/test";
import type { ComponentProps } from "react";
import { useState } from "react";
import { TagInput } from "../components/ui/tag-input";

type TagInputProps = ComponentProps<typeof TagInput>;

function TagInputInteractive(props: TagInputProps) {
  const [tags, setTags] = useState<string[]>(props.value ?? []);
  return (
    <TagInput
      {...props}
      value={tags}
      onChange={(newTags) => {
        setTags(newTags);
        props.onChange?.(newTags);
      }}
    />
  );
}

const meta: Meta<typeof TagInput> = {
  title: "UI/TagInput",
  component: TagInput,
  render: (args) => <TagInputInteractive {...args} />,
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
