import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { CopyButton } from "../components/ui/CopyButton";

const meta: Meta<typeof CopyButton> = {
  title: "UI/CopyButton",
  component: CopyButton,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof CopyButton>;

export const Default: Story = {
  args: {
    text: "sample-login-id@example.com",
    label: "ログインID",
  },
};

export const Disabled: Story = {
  args: {
    text: "",
    label: "空テキスト",
  },
};
