import { useMutation } from "convex/react";
import { Ban, Check, Clock, Copy, Plus, QrCode, Share2 } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

type FamilyInvite = Doc<"familyInvites"> & {
  status: "active" | "expired" | "revoked";
};

interface FamilyInviteSectionProps {
  family?: { name: string } | null;
  familyName?: string;
  familyInvites: FamilyInvite[] | undefined;
  activeAccountId?: Id<"users"> | null;
}

export function FamilyInviteSection({
  family,
  familyName,
  familyInvites,
  activeAccountId,
}: FamilyInviteSectionProps) {
  const currentFamilyName = family?.name ?? familyName;
  const createFamilyInviteMut = useMutation(api.families.createFamilyInvite);
  const revokeFamilyInviteMut = useMutation(api.families.revokeFamilyInvite);

  const [selectedTtl, setSelectedTtl] = useState(10080); // 7日 (分)
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [selectedInviteCode, setSelectedInviteCode] = useState<string | null>(
    null,
  );

  const activeInvites =
    familyInvites?.filter((inv) => inv.status === "active") ?? [];
  const currentActiveInvite =
    activeInvites.find((inv) => inv.code === selectedInviteCode) ??
    activeInvites[0] ??
    null;

  const downloadOrShareQrCode = async () => {
    if (!currentActiveInvite) {
      toast.error("有効な招待コードがありません");
      return;
    }
    const canvas = document.getElementById(
      "qr-canvas",
    ) as HTMLCanvasElement | null;
    if (!canvas) {
      toast.error("QRコードが見つかりません");
      return;
    }
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast.error("画像の生成に失敗しました");
          return;
        }

        const fileName = `poohma-invite-${currentFamilyName || "family"}.png`;
        const file = new File([blob], fileName, { type: "image/png" });

        // Web Share API でファイル共有可能な場合は画像共有を試みる
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: "PoohMa 家族招待",
              text: `${currentFamilyName || "家族グループ"}への招待QRコードです。`,
            });
            return;
          } catch (err) {
            if ((err as Error).name === "AbortError") return;
            // 共有キャンセルのフォールバックとしてダウンロード
          }
        }

        // 非対応またはPC環境の場合はダウンロード
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("QRコード画像を保存しました");
      }, "image/png");
    } catch (_err) {
      toast.error("画像の保存に失敗しました");
    }
  };

  const shareInviteUrl = async () => {
    if (!currentActiveInvite) {
      toast.error("有効な招待コードがありません");
      return;
    }
    const inviteUrl = `${window.location.origin}/family?inviteCode=${currentActiveInvite.code}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "PoohMa 家族招待",
          text: `${currentFamilyName}への招待コードです。以下のリンクから参加してください。`,
          url: inviteUrl,
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          toast.error("共有に失敗しました");
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(inviteUrl);
        toast.success("招待URLをクリップボードにコピーしました");
      } catch (_err) {
        toast.error("コピーに失敗しました");
      }
    }
  };

  const handleCreateInvite = async () => {
    setIsCreatingInvite(true);
    try {
      const res = await createFamilyInviteMut({
        accountId: activeAccountId || undefined,
        ttlMinutes: selectedTtl,
      });
      setSelectedInviteCode(res.code);
      toast.success("招待コードを発行しました");
    } catch (_err) {
      toast.error("招待コードの発行に失敗しました");
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleRevokeInvite = async (inviteId: Id<"familyInvites">) => {
    try {
      await revokeFamilyInviteMut({
        accountId: activeAccountId || undefined,
        inviteId,
      });
      toast.success("招待コードを無効化しました");
    } catch (_err) {
      toast.error("招待コードの無効化に失敗しました");
    }
  };

  return (
    <div className="mb-8">
      <div className="mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h3 className="text-[14px] font-medium text-foreground">
          招待コード管理
        </h3>
        {/* 招待コード新規発行 */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={selectedTtl}
            onChange={(e) => setSelectedTtl(Number(e.target.value))}
            disabled={isCreatingInvite}
            className="rounded-md bg-card px-2.5 py-1.5 text-[13px] font-medium text-foreground shadow-border border border-border focus:outline-none focus:ring-2 focus:ring-orange-500/50 cursor-pointer flex-1 sm:flex-initial"
          >
            <option value={60}>有効期限: 1時間</option>
            <option value={1440}>有効期限: 1日</option>
            <option value={10080}>有効期限: 7日（推奨）</option>
            <option value={43200}>有効期限: 30日</option>
          </select>
          <button
            type="button"
            onClick={handleCreateInvite}
            disabled={isCreatingInvite}
            className="flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-[13px] font-medium text-white shadow-border hover:bg-orange-600 transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {isCreatingInvite ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            コードを発行
          </button>
        </div>
      </div>

      {currentActiveInvite ? (
        <div className="flex flex-col md:flex-row items-center gap-6 rounded-md bg-muted/50 p-6 shadow-border-light">
          <div className="bg-white p-2 rounded-md shadow-sm shrink-0">
            <QRCodeCanvas
              id="qr-canvas"
              value={`${typeof window !== "undefined" ? window.location.origin : ""}/family?inviteCode=${currentActiveInvite.code}`}
              size={120}
            />
          </div>
          <div className="flex-1 w-full space-y-3 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
                  <Check className="h-3 w-3" />
                  有効な招待
                </span>
                <span className="text-xs text-muted-foreground">
                  有効期限:{" "}
                  {new Date(currentActiveInvite.expiresAt).toLocaleString(
                    "ja-JP",
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleRevokeInvite(currentActiveInvite._id)}
                className="text-xs text-red-500 hover:text-red-600 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Ban className="h-3 w-3" />
                無効化
              </button>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <code className="flex-1 font-mono text-[13px] md:text-[14px] font-semibold text-foreground bg-card p-2.5 rounded-md shadow-sm border border-border break-all">
                {currentActiveInvite.code}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(currentActiveInvite.code);
                  toast.success("招待コードをコピーしました");
                }}
                className="rounded-md bg-card px-4 py-2.5 text-[14px] font-medium text-foreground shadow-border hover:bg-accent transition whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Copy className="h-4 w-4" />
                コピー
              </button>
            </div>
            <Separator className="my-2" />
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                onClick={downloadOrShareQrCode}
                className="rounded-md bg-card px-3 py-2 text-[13px] font-medium text-foreground shadow-border hover:bg-accent transition flex items-center justify-center gap-1.5 cursor-pointer flex-1 sm:flex-initial"
              >
                <QrCode className="h-4 w-4" />
                QRコード画像を保存
              </button>
              <button
                type="button"
                onClick={shareInviteUrl}
                className="rounded-md bg-card px-3 py-2 text-[13px] font-medium text-foreground shadow-border hover:bg-accent transition flex items-center justify-center gap-1.5 cursor-pointer flex-1 sm:flex-initial"
              >
                <Share2 className="h-4 w-4" />
                {typeof navigator !== "undefined" && "share" in navigator
                  ? "招待URLを共有"
                  : "招待URLをコピー"}
              </button>
            </div>
            <Separator className="my-2" />
            <p className="text-[13px] text-muted-foreground">
              このコードまたはQRコードを家族に共有して参加してもらいます。
              <br />
              参加には家族メンバーの承認が必要です。
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center">
          <Clock className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-[14px] font-medium text-foreground">
            現在有効な招待コードがありません
          </p>
          <p className="text-[12px] text-muted-foreground mt-1 mb-4">
            家族メンバーを招待するには、上の「コードを発行」ボタンから有効期限を指定して招待コードを発行してください。
          </p>
        </div>
      )}

      {/* 発行履歴一覧（存在する場合） */}
      {familyInvites && familyInvites.length > 0 && (
        <div className="mt-4">
          <details className="group rounded-md border border-border bg-card p-3 text-xs">
            <summary className="font-medium text-foreground cursor-pointer select-none flex items-center justify-between">
              <span>発行済み招待コード履歴 ({familyInvites.length}件)</span>
              <span className="text-muted-foreground group-open:rotate-180 transition-transform">
                ▼
              </span>
            </summary>
            <div className="mt-3 divide-y divide-border overflow-x-auto">
              {familyInvites.map((inv) => {
                const isSelected = currentActiveInvite?._id === inv._id;
                return (
                  <div
                    key={inv._id}
                    className={`py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${isSelected ? "bg-accent/40 -mx-3 px-3 rounded" : ""}`}
                  >
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          inv.status === "active"
                            ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
                            : inv.status === "expired"
                              ? "bg-muted text-muted-foreground border border-border"
                              : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                        }`}
                      >
                        {inv.status === "active"
                          ? "有効"
                          : inv.status === "expired"
                            ? "期限切れ"
                            : "無効化済"}
                      </span>
                      <code className="font-mono font-medium text-foreground text-[11px] truncate max-w-[180px] sm:max-w-none">
                        {inv.code}
                      </code>
                      <span className="text-muted-foreground text-[11px]">
                        (申請: {inv.useCount}回)
                      </span>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      <span className="text-muted-foreground text-[11px]">
                        {inv.status === "revoked"
                          ? `無効化日時: ${
                              // biome-ignore lint/style/noNonNullAssertion: revokedAt is set when status is revoked
                              new Date(inv.revokedAt!).toLocaleString("ja-JP")
                            }`
                          : `期限: ${new Date(inv.expiresAt).toLocaleString("ja-JP")}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(inv.code);
                          toast.success("招待コードをコピーしました");
                        }}
                        className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition cursor-pointer"
                        title="コードをコピー"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      {inv.status === "active" && (
                        <>
                          <button
                            type="button"
                            onClick={() => setSelectedInviteCode(inv.code)}
                            className="px-1.5 py-0.5 text-[11px] text-foreground bg-muted hover:bg-accent rounded border border-border transition cursor-pointer"
                          >
                            QR表示
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRevokeInvite(inv._id)}
                            className="px-1.5 py-0.5 text-[11px] text-red-500 hover:bg-red-500/10 rounded transition cursor-pointer"
                          >
                            無効化
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
