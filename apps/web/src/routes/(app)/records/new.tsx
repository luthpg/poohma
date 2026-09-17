import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
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
  return crypto.randomUUID();
}

function NewRecordComponent() {
  const navigate = useNavigate();

  // draftId が URL に無ければ採番して URL にセット（他タブ分離 & リフレッシュ耐性）
  const [draftId, setDraftId] = useState<string>(getInitialDraftId);
  const tabInstanceIdRef = useRef<string>(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `tab_${Date.now()}`,
  );
  const draftIdRef = useRef(draftId);
  draftIdRef.current = draftId;

  // BroadcastChannel によるタブ複製時の draftId 衝突検知 (CR-6)
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof BroadcastChannel === "undefined"
    ) {
      return;
    }

    const channel = new BroadcastChannel("poohma_draft_bus");
    const currentTabId = tabInstanceIdRef.current;

    channel.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;

      // 他タブから自身の draftId に対する ping を受け取ったら pong で応答
      if (
        data.type === "ping" &&
        data.draftId === draftIdRef.current &&
        data.senderTabId !== currentTabId
      ) {
        channel.postMessage({
          type: "pong",
          draftId: draftIdRef.current,
          responderTabId: currentTabId,
        });
      }

      // 自身が送信した ping に対する pong を受信した場合、先行タブが存在するため新 draftId を採番
      if (
        data.type === "pong" &&
        data.draftId === draftIdRef.current &&
        data.responderTabId !== currentTabId
      ) {
        const newDraftId = crypto.randomUUID();
        setDraftId(newDraftId);
        try {
          const params = new URLSearchParams(window.location.search);
          params.set("draftId", newDraftId);
          const newUrl = `${window.location.pathname}?${params.toString()}`;
          window.history.replaceState(null, "", newUrl);
        } catch {
          // ignore
        }
      }
    };

    // マウント時に現在の draftId について先行タブの存在を問い合わせ
    channel.postMessage({
      type: "ping",
      draftId: draftIdRef.current,
      senderTabId: currentTabId,
    });

    return () => {
      channel.close();
    };
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get("draftId") !== draftId) {
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
    <div className="mx-auto max-w-3xl p-6 pb-24 sm:pb-32">
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
