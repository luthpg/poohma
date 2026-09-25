import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { DashboardEmptyState } from "../components/dashboard/DashboardEmptyState";

const meta: Meta<typeof DashboardEmptyState> = {
  title: "Dashboard/DashboardEmptyState",
  component: DashboardEmptyState,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof DashboardEmptyState>;

export const Default: Story = {};
