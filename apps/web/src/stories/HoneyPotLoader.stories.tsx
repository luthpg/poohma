import type { Meta, StoryObj } from "@storybook/tanstack-react";

import { HoneyPotLoader } from "@/components/HoneyPotLoader";

const meta: Meta<typeof HoneyPotLoader> = {
  title: "Components/HoneyPotLoader",
  component: HoneyPotLoader,
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: "select",
      options: ["sm", "md", "lg"],
      description: "ローダーのサイズ",
    },
    animationDurationSeconds: {
      control: "number",
      description: "アニメーション1サイクル全体の再生速度（秒）",
    },
    "aria-label": {
      control: "text",
      description: "アクセシブルなローディング状態のラベル",
    },
    className: {
      control: "text",
      description: "追加のCSSクラス",
    },
  },
};

export default meta;

type Story = StoryObj<typeof HoneyPotLoader>;

export const Default: Story = {
  args: {
    size: "md",
    "aria-label": "Loading",
  },
};

export const Small: Story = {
  args: {
    size: "sm",
  },
};

export const Medium: Story = {
  args: {
    size: "md",
  },
};

export const Large: Story = {
  args: {
    size: "lg",
  },
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-8">
      <HoneyPotLoader size="sm" />
      <HoneyPotLoader size="md" />
      <HoneyPotLoader size="lg" />
    </div>
  ),
};

export const DarkMode: Story = {
  render: () => (
    <div className="flex min-h-48 items-center justify-center rounded-lg bg-slate-900 p-8">
      <HoneyPotLoader size="lg" />
    </div>
  ),
};

export const LightAndDark: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      <div
        className="flex min-h-48 items-center justify-center rounded-lg bg-white p-8"
        style={{ "--background": "#ffffff" } as React.CSSProperties}
      >
        <HoneyPotLoader size="lg" />
      </div>
      <div
        className="flex min-h-48 items-center justify-center rounded-lg bg-slate-900 p-8"
        style={{ "--background": "#0f172a" } as React.CSSProperties}
      >
        <HoneyPotLoader size="lg" />
      </div>
    </div>
  ),
};
