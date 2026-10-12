import { api } from "@poohma/backend/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import {
  Activity,
  ArrowRight,
  Database,
  Globe,
  Key,
  Mail,
  MapPin,
  MessageSquare,
  RefreshCw,
  Server,
  Users,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CopyableBadge } from "../../components/ui/CopyableBadge";
import { LivePulse } from "../../components/ui/LivePulse";
import { StatusBadge } from "../../components/ui/StatusBadge";

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

export const Route = createFileRoute("/_auth/")({
  component: DashboardPage,
});

function getServiceIcon(category: ServiceHealth["category"]) {
  switch (category) {
    case "database":
      return <Database className="w-3.5 h-3.5 text-emerald-400" />;
    case "auth":
      return <Key className="w-3.5 h-3.5 text-blue-400" />;
    case "cms":
      return <Globe className="w-3.5 h-3.5 text-purple-400" />;
    case "email":
      return <Mail className="w-3.5 h-3.5 text-amber-400" />;
    case "nlp":
      return <Zap className="w-3.5 h-3.5 text-cyan-400" />;
    case "geo":
      return <MapPin className="w-3.5 h-3.5 text-rose-400" />;
    default:
      return <Server className="w-3.5 h-3.5 text-zinc-400" />;
  }
}

function getCompactStatusBadge(status: ServiceHealth["status"]) {
  switch (status) {
    case "healthy":
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          OK
        </span>
      );
    case "degraded":
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-400">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          DEG
        </span>
      );
    case "unconfigured":
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-500">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
          N/A
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-rose-400">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          ERR
        </span>
      );
  }
}

