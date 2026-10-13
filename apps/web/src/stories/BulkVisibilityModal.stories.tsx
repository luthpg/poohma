import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { fn, screen, userEvent } from "@storybook/test";
import { BulkVisibilityModal } from "../components/records/BulkVisibilityModal";

const meta: Meta<typeof BulkVisibilityModal> = {
  title: "Records/BulkVisibilityModal",
  component: BulkVisibilityModal,
  tags: ["autodocs"],
  args: {
    isOpen: true,
    onShare: fn(async () => {}),
    onUnshare: fn(async () => {}),
    onClose: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof BulkVisibilityModal>;

export const Default: Story = {
  args: {
    selectedCount: 5,
    privateCount: 3,
    sharedCount: 2,
  },
};

export const OnlyPrivateSelected: Story = {
  args: {
    selectedCount: 3,
    privateCount: 3,
    sharedCount: 0,
  },
};

export const OnlySharedSelected: Story = {
  args: {
    selectedCount: 4,
    privateCount: 0,
    sharedCount: 4,
  },
};

export const WithExcludedRecordsAlert: Story = {
  args: {
    selectedCount: 4,
    privateCount: 0,
    sharedCount: 4,
    unshareableCount: 2,
    excludedUnshareRecords: [
      { id: "rec-1", title: "家族共有WiFiパスワード (編集権限なし)" },
      { id: "rec-2", title: "Netflix家族アカウント (閲覧専用)" },
    ],
  },
  play: async () => {
    const unshareOption = await screen.findByTestId("select-unshare-option");
    await userEvent.click(unshareOption);
  },
};
