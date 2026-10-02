import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { LogoText } from "@/components/common/LogoText";

const meta: Meta<typeof LogoText> = {
  title: "UI/LogoText",
  component: LogoText,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof LogoText>;

export const Default: Story = {
  args: {},
};

export const Large: Story = {
  args: {
    className: "font-3xl text-muted-foreground",
  },
};

export const Disabled: Story = {
  args: {
    className: "font-5xl text-muted-foreground",
  },
};
