import { api } from "@poohma/backend/api";
import { createFileRoute } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Database,
  Globe,
  Key,
  Mail,
  MapPin,
  RefreshCw,
  Server,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { LivePulse } from "../../components/ui/LivePulse";

interface DemoResetResult {
  success: boolean;
  familyId?: string;
  kickedGuestsCount?: number;
  deletedRecordsCount?: number;
  insertedRecordsCount?: number;
  inviteCode?: string;
  skipped?: boolean;
  reason?: string;
}

interface ServiceHealth {
  id: string;
  name: string;
  category: "database" | "auth" | "cms" | "email" | "nlp" | "geo";
  description: string;
  status: "healthy" | "degraded" | "unconfigured" | "error";
  latencyMs: number;
  message: string;
}

interface SystemHealthResult {
  checkedAt: number;
  allHealthy: boolean;
  services: ServiceHealth[];
}

export const Route = createFileRoute("/_auth/system")({
  component: SystemPage,
});

function getServiceIcon(category: ServiceHealth["category"]) {
  switch (category) {
    case "database":
      return <Database className="w-4 h-4 text-emerald-400" />;
    case "auth":
      return <Key className="w-4 h-4 text-blue-400" />;
    case "cms":
      return <Globe className="w-4 h-4 text-purple-400" />;
    case "email":
      return <Mail className="w-4 h-4 text-amber-400" />;
    case "nlp":
      return <Zap className="w-4 h-4 text-cyan-400" />;
    case "geo":
      return <MapPin className="w-4 h-4 text-rose-400" />;
    default:
      return <Server className="w-4 h-4 text-zinc-400" />;
  }
}

function getStatusBadge(status: ServiceHealth["status"]) {
  switch (status) {
    case "healthy":
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Healthy
        </span>
      );
    case "degraded":
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          Degraded
        </span>
      );
    case "unconfigured":
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-zinc-800 text-zinc-400 border border-zinc-700/60">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
          Unconfigured
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-red-500/10 text-red-400 border border-red-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          Error
        </span>
      );
  }
}

