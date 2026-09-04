import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type React from "react";
import { useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import { RecordForm } from "@/components/records/RecordForm";
import { useAccount } from "@/hooks/useAccount";
import { useRecordForm } from "@/hooks/useRecordForm";

export const Route = createFileRoute("/(app)/records/new")({
	component: NewRecordComponent,
});

function NewRecordComponent() {
	useEffect(() => {
		window.scrollTo(0, 0);
	}, []);

	const { isAuthenticated } = useConvexAuth();
	const { activeAccountId } = useAccount();
	const availableTags =
		useQuery(
			api.records.getAvailableTags,
			isAuthenticated ? { accountId: activeAccountId || undefined } : "skip",
		) || [];
	const navigate = useNavigate();
	const createRecord = useMutation(api.records.createRecord);

	const form = useRecordForm();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const succeeded = await form.submit(async (payload) => {
			await createRecord({
				accountId: activeAccountId || undefined,
				...payload,
			});
		});
		if (succeeded) {
			toast.success("サービスを登録しました");
			await navigate({ to: "/dashboard" });
		}
	};

	return (
		<div className="mx-auto max-w-3xl p-6">
			<h1 className="mb-8 text-[24px] font-semibold tracking-geist-h2 text-foreground">
				サービスを登録
			</h1>
			<RecordForm
				form={form}
				availableTags={availableTags}
				onSubmit={handleSubmit}
				onCancel={() => navigate({ to: "/dashboard" })}
				submitIdleLabel="登録する"
			/>
		</div>
	);
}
