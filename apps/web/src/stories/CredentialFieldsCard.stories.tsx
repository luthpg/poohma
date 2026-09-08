import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { useState } from "react";
import { CredentialFieldsCard } from "../components/records/CredentialFieldsCard";
import type { RecordFormCredential } from "../hooks/useRecordForm";

const meta: Meta<typeof CredentialFieldsCard> = {
  title: "Records/CredentialFieldsCard",
  component: CredentialFieldsCard,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof CredentialFieldsCard>;

function InteractiveCard(props: {
  initialCredential: RecordFormCredential;
  removable: boolean;
}) {
  const [credential, setCredential] = useState<RecordFormCredential>(
    props.initialCredential,
  );

  const handleChange = (
    _index: number,
    field: keyof Omit<RecordFormCredential, "id">,
    value: string,
  ) => {
    setCredential((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="max-w-2xl p-4 bg-background">
      <CredentialFieldsCard
        index={0}
        credential={credential}
        removable={props.removable}
        onChange={handleChange}
        onRemove={() => alert("削除ボタンがクリックされました")}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => (
    <InteractiveCard
      initialCredential={{
        label: "",
        loginId: "",
        passwordHint: "",
      }}
      removable={false}
    />
  ),
};

export const RemovableWithValues: Story = {
  render: () => (
    <InteractiveCard
      initialCredential={{
        id: "cred-1",
        label: "パパ用アカウント",
        loginId: "user@example.com",
        passwordHint: "愛犬の名前+西暦",
      }}
      removable={true}
    />
  ),
};
