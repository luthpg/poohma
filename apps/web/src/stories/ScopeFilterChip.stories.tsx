import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { fn } from "@storybook/test";
import { ScopeFilterChip } from "../components/dashboard/ScopeFilterChip";

const meta: Meta<typeof ScopeFilterChip> = {
  title: "Dashboard/ScopeFilterChip",
  component: ScopeFilterChip,
  tags: ["autodocs"],
  args: {
    onFilterChange: fn(),
    counts: {
      all: 12,
      personal: 5,
      shared: 7,
    },
  },
};

export default meta;
type Story = StoryObj<typeof ScopeFilterChip>;

export const FilterAll: Story = {
  args: {
    currentFilter: "all",
  },
};

export const FilterPersonal: Story = {
  args: {
    currentFilter: "personal",
  },
};

export const FilterShared: Story = {
  args: {
    currentFilter: "shared",
  },
};

export const WithoutCounts: Story = {
  args: {
    currentFilter: "all",
    counts: undefined,
  },
};
