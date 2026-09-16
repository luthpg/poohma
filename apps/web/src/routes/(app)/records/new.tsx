import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type React from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@/../convex/_generated/api";
import { RecordForm } from "@/components/records/RecordForm";
import { useAccount } from "@/hooks/useAccount";
import { useRecordForm } from "@/hooks/useRecordForm";

const newRecordSearchSchema = z.object({
  draftId: z.string().optional(),
});

export const Route = createFileRoute("/(app)/records/new")({
  validateSearch: newRecordSearchSchema,
  component: NewRecordComponent,
});

function getInitialDraftId(): string {
  if (typeof window !== "undefined") {
    try {
      const params = new URLSearchParams(window.location.search);
      const existing = params.get("draftId");
      if (existing) return existing;
    } catch {
      // ignore
    }
  }
  return `d_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function NewRecordComponent() {
  const navigate = useNavigate();

  // draftId が URL に無ければ採番して URL にセット（他タブ分離 & リフレッシュ耐性）
  const [draftId] = useState<string>(getInitialDraftId);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        if (!params.get("draftId")) {
          params.set("draftId", draftId);
          const newUrl = `${window.location.pathname}?${params.toString()}`;
          window.history.replaceState(null, "", newUrl);
        }
      } catch {
        // ignore
      }
    }
  }, [draftId]);

  const { isAuthenticated } = useConvexAuth();
  const { activeAccountId } = useAccount();
  const availableTags =
    useQuery(
      api.records.getAvailableTags,
      isAuthenticated ? { accountId: activeAccountId || undefined } : "skip",
    ) || [];
  const createRecord = useMutation(api.records.createRecord);

  const form = useRecordForm(undefined, undefined, draftId);

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

  const handleCancel = () => {
    form.discardDraft();
    navigate({ to: "/dashboard" });
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
        onCancel={handleCancel}
        submitIdleLabel="登録する"
      />
    </div>
  );
}
