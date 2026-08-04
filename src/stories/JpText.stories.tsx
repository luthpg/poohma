import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { JpText } from "../components/JpText";

const meta: Meta<typeof JpText> = {
  title: "Components/JpText",
  component: JpText,
  tags: ["autodocs"],
  argTypes: {
    as: {
      control: "select",
      options: ["span", "p", "div", "h1", "h2", "h3"],
      description: "描画するHTML要素を指定します",
    },
    className: {
      control: "text",
      description: "追加のCSSクラスを指定します",
    },
    children: {
      control: "text",
      description: "BudouXを適用するテキストまたはJSX要素",
    },
  },
};

export default meta;
type Story = StoryObj<typeof JpText>;

// 基本的なテキストのサンプル
export const Default: Story = {
  args: {
    children:
      "BudouXで日本語の自然な改行位置を自動調整するコンポーネントです。",
  },
  decorators: [
    (Story) => (
      <div
        style={{ width: "280px", border: "1px dashed #ccc", padding: "16px" }}
      >
        <Story />
      </div>
    ),
  ],
};

// \n による改行コードを含むサンプル
export const WithNewLine: Story = {
  args: {
    children:
      "改行コード（\\n）を含むテキストです。\nここで意図的に改行され、各行の中でBudouXの可変折り返しが適用されます。",
  },
  decorators: [
    (Story) => (
      <div
        style={{ width: "280px", border: "1px dashed #ccc", padding: "16px" }}
      >
        <Story />
      </div>
    ),
  ],
};

// <br /> や <strong> などの JSX 要素を含むサンプル
export const WithJsxElements: Story = {
  render: (args) => (
    <JpText {...args}>
      JSX要素（
      {"<br />"}や<strong>太字</strong>）を直接渡すパターンです。
      <br />
      <span style={{ color: "#2563eb" }}>色付きテキスト</span>や{" "}
      <strong>強調表現</strong> もBudouXの折り返しと安全に共存できます。
    </JpText>
  ),
  decorators: [
    (Story) => (
      <div
        style={{ width: "300px", border: "1px dashed #ccc", padding: "16px" }}
      >
        <Story />
      </div>
    ),
  ],
};

// h2タグなど見出し要素として使用するサンプル
export const AsHeading: Story = {
  args: {
    as: "h2",
    className: "text-xl font-bold text-slate-800",
    children: "見出し要素として描画するサンプルタイトルです",
  },
  decorators: [
    (Story) => (
      <div
        style={{ width: "300px", border: "1px dashed #ccc", padding: "16px" }}
      >
        <Story />
      </div>
    ),
  ],
};

// カスタム属性 (id や onClick 等) を設定するサンプル
export const WithCustomAttributes: Story = {
  args: {
    as: "p",
    id: "custom-jp-text-id",
    style: { cursor: "pointer" },
    className: "text-blue-600 underline",
    children: "クリック可能な段落要素（HTML属性転送の検証）",
    onClick: () => alert("JpTextがクリックされました！"),
  },
  decorators: [
    (Story) => (
      <div
        style={{ width: "300px", border: "1px dashed #ccc", padding: "16px" }}
      >
        <Story />
      </div>
    ),
  ],
};
