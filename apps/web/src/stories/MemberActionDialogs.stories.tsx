import type { Meta, StoryObj } from "@storybook/tanstack-react";
import type { Id } from "../../convex/_generated/dataModel";
import { MemberActionDialogs } from "../components/family/MemberActionDialogs";

const meta: Meta<typeof MemberActionDialogs> = {
  title: "Family/MemberActionDialogs",
  component: MemberActionDialogs,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof MemberActionDialogs>;

export const DeleteAccountOpen: Story = {
  args: {
    isDeleteAccountModalOpen: true,
    setIsDeleteAccountModalOpen: () => {},
    isMultiAccount: false,
    activeAccountDisplayName: "メインユーザー",
    isDeletingAccount: false,
    isExporting: false,
    handleExport: async () => {},
    handleDeleteAccount: async () => {},
    memberToKick: null,
    setMemberToKick: () => {},
    isKicking: false,
    handleKickMember: async () => {},
    kickSuccessNotice: null,
    setKickSuccessNotice: () => {},
    onOpenRotatePasscode: () => {},
  },
};

export const KickMemberOpen: Story = {
  args: {
    isDeleteAccountModalOpen: false,
    setIsDeleteAccountModalOpen: () => {},
    isMultiAccount: false,
    activeAccountDisplayName: "メインユーザー",
    isDeletingAccount: false,
    isExporting: false,
    handleExport: async () => {},
    handleDeleteAccount: async () => {},
    memberToKick: {
      id: "user-1" as Id<"users">,
      displayName: "テストメンバー",
      email: "test@example.com",
    },
    setMemberToKick: () => {},
    isKicking: false,
    handleKickMember: async () => {},
    kickSuccessNotice: null,
    setKickSuccessNotice: () => {},
    onOpenRotatePasscode: () => {},
  },
};

export const KickSuccessNoticeOpen: Story = {
  args: {
    isDeleteAccountModalOpen: false,
    setIsDeleteAccountModalOpen: () => {},
    isMultiAccount: false,
    activeAccountDisplayName: "メインユーザー",
    isDeletingAccount: false,
    isExporting: false,
    handleExport: async () => {},
    handleDeleteAccount: async () => {},
    memberToKick: null,
    setMemberToKick: () => {},
    isKicking: false,
    handleKickMember: async () => {},
    kickSuccessNotice: {
      memberName: "削除されたメンバー",
    },
    setKickSuccessNotice: () => {},
    onOpenRotatePasscode: () => {},
  },
};