function SystemPage() {
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [lastResetResult, setLastResetResult] =
    useState<DemoResetResult | null>(null);

  const [healthData, setHealthData] = useState<SystemHealthResult | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);

  const triggerReset = useAction(api.admin.system.triggerDemoReset);
  const checkHealth = useAction(api.admin.system.checkSystemHealth);
  const auditLogs = useQuery(api.admin.system.getSystemAuditLogs, {
    limit: 50,
  });

  const runHealthCheck = useCallback(async () => {
    setIsCheckingHealth(true);
    try {
      const res = await checkHealth();
      setHealthData(res as SystemHealthResult);
    } catch {
      toast.error("ヘルスチェックの実行に失敗しました");
    } finally {
      setIsCheckingHealth(false);
    }
  }, [checkHealth]);

  useEffect(() => {
    void runHealthCheck();
  }, [runHealthCheck]);

  const handleDemoReset = async () => {
    setIsResetting(true);
    try {
      const res = await triggerReset({ force: true });
      setLastResetResult(res);
      toast.success("デモ環境を正常にリセットしました");
      setResetConfirmOpen(false);
    } catch {
      toast.error("デモ環境のリセットに失敗しました");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* ページタイトル & ヘルスチェック再実行ボタン */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Activity className="w-6 h-6 text-emerald-400" />
            <span>外部接続ヘルス & システム運用</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            PoohMa が接続する全 6
            つの外部基盤のリアルタイム疎通判定・レイテンシ計測および運用管理
          </p>
        </div>

        <button
          type="button"
          onClick={runHealthCheck}
          disabled={isCheckingHealth}
          className="px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-white text-xs font-mono font-medium transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 min-h-[44px] shrink-0"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-zinc-400 ${isCheckingHealth ? "animate-spin text-emerald-400" : ""}`}
          />
          <span>{isCheckingHealth ? "計測中..." : "ヘルスチェック再実行"}</span>
        </button>
      </div>

      {/* リアルタイム外接ヘルスカードグリッド */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white tracking-tight">
              外部連携基盤ステータス (全 6 サービス)
            </h2>
            {healthData && (
              <span className="text-[11px] font-mono text-zinc-500">
                (最終計測:{" "}
                {new Date(healthData.checkedAt).toLocaleTimeString("ja-JP")})
              </span>
            )}
          </div>
          {healthData && (
            <LivePulse
              status={healthData.allHealthy ? "online" : "connecting"}
              label={healthData.allHealthy ? "ALL OPERATIONAL" : "DEGRADED"}
            />
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {healthData == null
            ? Array.from({ length: 6 }).map((_, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton loading
                  key={i}
                  className="p-5 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-3 animate-pulse"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-24 h-4 bg-zinc-800 rounded" />
                    <div className="w-16 h-4 bg-zinc-800 rounded-full" />
                  </div>
                  <div className="w-full h-8 bg-zinc-800/50 rounded" />
                  <div className="w-20 h-3 bg-zinc-800/30 rounded" />
                </div>
              ))
            : healthData.services.map((svc) => (
                <div
                  key={svc.id}
                  className="p-5 rounded-xl bg-zinc-900/40 border border-zinc-800/80 hover:border-zinc-700/80 transition-all space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-zinc-800/80">
                        {getServiceIcon(svc.category)}
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold text-white">
                          {svc.name}
                        </h3>
                        <p className="text-[10px] text-zinc-500 font-mono">
                          {svc.id}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(svc.status)}
                  </div>

                  <p className="text-xs text-zinc-400 line-clamp-1 leading-relaxed">
                    {svc.description}
                  </p>

                  <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px] font-mono">
                    <span className="text-zinc-500">レイテンシ</span>
                    <span
                      className={
                        svc.latencyMs > 800
                          ? "text-amber-400 font-bold"
                          : svc.latencyMs > 0
                            ? "text-emerald-400 font-medium"
                            : "text-zinc-500"
                      }
                    >
                      {svc.latencyMs > 0 ? `${svc.latencyMs} ms` : "—"}
                    </span>
                  </div>

                  <div className="text-[11px] text-zinc-500 font-mono whitespace-pre-wrap">
                    {svc.message}
                  </div>
                </div>
              ))}
        </div>
      </div>

      {/* デモ環境リセット管理セクション */}
      <div className="p-6 rounded-xl bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-red-400" />
              <span>デモファミリー環境の即時リセット</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              公開デモグループのゲストデータ（レコード、参加申請、監査ログ）を一括消去し初期状態へ復元します。
            </p>
          </div>

          <button
            type="button"
            onClick={() => setResetConfirmOpen(true)}
            className="px-4 py-2.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-mono font-medium transition-all flex items-center gap-2 cursor-pointer min-h-[44px] shrink-0"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>デモ環境をリセット</span>
          </button>
        </div>

        {lastResetResult && (
          <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1 text-emerald-300 font-mono">
            <div className="flex items-center gap-1.5 font-semibold">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>リセット実行完了</span>
            </div>
            <div className="text-[11px] text-zinc-400">
              削除レコード: {lastResetResult.deletedRecordsCount ?? 0} 件 /
              投入レコード: {lastResetResult.insertedRecordsCount ?? 0} 件 /
              kickゲスト: {lastResetResult.kickedGuestsCount ?? 0} 名
            </div>
          </div>
        )}
      </div>

      {/* システム監査ログビューア */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white tracking-tight">
              システム操作監査ログ (直近50件)
            </h2>
            <p className="text-xs text-zinc-500">
              全ファミリーおよびユーザーの操作ログ時系列記録
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 overflow-hidden">
          <div className="hidden md:block">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/60 border-b border-zinc-800/80 text-zinc-400 font-mono">
                <tr>
                  <th className="py-3 px-4">日時</th>
                  <th className="py-3 px-4">アクション</th>
                  <th className="py-3 px-4">操作者</th>
                  <th className="py-3 px-4">所有種別</th>
                  <th className="py-3 px-4">詳細</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {auditLogs == null ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-12 text-center text-zinc-500 font-mono"
                    >
                      読み込み中...
                    </td>
                  </tr>
                ) : auditLogs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-12 text-center text-zinc-500 font-mono"
                    >
                      監査ログがありません
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr
                      key={log._id}
                      className="hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-zinc-400 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleTimeString("ja-JP")}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700/60 text-[10px] font-mono text-zinc-300">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-zinc-300">
                        {log.actorDisplayName}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-zinc-400">
                        {log.ownerType}
                      </td>
                      <td className="py-3 px-4 text-zinc-400 max-w-sm truncate text-[11px]">
                        {log.metadata?.targetTitle ??
                          log.metadata?.detail ??
                          "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* モバイル表示 */}
          <div className="md:hidden divide-y divide-zinc-800/80">
            {auditLogs?.map((log) => (
              <div key={log._id} className="p-3.5 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                    {log.action}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-500">
                    {new Date(log.createdAt).toLocaleTimeString("ja-JP")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-zinc-300">
                  <span>{log.actorDisplayName}</span>
                  <span className="font-mono text-zinc-500 text-[10px]">
                    {log.ownerType}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* デモ環境リセット確認ボトムシート */}
      <BottomSheet
        isOpen={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        title="デモ環境のリセット確認"
        description="この操作は取り消せません"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 space-y-2">
            <p className="font-semibold">⚠️ 以下のデータが完全消去されます：</p>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-red-300/90 leading-relaxed">
              <li>
                デモファミリーに参加したゲストの共有レコードおよび個人レコード
              </li>
              <li>デモファミリー内の閲覧ログおよび監査ログ</li>
              <li>ゲストユーザーの参加ステータス（自動でkickされます）</li>
            </ul>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={handleDemoReset}
              disabled={isResetting}
              className="w-full h-12 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 min-h-[44px]"
            >
              <RefreshCw
                className={`w-4 h-4 ${isResetting ? "animate-spin" : ""}`}
              />
              <span>
                {isResetting
                  ? "リセット実行中..."
                  : "理解した上でリセットを実行する"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setResetConfirmOpen(false)}
              className="w-full h-11 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white text-xs font-medium cursor-pointer min-h-[44px]"
            >
              キャンセル
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
