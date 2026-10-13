import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { UserAvatar } from "../components/UserAvatar";

const meta: Meta<typeof UserAvatar> = {
  title: "Common/UserAvatar",
  component: UserAvatar,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof UserAvatar>;

export const WithPhoto: Story = {
  args: {
    displayName: "山田 太郎",
    photoURL:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces",
  },
};

export const FallbackWithDisplayName: Story = {
  args: {
    displayName: "佐藤 花子",
  },
};

export const FallbackWithEmail: Story = {
  args: {
    email: "test@example.com",
  },
};

export const FallbackDefault: Story = {
  args: {},
};
