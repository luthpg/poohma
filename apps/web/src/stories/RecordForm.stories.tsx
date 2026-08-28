import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { useState } from "react";
import { RecordForm } from "../components/records/RecordForm";
import type {
	RecordFormValues,
	UseRecordFormReturn,
} from "../hooks/useRecordForm";

const meta: Meta<typeof RecordForm> = {
	title: "Records/RecordForm",
	component: RecordForm,
	tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof RecordForm>;

function MockFormContainer({
	initialValues,
	isAdmin = true,
	submitIdleLabel = "登録する",
	isBusy = false,
}: {
	initialValues?: Partial<RecordFormValues>;
	isAdmin?: boolean;
	submitIdleLabel?: string;
	isBusy?: boolean;
}) {
	const [values, setValues] = useState<RecordFormValues>({
		title: "",
		titleReading: "",
		url: "",
		ogpImage: "",
		ogpDescription: "",
		memo: "",
		ownerType: "user",
		tags: [],
		credentials: [{ label: "", loginId: "", passwordHint: "" }],
		...initialValues,
	});

	const form: UseRecordFormReturn = {
		values,
		updateTitle: (title) => setValues((prev) => ({ ...prev, title })),
		updateTitleReading: (titleReading) =>
			setValues((prev) => ({ ...prev, titleReading })),
		handleTitleBlur: () => {},
		fetchFuriganaForTitle: async () => null,
		setUrl: (url) => setValues((prev) => ({ ...prev, url })),
		handleUrlBlur: () => Promise.resolve(null),
		setMemo: (memo) => setValues((prev) => ({ ...prev, memo })),
		setOwnerType: (ownerType) => setValues((prev) => ({ ...prev, ownerType })),
		setTags: (tags) => setValues((prev) => ({ ...prev, tags })),
		addCredential: () =>
			setValues((prev) => ({
				...prev,
				credentials: [
					...prev.credentials,
					{ label: "", loginId: "", passwordHint: "" },
				],
			})),
		removeCredential: (index) =>
			setValues((prev) => ({
				...prev,
				credentials: prev.credentials.filter((_, i) => i !== index),
			})),
		updateCredentialField: (index, field, value) =>
			setValues((prev) => {
				const credentials = [...prev.credentials];
				credentials[index] = { ...credentials[index], [field]: value };
				return { ...prev, credentials };
			}),
		reset: (next) =>
			setValues((prev) => ({
				...prev,
				...next,
			})),
		submit: async () => true,
		isFetchingOgp: false,
		isFetchingFurigana: false,
		isSubmitting: isBusy,
	};

	return (
		<div className="mx-auto max-w-3xl p-6 bg-background">
			<RecordForm
				form={form}
				availableTags={["重要", "銀行", "ショッピング", "サブスク"]}
				onSubmit={(e) => {
					e.preventDefault();
					alert(`送信されました: ${JSON.stringify(values, null, 2)}`);
				}}
				onCancel={() => alert("キャンセルがクリックされました")}
				submitIdleLabel={submitIdleLabel}
				isAdmin={isAdmin}
			/>
		</div>
	);
}

export const NewRecord: Story = {
	render: () => <MockFormContainer submitIdleLabel="登録する" />,
};

export const EditRecord: Story = {
	render: () => (
		<MockFormContainer
			submitIdleLabel="保存する"
			initialValues={{
				title: "Amazon",
				titleReading: "あまぞん",
				url: "https://www.amazon.co.jp",
				memo: "定期おトク便の設定あり",
				ownerType: "family",
				tags: ["ショッピング", "サブスク"],
				credentials: [
					{
						id: "cred-1",
						label: "共通アカウント",
						loginId: "family@example.com",
						passwordHint: "お母さんの誕生日+記号",
					},
					{
						id: "cred-2",
						label: "サブ用",
						loginId: "sub@example.com",
						passwordHint: "秘密の言葉",
					},
				],
			}}
			isAdmin={true}
		/>
	),
};

export const NonAdminFamilyRecord: Story = {
	render: () => (
		<MockFormContainer
			submitIdleLabel="保存する"
			initialValues={{
				title: "三井住友銀行",
				titleReading: "みついすみともぎんこう",
				url: "https://www.smbc.co.jp",
				memo: "家族共有の口座情報",
				ownerType: "family",
				tags: ["銀行"],
				credentials: [
					{
						id: "cred-1",
						label: "代表口座",
						loginId: "smbc-user-1234",
						passwordHint: "支店番号+口座番号下4桁",
					},
				],
			}}
			isAdmin={false}
		/>
	),
};

export const SubmittingState: Story = {
	render: () => (
		<MockFormContainer
			submitIdleLabel="保存する"
			isBusy={true}
			initialValues={{
				title: "Netflix",
				ownerType: "user",
			}}
		/>
	),
};
