import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { PasscodeStrengthMeter } from "../components/PasscodeStrengthMeter";

const meta: Meta<typeof PasscodeStrengthMeter> = {
  title: "Components/PasscodeStrengthMeter",
  component: PasscodeStrengthMeter,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof PasscodeStrengthMeter>;

export const Empty: Story = {
  args: {
    passcode: "",
  },
};

export const Weak: Story = {
  args: {
    passcode: "1234567890",
  },
};

export const Moderate: Story = {
  args: {
    passcode: "mypas!2024word",
  },
};

export const Strong: Story = {
  args: {
    passcode: "Correct-Horse-Battery-Staple-99!",
  },
};