function DashboardPage() {
  const stats = useQuery(api.admin.stats.getSystemStats, {});
  const recentContacts = useQuery(api.admin.contacts.getContacts, {
    limit: 5,
  });

  const [healthData, setHealthData] = useState<SystemHealthResult | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const checkHealth = useAction(api.admin.system.checkSystemHealth);

  const runHealthCheck = useCallback(async () => {
    setIsCheckingHealth(true);
    try {
      const res = await checkHealth();
      setHealthData(res as SystemHealthResult);
    } catch {
      // 内部エラーは握る（KISS原則・情報漏洩防止）
    } finally {
      setIsCheckingHealth(false);
    }
  }, [checkHealth]);

  useEffect(() => {
    void runHealthCheck();
  }, [runHealthCheck]);

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* ページタイトル & ライブステータス */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>ダッシュボード</span>
            {healthData == null ? (
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                CHECKING...
              </span>
            ) : healthData.allHealthy ? (
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                ALL OPERATIONAL
              </span>
            ) : (
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                SYSTEM DEGRADED
              </span>
            )}
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            PoohMa サービス全体の利用メトリクスと運用ステータス
          </p>
        </div>

        <div className="flex items-center gap-3">
          <LivePulse status="online" label="Convex WebSocket Syncing" />
        </div>
      </div>

      {/* KPI 統計カードグリッド (デスクトップ: 4列 / モバイル: 1〜2列) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 総ユーザー数 (直近7日日別登録ミニバー付き) */}
        <div className="p-5 rounded-xl bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-sm relative overflow-hidden group hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
            <span>TOTAL USERS</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-4 flex items-end justify-between">
            <span className="text-3xl font-bold font-mono text-white tracking-tight">
              {stats?.totalUsers ?? "—"}
            </span>
            {/* 直近7日日別登録実績ミニバー */}
            <div
              className="flex items-end gap-1 h-6 shrink-0"
              title="直近7日間の日別サインアップ推移"
            >
              {[
                "day-6",
                "day-5",
                "day-4",
                "day-3",
                "day-2",
                "day-1",
                "day-0",
              ].map((dayId, idx) => {
                const count = stats?.userRegistrationDaily?.[idx] ?? 0;
                const max = Math.max(
                  1,
                  ...(stats?.userRegistrationDaily ?? [1]),
                );
                const heightPct = Math.max(16, Math.round((count / max) * 100));
                return (
                  <div
                    key={dayId}
                    className="w-1.5 rounded-t bg-cyan-400/70 hover:bg-cyan-300 transition-all cursor-default"
                    style={{ height: `${heightPct}%` }}
                    title={`${6 - idx === 0 ? "今日" : `${6 - idx}日前`}: ${count}人`}
                  />
                );
              })}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500 font-mono">
            直近7日新規: +{stats?.newUsersLast7Days ?? 0}
          </p>
        </div>

        {/* 総ファミリー数 (ファミリー所属率ミニメーター付き) */}
        <div className="p-5 rounded-xl bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-sm relative overflow-hidden group hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
            <span>FAMILIES</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-4 flex items-end justify-between">
            <span className="text-3xl font-bold font-mono text-white tracking-tight">
              {stats?.totalFamilies ?? "—"}
            </span>
            {/* 家族所属率プログレスバー */}
            <div className="w-20 space-y-1 shrink-0">
              <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                <span>所属率</span>
                <span className="text-indigo-400 font-bold">
                  {stats?.familyStats?.ratio ?? 0}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden flex">
                <div
                  className="bg-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${stats?.familyStats?.ratio ?? 0}%` }}
                />
              </div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500 font-mono">
            所属: {stats?.familyStats?.usersInFamily ?? 0}人 / ソロ:{" "}
            {stats?.familyStats?.soloUsers ?? 0}人
          </p>
        </div>

        {/* 登録レコード総数 (家族共有率ミニメーター付き) */}
        <div className="p-5 rounded-xl bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-sm relative overflow-hidden group hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
            <span>SERVICE RECORDS</span>
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-4 flex items-end justify-between">
            <span className="text-3xl font-bold font-mono text-white tracking-tight">
              {stats?.totalRecords ?? "—"}
            </span>
            {/* 共有率プログレスバー */}
            <div className="w-20 space-y-1 shrink-0">
              <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                <span>共有率</span>
                <span className="text-emerald-400 font-bold">
                  {stats?.recordStats?.ratio ?? 0}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden flex">
                <div
                  className="bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${stats?.recordStats?.ratio ?? 0}%` }}
                />
              </div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500 font-mono">
            共有: {stats?.recordStats?.familyRecords ?? 0}件 / 個人:{" "}
            {stats?.recordStats?.personalRecords ?? 0}件
          </p>
        </div>

        {/* 未読お問い合わせ (消化率スタックバー付き) */}
        <div className="p-5 rounded-xl bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-sm relative overflow-hidden group hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
            <span>PENDING CONTACTS</span>
            <MessageSquare className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-4 flex items-end justify-between">
            <span className="text-3xl font-bold font-mono text-white tracking-tight">
              {stats?.unreadContacts ?? "—"}
            </span>
            {/* ステータス別スタックバー */}
            <div className="w-20 space-y-1 shrink-0">
              <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                <span>消化率</span>
                <span className="text-amber-400 font-bold">
                  {stats?.contactStats?.total
                    ? `${Math.round(
                        (stats.contactStats.resolved /
                          stats.contactStats.total) *
                          100,
                      )}%`
                    : "100%"}
                </span>
              </div>
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden flex gap-0.5">
                {stats?.contactStats?.total ? (
                  <>
                    <div
                      className="bg-amber-400 transition-all"
                      style={{
                        width: `${(stats.contactStats.unread / stats.contactStats.total) * 100}%`,
                      }}
                      title={`未読: ${stats.contactStats.unread}件`}
                    />
                    <div
                      className="bg-blue-400 transition-all"
                      style={{
                        width: `${(stats.contactStats.read / stats.contactStats.total) * 100}%`,
                      }}
                      title={`対応中: ${stats.contactStats.read}件`}
                    />
                    <div
                      className="bg-emerald-400 transition-all"
                      style={{
                        width: `${(stats.contactStats.resolved / stats.contactStats.total) * 100}%`,
                      }}
                      title={`完了: ${stats.contactStats.resolved}件`}
                    />
                  </>
                ) : (
                  <div className="bg-emerald-500 w-full" />
                )}
              </div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500 font-mono">
            未読: {stats?.contactStats?.unread ?? 0} / 対応中:{" "}
            {stats?.contactStats?.read ?? 0} / 完了:{" "}
            {stats?.contactStats?.resolved ?? 0}
          </p>
        </div>
      </div>

      {/* 2カラム構成: 直近のお問い合わせ & システムヘルス */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左側: 直近のお問い合わせ (2カラム分) */}
        <div className="lg:col-span-2 p-6 rounded-xl bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div>
              <h2 className="text-base font-semibold text-white tracking-tight">
                直近のお問い合わせ
              </h2>
              <p className="text-xs text-zinc-500">
                ユーザーから受信した最新のメッセージ
              </p>
            </div>
            <Link
              to="/contacts"
              className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 transition-colors min-h-[44px] min-w-[44px] justify-end"
            >
              <span>すべて見る</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-2.5">
            {recentContacts == null ? (
              <div className="py-8 text-center text-xs text-zinc-500 font-mono">
                読み込み中...
              </div>
            ) : recentContacts.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500 font-mono">
                お問い合わせはありません
              </div>
            ) : (
              recentContacts.map((contact) => (
                <div
                  key={contact._id}
                  className="p-3.5 rounded-lg bg-zinc-950/60 border border-zinc-800/70 hover:border-zinc-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={contact.status} />
                      <span className="text-xs font-semibold text-zinc-200 truncate">
                        {contact.name}
                      </span>
                      <span className="text-[11px] text-zinc-500 font-mono hidden sm:inline">
                        ({contact.category})
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 line-clamp-1">
                      {contact.message}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                    <span className="text-[11px] text-zinc-500 font-mono">
                      {new Date(contact.createdAt).toLocaleDateString("ja-JP")}
                    </span>
                    <CopyableBadge value={contact.email} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 右側: システム運用 & 全6外接ヘルス状況 (1カラム分) */}
        <div className="p-6 rounded-xl bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div>
              <h2 className="text-base font-semibold text-white tracking-tight flex items-center gap-2">
                <span>システムステータス</span>
                {isCheckingHealth && (
                  <RefreshCw className="w-3 h-3 text-zinc-400 animate-spin" />
                )}
              </h2>
              <p className="text-xs text-zinc-500">
                全6外接サービスのリアルタイム健全性
              </p>
            </div>
            <button
              type="button"
              onClick={() => void runHealthCheck()}
              disabled={isCheckingHealth}
              className="text-xs text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
              title="再計測"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isCheckingHealth ? "animate-spin text-cyan-400" : ""}`}
              />
            </button>
          </div>

          <div className="space-y-2">
            {healthData == null ? (
              <div className="py-6 text-center text-xs text-zinc-500 font-mono">
                ヘルスチェック実行中...
              </div>
            ) : (
              healthData.services.map((srv) => (
                <div
                  key={srv.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/40 border border-zinc-800/50 hover:border-zinc-700/80 transition-colors text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {getServiceIcon(srv.category)}
                    <span className="text-zinc-300 font-medium truncate">
                      {srv.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="font-mono text-[11px] text-zinc-500">
                      {srv.latencyMs}ms
                    </span>
                    {getCompactStatusBadge(srv.status)}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="my-2 pt-2 border-t border-zinc-800">
            <Link
              to="/system"
              className="w-full h-10 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-mono text-zinc-300 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>システム運用管理を開く</span>
              <ArrowRight className="w-3.5 h-3.5 ml-auto text-zinc-500" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
