import { api } from "@poohma/backend/api";
import { createFileRoute } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  ExternalLink,
  Gauge,
  Globe,
  HardDrive,
  Info,
  Key,
  Layers,
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`;
}

type DemoResetResult = FunctionReturnType<
  typeof api.admin.system.triggerDemoReset
>;
type SystemHealthResult = FunctionReturnType<
  typeof api.admin.system.checkSystemHealth
>;
type ServiceHealth = SystemHealthResult["services"][number];

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
      const clientToken =
        (import.meta.env.VITE_CONVEX_TEAM_ACCESS_TOKEN as string | undefined) ||
        (import.meta.env.CONVEX_TEAM_ACCESS_TOKEN as string | undefined);
      const res = await checkHealth(
        clientToken ? { teamAccessToken: clientToken } : {},
      );
      setHealthData(res);
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

      {/* Convex 全環境 Quota 監視バナー (Team Total) */}
      {healthData?.convexTeamMetrics ? (
        <div className="p-6 rounded-xl bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-white tracking-tight">
                    Convex 全環境リソース利用枠 (PoohMa Team Total)
                  </h2>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    LIVE USAGE
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  全 {healthData.convexTeamMetrics.deploymentsCount}{" "}
                  環境合算の当月リソース消費量（Starter プラン上限 1GB / 1M
                  calls 枠）
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {healthData.convexTeamMetrics.isDatabaseIoCritical && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  Database I/O 逼迫中 (
                  {healthData.convexTeamMetrics.databaseIoPercent}%)
                </span>
              )}
              <a
                href="https://dashboard.convex.dev"
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono flex items-center gap-1.5 transition-colors"
              >
                <span>Convex Console</span>
                <ExternalLink className="w-3 h-3 text-zinc-400" />
              </a>
            </div>
          </div>

          {/* 3大メトリクス (Database I/O, Function Calls, Data Egress) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Database I/O (最重要) */}
            <div
              className={`p-4 rounded-xl border ${
                healthData.convexTeamMetrics.isDatabaseIoCritical
                  ? "bg-rose-950/20 border-rose-500/40 shadow-lg shadow-rose-950/30"
                  : "bg-zinc-950/40 border-zinc-800/80"
              } space-y-2.5`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400 font-medium flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                  Database I/O (当月累計)
                </span>
                <span
                  className={`font-mono font-bold ${
                    healthData.convexTeamMetrics.isDatabaseIoCritical
                      ? "text-rose-400"
                      : "text-emerald-400"
                  }`}
                >
                  {healthData.convexTeamMetrics.databaseIoPercent}%
                </span>
              </div>
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-2xl font-bold text-white tracking-tight">
                  {healthData.convexTeamMetrics.totalDatabaseIoMb.toFixed(1)}
                  <span className="text-xs text-zinc-400 font-normal ml-1">
                    MB
                  </span>
                </span>
                <span className="text-xs text-zinc-500">
                  / {healthData.convexTeamMetrics.databaseIoLimitMb} MB
                </span>
              </div>
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    healthData.convexTeamMetrics.isDatabaseIoCritical
                      ? "bg-rose-500 animate-pulse shadow-sm shadow-rose-500"
                      : healthData.convexTeamMetrics.databaseIoPercent > 60
                        ? "bg-amber-400"
                        : "bg-emerald-500"
                  }`}
                  style={{
                    width: `${Math.min(100, healthData.convexTeamMetrics.databaseIoPercent)}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-zinc-500 leading-tight">
                {healthData.convexTeamMetrics.isDatabaseIoCritical
                  ? "⚠️ 帯域の80%以上を消費しています。上限に達すると書き込み制限や追加課金が発生します。"
                  : "テーブルの読取・書込で発生したI/O帯域です。"}
              </p>
            </div>

            {/* 2. Function Calls (月間実行数) */}
            <div className="p-4 rounded-xl bg-zinc-950/40 border border-zinc-800/80 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400 font-medium flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  Function Calls (月間実行数)
                </span>
                <span className="font-mono font-bold text-cyan-400">
                  {healthData.convexTeamMetrics.functionCallsPercent}%
                </span>
              </div>
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-2xl font-bold text-white tracking-tight">
                  {healthData.convexTeamMetrics.totalFunctionCalls.toLocaleString()}
                  <span className="text-xs text-zinc-400 font-normal ml-1">
                    回
                  </span>
                </span>
                <span className="text-xs text-zinc-500">
                  /{" "}
                  {(
                    healthData.convexTeamMetrics.functionCallsLimit / 1_000_000
                  ).toFixed(0)}
                  M 回
                </span>
              </div>
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-400 transition-all duration-500"
                  style={{
                    width: `${Math.min(100, healthData.convexTeamMetrics.functionCallsPercent)}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-zinc-500 leading-tight">
                全クエリ・ミューテーション・アクションの実行呼び出し総数です。
              </p>
            </div>

            {/* 3. Data Egress (データ転送量) */}
            <div className="p-4 rounded-xl bg-zinc-950/40 border border-zinc-800/80 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400 font-medium flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-purple-400" />
                  Data Egress (転送量)
                </span>
                <span className="font-mono font-bold text-purple-400">
                  {healthData.convexTeamMetrics.dataEgressPercent}%
                </span>
              </div>
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-2xl font-bold text-white tracking-tight">
                  {healthData.convexTeamMetrics.totalDataEgressMb.toFixed(1)}
                  <span className="text-xs text-zinc-400 font-normal ml-1">
                    MB
                  </span>
                </span>
                <span className="text-xs text-zinc-500">
                  / {healthData.convexTeamMetrics.dataEgressLimitMb} MB
                </span>
              </div>
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-400 transition-all duration-500"
                  style={{
                    width: `${Math.min(100, healthData.convexTeamMetrics.dataEgressPercent)}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-zinc-500 leading-tight">
                クライアントへのレスポンスや WebSocket
                購読で送出された帯域です。
              </p>
            </div>
          </div>

          {/* 全デプロイメント環境別内訳 (Breakdown) */}
          <div className="space-y-2 pt-2 border-t border-zinc-800/80">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
              <Layers className="w-3.5 h-3.5 text-zinc-400" />
              <span>
                デプロイ環境別内訳 (
                {healthData.convexTeamMetrics.deployments.length} デプロイ)
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {healthData.convexTeamMetrics.deployments.map((d) => (
                <div
                  key={d.name}
                  className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/70 text-xs font-mono space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="text-white font-semibold truncate"
                      title={d.name}
                    >
                      {d.name}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded border ${
                        d.deploymentType === "prod"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : "bg-zinc-800 text-zinc-400 border-zinc-700"
                      }`}
                    >
                      {d.deploymentType}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-0.5">
                    <span>
                      DB I/O:{" "}
                      <strong className="text-zinc-200">
                        {d.databaseIoMb.toFixed(1)} MB
                      </strong>
                    </span>
                    <span>
                      Calls:{" "}
                      <strong className="text-zinc-200">
                        {d.functionCalls.toLocaleString()}
                      </strong>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : healthData != null ? (
        <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/60 flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-zinc-500 shrink-0" />
            <span>
              CONVEX_TEAM_ACCESS_TOKEN を設定すると、Convex 全環境の合算
              Database I/O
              逼迫度や月間実行数のリアルタイムメトリクスが表示されます。
            </span>
          </div>
          <a
            href="https://dashboard.convex.dev"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-mono text-zinc-300 hover:text-white flex items-center gap-1 shrink-0 ml-4"
          >
            <span>Convex Dashboard</span>
            <ExternalLink className="w-3 h-3 text-zinc-500" />
          </a>
        </div>
      ) : null}

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
                  className="p-5 rounded-xl bg-zinc-900/40 border border-zinc-800/80 hover:border-zinc-700/80 transition-all flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-3">
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

                    {/* Database 固有のドキュメント数・ストレージ容量 */}
                    {svc.category === "database" && svc.details && (
                      <div className="pt-2 border-t border-zinc-800/60 text-[11px] font-mono text-zinc-400 space-y-1">
                        {typeof svc.details.totalDocumentsCount ===
                          "number" && (
                          <div className="flex justify-between">
                            <span className="text-zinc-500">
                              総ドキュメント数
                            </span>
                            <span className="text-zinc-200">
                              {svc.details.totalDocumentsCount.toLocaleString()}{" "}
                              件
                            </span>
                          </div>
                        )}
                        {typeof svc.details.totalStorageSizeBytes ===
                          "number" && (
                          <div className="flex justify-between">
                            <span className="text-zinc-500">
                              ファイルストレージ
                            </span>
                            <span className="text-zinc-200">
                              {formatBytes(svc.details.totalStorageSizeBytes)}
                              {typeof svc.details.storageFilesCount ===
                                "number" && (
                                <span className="text-zinc-500 ml-1">
                                  ({svc.details.storageFilesCount} files)
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Quota / レートリミットセクション */}
                  {svc.quota && (
                    <div className="pt-3 border-t border-zinc-800/60 space-y-2 mt-auto">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-zinc-400 flex items-center gap-1 font-medium">
                          <Gauge className="w-3 h-3 text-zinc-500" />
                          利用枠 / 制限
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                            svc.quota.type === "live"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              : "bg-zinc-800 text-zinc-400 border-zinc-700/60"
                          }`}
                        >
                          {(svc.quota.type ?? "spec").toUpperCase()}
                        </span>
                      </div>

                      {typeof svc.quota.remaining === "number" &&
                      typeof svc.quota.limit === "number" ? (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] font-mono">
                            <span className="text-zinc-400">残り枠</span>
                            <span className="text-white font-medium">
                              {svc.quota.remaining.toLocaleString()} /{" "}
                              {svc.quota.limit.toLocaleString()}{" "}
                              {svc.quota.unit ?? ""}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-400 transition-all"
                              style={{
                                width: `${Math.max(
                                  0,
                                  Math.min(
                                    100,
                                    (svc.quota.remaining / svc.quota.limit) *
                                      100,
                                  ),
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between text-[11px] font-mono">
                          <span className="text-zinc-500">仕様上限</span>
                          <span className="text-zinc-300 font-medium">
                            {svc.quota.limit
                              ? `${svc.quota.limit.toLocaleString()} ${svc.quota.unit ?? ""}`
                              : (svc.quota.unit ?? svc.quota.specLimit)}
                          </span>
                        </div>
                      )}

                      {svc.quota.resetSeconds != null && (
                        <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-500">
                          <Clock className="w-3 h-3 text-zinc-500" />
                          <span>{svc.quota.resetSeconds}秒後に枠リセット</span>
                        </div>
                      )}

                      {svc.quota.note && (
                        <p className="text-[10px] text-zinc-500 leading-tight">
                          {svc.quota.note}
                        </p>
                      )}
                    </div>
                  )}
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
                      <td className="py-3 px-4 font-mono text-zinc-400 whitespace-nowrap text-[11px]">
                        {new Date(log.createdAt).toLocaleString("ja-JP")}
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
                    {new Date(log.createdAt).toLocaleString("ja-JP")}
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
