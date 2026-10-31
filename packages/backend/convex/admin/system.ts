import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalQuery } from "../_generated/server";
import { systemAdminAction, systemAdminQuery } from "../customBuilders";

/**
 * DB Ping計測用の内部クエリ（実ファイル容量と主要テーブル件数の集計を含む）
 */
export const pingDbInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    // 最小限のインデックスクエリで疎通確認
    const firstLog = await ctx.db.query("auditLogs").take(1);

    // _storage システムテーブル集計（ファイル実容量と件数）
    let fileStorageBytes = 0;
    let fileCount = 0;
    try {
      const files = await ctx.db.system.query("_storage").collect();
      fileCount = files.length;
      fileStorageBytes = files.reduce((acc, f) => acc + (f.size ?? 0), 0);
    } catch {
      // システムテーブルアクセス失敗時は0
    }

    // 主要テーブル総ドキュメント件数集計
    let totalDocuments = 0;
    try {
      const [users, families, records, contacts, auditLogs] = await Promise.all(
        [
          ctx.db
            .query("users")
            .collect()
            .then((r) => r.length),
          ctx.db
            .query("families")
            .collect()
            .then((r) => r.length),
          ctx.db
            .query("serviceRecords")
            .collect()
            .then((r) => r.length),
          ctx.db
            .query("contacts")
            .collect()
            .then((r) => r.length),
          ctx.db
            .query("auditLogs")
            .collect()
            .then((r) => r.length),
        ],
      );
      totalDocuments = users + families + records + contacts + auditLogs;
    } catch {
      // エラー時はフォールバック
    }

    return {
      ok: true,
      timestamp: Date.now(),
      count: firstLog.length,
      fileStorageBytes,
      fileCount,
      totalDocuments,
    };
  },
});

/**
 * 管理コンソール向け監査ログ照会
 */
export const getSystemAuditLogs = systemAdminQuery({
  args: {
    limit: v.optional(v.number()),
    action: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit * 2);

    let filtered = logs;
    if (args.action != null && args.action.trim().length > 0) {
      filtered = filtered.filter((l) => l.action === args.action);
    }

    return filtered.slice(0, limit);
  },
});

export interface DemoResetResult {
  success: boolean;
  familyId?: string;
  kickedGuestsCount?: number;
  deletedRecordsCount?: number;
  insertedRecordsCount?: number;
  inviteCode?: string;
  skipped?: boolean;
  reason?: string;
}

/**
 * 管理コンソールからのデモ環境手動リセット
 */
export const triggerDemoReset = systemAdminAction({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<DemoResetResult> => {
    const result = await ctx.runMutation(
      internal.demo.resetDemoFamilyInternal,
      {
        triggeredBy: `Admin: ${ctx.adminEmail}`,
        reason: "Admin Console Manual Reset",
        force: args.force ?? true,
      },
    );
    return result as DemoResetResult;
  },
});

export type HealthStatus = "healthy" | "degraded" | "unconfigured" | "error";

export interface DeploymentUsageBreakdown {
  name: string;
  deploymentType: "prod" | "dev" | "preview" | string;
  functionCalls: number;
  databaseIoMb: number;
  dataEgressMb: number;
}

export interface ConvexTeamUsageMetrics {
  /** チーム全体合算 月間関数実行数 */
  totalFunctionCalls: number;
  functionCallsLimit: number; // 1,000,000
  functionCallsPercent: number;

  /** チーム全体合算 月間 Database I/O (MB) */
  totalDatabaseIoMb: number;
  databaseIoLimitMb: number; // 1,024 MB (1 GB)
  databaseIoPercent: number;
  isDatabaseIoCritical: boolean; // >= 80%

  /** チーム全体合算 月間 Data Egress (MB) */
  totalDataEgressMb: number;
  dataEgressLimitMb: number; // 1,024 MB
  dataEgressPercent: number;

  /** デプロイメント別内訳 */
  deploymentsCount: number;
  deployments: DeploymentUsageBreakdown[];

  /** 内部ファイルストレージ & 主要テーブル総件数 */
  fileStorageBytes: number;
  totalDocuments: number;
}

export interface ServiceQuota {
  limit?: number | string;
  remaining?: number | string;
  resetSeconds?: number;
  used?: number | string;
  usedFormatted?: string;
  limitFormatted?: string;
  usagePercent?: number;
  unit?: string;
  type?: "live" | "spec";
  specLimit: string;
  period: "second" | "minute" | "day" | "month";
  source: "header" | "specification" | "hybrid";
  note?: string;
  convexTeamMetrics?: ConvexTeamUsageMetrics;
}

export interface ServiceHealth {
  id: string;
  name: string;
  category: "database" | "auth" | "cms" | "email" | "nlp" | "geo";
  description: string;
  status: HealthStatus;
  latencyMs: number;
  message: string;
  quota?: ServiceQuota;
  details?: Record<string, string | number | boolean>;
}

export interface SystemHealthResult {
  checkedAt: number;
  allHealthy: boolean;
  services: ServiceHealth[];
  convexTeamMetrics?: ConvexTeamUsageMetrics;
}

function getHeader(headers: Headers, name: string): string | null {
  return headers.get(name) ?? headers.get(name.toLowerCase()) ?? null;
}

/**
 * 外部接続（外接）全6基盤のリアルタイムヘルスチェック
 */
export const checkSystemHealth = systemAdminAction({
  args: {
    teamAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SystemHealthResult> => {
    // 1. Convex DB
    const checkDb = async (): Promise<ServiceHealth> => {
      const t0 = Date.now();
      let dbPingRes: {
        fileStorageBytes?: number;
        fileCount?: number;
        totalDocuments?: number;
      } = {};
      try {
        dbPingRes = await ctx.runQuery(
          internal.admin.system.pingDbInternal,
          {},
        );
      } catch {
        // ping失敗時は後続判定
      }

      const token =
        args.teamAccessToken || process.env.CONVEX_TEAM_ACCESS_TOKEN;

      let convexTeamMetrics: ConvexTeamUsageMetrics | undefined;

      if (token) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6000);
          const tokenDetailsRes = await fetch(
            "https://api.convex.dev/v1/token_details",
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: controller.signal,
            },
          );
          if (tokenDetailsRes.ok) {
            const tokenDetails = (await tokenDetailsRes.json()) as {
              teamId?: number;
            };
            const teamId = tokenDetails.teamId;
            if (teamId != null) {
              const depRes = await fetch(
                `https://api.convex.dev/v1/teams/${teamId}/list_deployments`,
                {
                  headers: { Authorization: `Bearer ${token}` },
                  signal: controller.signal,
                },
              );
              if (depRes.ok) {
                const depData = (await depRes.json()) as {
                  items?: Array<{
                    name: string;
                    deploymentType: string;
                  }>;
                };
                const items = depData.items ?? [];

                const usages = await Promise.all(
                  items.map(async (d) => {
                    try {
                      const uRes = await fetch(
                        `https://${d.name}.convex.cloud/api/v1/get_current_usage`,
                        {
                          headers: {
                            Authorization: `Convex ${token}`,
                            "Content-Type": "application/json",
                          },
                          signal: controller.signal,
                        },
                      );
                      if (uRes.ok) {
                        const uData = (await uRes.json()) as {
                          metrics?: {
                            functionCalls?: {
                              usage?: { current_month?: number };
                            };
                            databaseIoGb?: {
                              usage?: { current_month?: number };
                            };
                            dataEgressGb?: {
                              usage?: { current_month?: number };
                            };
                          };
                        };
                        const calls =
                          uData.metrics?.functionCalls?.usage?.current_month ??
                          0;
                        const ioGb =
                          uData.metrics?.databaseIoGb?.usage?.current_month ??
                          0;
                        const egressGb =
                          uData.metrics?.dataEgressGb?.usage?.current_month ??
                          0;
                        return {
                          name: d.name,
                          deploymentType: d.deploymentType,
                          functionCalls: calls,
                          databaseIoMb: Math.round(ioGb * 1024 * 100) / 100,
                          dataEgressMb: Math.round(egressGb * 1024 * 100) / 100,
                        };
                      }
                    } catch {
                      // 個別デプロイエラーは握る
                    }
                    return {
                      name: d.name,
                      deploymentType: d.deploymentType,
                      functionCalls: 0,
                      databaseIoMb: 0,
                      dataEgressMb: 0,
                    };
                  }),
                );

                clearTimeout(timer);

                const totalCalls = usages.reduce(
                  (acc, u) => acc + u.functionCalls,
                  0,
                );
                const totalIoMb =
                  Math.round(
                    usages.reduce((acc, u) => acc + u.databaseIoMb, 0) * 100,
                  ) / 100;
                const totalEgressMb =
                  Math.round(
                    usages.reduce((acc, u) => acc + u.dataEgressMb, 0) * 100,
                  ) / 100;

                const callsLimit = 1_000_000;
                const ioLimitMb = 1_024;
                const egressLimitMb = 1_024;

                convexTeamMetrics = {
                  totalFunctionCalls: totalCalls,
                  functionCallsLimit: callsLimit,
                  functionCallsPercent:
                    Math.round((totalCalls / callsLimit) * 1000) / 10,
                  totalDatabaseIoMb: totalIoMb,
                  databaseIoLimitMb: ioLimitMb,
                  databaseIoPercent:
                    Math.round((totalIoMb / ioLimitMb) * 1000) / 10,
                  isDatabaseIoCritical: totalIoMb / ioLimitMb >= 0.8,
                  totalDataEgressMb: totalEgressMb,
                  dataEgressLimitMb: egressLimitMb,
                  dataEgressPercent:
                    Math.round((totalEgressMb / egressLimitMb) * 1000) / 10,
                  deploymentsCount: items.length,
                  deployments: usages,
                  fileStorageBytes: dbPingRes.fileStorageBytes ?? 0,
                  totalDocuments: dbPingRes.totalDocuments ?? 0,
                };
              }
            }
          }
          clearTimeout(timer);
        } catch {
          // トークン取得・パース失敗時はフォールバック
        }
      }

      const latencyMs = Date.now() - t0;
      const isOk = dbPingRes.totalDocuments != null || latencyMs < 2000;

      const quota: ServiceQuota = convexTeamMetrics
        ? {
            limit: `${convexTeamMetrics.databaseIoLimitMb} MB`,
            used: `${convexTeamMetrics.totalDatabaseIoMb} MB`,
            usagePercent: convexTeamMetrics.databaseIoPercent,
            specLimit: "Starter: 1GB I/O / 1M calls / 512MB DB",
            period: "month",
            source: "hybrid",
            unit: "MB",
            type: "live",
            note: `全${convexTeamMetrics.deploymentsCount}環境合算 / DB I/O: ${convexTeamMetrics.totalDatabaseIoMb}MB (${convexTeamMetrics.databaseIoPercent}%)`,
            convexTeamMetrics,
          }
        : {
            specLimit: "Starter: 1GB I/O / 1M calls / 512MB DB",
            period: "month",
            source: "specification",
            unit: "Starter仕様枠",
            type: "spec",
            note: "CONVEX_TEAM_ACCESS_TOKEN 未設定 (Starter仕様枠表示)",
          };

      return {
        id: "convex_db",
        name: "Convex Database",
        category: "database",
        description: "リアクティブドキュメントDB & リアルタイム同期",
        status: isOk ? (latencyMs < 500 ? "healthy" : "degraded") : "error",
        latencyMs,
        message: convexTeamMetrics
          ? `チーム全体 I/O: ${convexTeamMetrics.totalDatabaseIoMb} MB / 1 GB (${convexTeamMetrics.databaseIoPercent}%)`
          : "正常にクエリを実行できました",
        quota,
      };
    };

    // 2. Firebase Auth (Google JWKS / Token Verify Service)
    const checkFirebaseAuth = async (): Promise<ServiceHealth> => {
      const t0 = Date.now();
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(
          "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com",
          { signal: controller.signal },
        );
        clearTimeout(timer);
        const latencyMs = Date.now() - t0;

        const cacheControl = getHeader(res.headers, "cache-control");
        const maxAgeMatch = cacheControl?.match(/max-age=(\d+)/);
        const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : undefined;

        const quota: ServiceQuota = {
          limit: 50000,
          specLimit: "50,000 MAU (Identity Platform 無料枠)",
          period: "month",
          source: "specification",
          unit: "MAU",
          type: "spec",
          note: maxAgeSeconds
            ? `JWKS公開鍵キャッシュTTL: ${maxAgeSeconds}秒`
            : "無料枠 50,000 MAU / SMS別料金",
        };

        if (res.ok) {
          return {
            id: "firebase_auth",
            name: "Firebase Authentication",
            category: "auth",
            description: "Google OAuth 2.0 & IDトークン検証基盤",
            status: latencyMs < 1000 ? "healthy" : "degraded",
            latencyMs,
            message: "Google 公開鍵・認証エンドポイント正常応答",
            quota,
          };
        }
        return {
          id: "firebase_auth",
          name: "Firebase Authentication",
          category: "auth",
          description: "Google OAuth 2.0 & IDトークン検証基盤",
          status: "degraded",
          latencyMs,
          message: `HTTPステータス: ${res.status}`,
          quota,
        };
      } catch {
        return {
          id: "firebase_auth",
          name: "Firebase Authentication",
          category: "auth",
          description: "Google OAuth 2.0 & IDトークン検証基盤",
          status: "error",
          latencyMs: Date.now() - t0,
          message: "Firebase 認証エンドポイントへの接続に失敗しました",
          quota: {
            limit: 50000,
            specLimit: "50,000 MAU (Identity Platform 無料枠)",
            period: "month",
            source: "specification",
          },
        };
      }
    };

    // 3. microCMS (Content API)
    const checkMicroCms = async (): Promise<ServiceHealth> => {
      const t0 = Date.now();
      const domain = process.env.MICROCMS_SERVICE_DOMAIN;
      const key = process.env.MICROCMS_API_KEY;

      const defaultSpecQuota: ServiceQuota = {
        limit: 60,
        specLimit: "GET 60 req/s, WRITE 5 req/s",
        period: "second",
        source: "specification",
        unit: "req/s",
        type: "spec",
        note: "Hobbyプラン転送量 20GB/月 (APIリクエスト数無制限)",
      };

      if (!domain || !key) {
        return {
          id: "microcms",
          name: "microCMS",
          category: "cms",
          description: "ヘッドレスCMS (info / faq / legal)",
          status: "unconfigured",
          latencyMs: 0,
          message: "MICROCMS_SERVICE_DOMAIN または API_KEY が未設定です",
          quota: defaultSpecQuota,
        };
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(
          `https://${domain}.microcms.io/api/v1/info?limit=1`,
          {
            headers: { "X-MICROCMS-API-KEY": key },
            signal: controller.signal,
          },
        );
        clearTimeout(timer);
        const latencyMs = Date.now() - t0;

        const limitHeader = getHeader(res.headers, "x-ratelimit-limit");
        const remainingHeader = getHeader(res.headers, "x-ratelimit-remaining");
        const resetHeader = getHeader(res.headers, "x-ratelimit-reset");

        const hasRateLimit = limitHeader != null || remainingHeader != null;
        const quota: ServiceQuota = {
          limit: limitHeader ? Number(limitHeader) : 60,
          remaining: remainingHeader ? Number(remainingHeader) : undefined,
          resetSeconds: resetHeader ? Number(resetHeader) : undefined,
          specLimit: "GET 60 req/s, WRITE 5 req/s",
          period: "second",
          source: hasRateLimit ? "hybrid" : "specification",
          unit: "req/s",
          type: hasRateLimit ? "live" : "spec",
          note: "Hobbyプラン転送量 20GB/月 (APIリクエスト数無制限)",
        };

        if (res.ok) {
          return {
            id: "microcms",
            name: "microCMS",
            category: "cms",
            description: "ヘッドレスCMS (info / faq / legal)",
            status: latencyMs < 800 ? "healthy" : "degraded",
            latencyMs,
            message: "Content API 正常疎通 (info エンドポイント応答)",
            quota,
          };
        }
        return {
          id: "microcms",
          name: "microCMS",
          category: "cms",
          description: "ヘッドレスCMS (info / faq / legal)",
          status: "error",
          latencyMs,
          message: `APIエラー (HTTP ${res.status})`,
          quota,
        };
      } catch {
        return {
          id: "microcms",
          name: "microCMS",
          category: "cms",
          description: "ヘッドレスCMS (info / faq / legal)",
          status: "error",
          latencyMs: Date.now() - t0,
          message: "microCMS 接続タイムアウトまたはネットワーク障害",
          quota: defaultSpecQuota,
        };
      }
    };

    // 4. Resend (Email Delivery)
    const checkResend = async (): Promise<ServiceHealth> => {
      const t0 = Date.now();
      const apiKey = process.env.RESEND_API_KEY;

      const defaultSpecQuota: ServiceQuota = {
        limit: 10,
        specLimit: "10 req/s (Team全体)",
        period: "second",
        source: "specification",
        unit: "req/s",
        type: "spec",
        note: "Freeプラン 日次100通/月次3,000通",
      };

      if (!apiKey) {
        return {
          id: "resend",
          name: "Resend",
          category: "email",
          description: "トランザクションメール配信 (招待・通知)",
          status: "unconfigured",
          latencyMs: 0,
          message: "RESEND_API_KEY が未設定です (メール送信はスキップされます)",
          quota: defaultSpecQuota,
        };
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch("https://api.resend.com/api-keys", {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        });
        clearTimeout(timer);
        const latencyMs = Date.now() - t0;

        const limit = getHeader(res.headers, "ratelimit-limit");
        const remaining = getHeader(res.headers, "ratelimit-remaining");
        const resetSeconds = getHeader(res.headers, "ratelimit-reset");
        const dailyQuota = getHeader(res.headers, "x-resend-daily-quota");
        const monthlyQuota = getHeader(res.headers, "x-resend-monthly-quota");

        const hasRateLimit = limit != null || remaining != null;
        const quota: ServiceQuota = {
          limit: limit ? Number(limit) : 10,
          remaining: remaining ? Number(remaining) : undefined,
          resetSeconds: resetSeconds ? Number(resetSeconds) : undefined,
          used: dailyQuota ?? monthlyQuota ?? undefined,
          specLimit: "10 req/s (Team全体)",
          period: "second",
          source: hasRateLimit ? "hybrid" : "specification",
          unit: "req/s",
          type: hasRateLimit ? "live" : "spec",
          note: dailyQuota
            ? `日次送信量: ${dailyQuota}`
            : monthlyQuota
              ? `月次送信量: ${monthlyQuota}`
              : "Freeプラン 日次100通/月次3,000通",
        };

        if (res.ok) {
          return {
            id: "resend",
            name: "Resend",
            category: "email",
            description: "トランザクションメール配信 (招待・通知)",
            status: latencyMs < 800 ? "healthy" : "degraded",
            latencyMs,
            message: "APIキー認証成功 & 正常疎通",
            quota,
          };
        }
        return {
          id: "resend",
          name: "Resend",
          category: "email",
          description: "トランザクションメール配信 (招待・通知)",
          status: "error",
          latencyMs,
          message: `APIキー認証エラー (HTTP ${res.status})`,
          quota,
        };
      } catch {
        return {
          id: "resend",
          name: "Resend",
          category: "email",
          description: "トランザクションメール配信 (招待・通知)",
          status: "error",
          latencyMs: Date.now() - t0,
          message: "Resend API への接続に失敗しました",
          quota: defaultSpecQuota,
        };
      }
    };

    // 5. Yahoo! テキスト解析 API (ふりがな補完)
    const checkYahoo = async (): Promise<ServiceHealth> => {
      const t0 = Date.now();
      const appId = process.env.YAHOO_CLIENT_ID;

      const quota: ServiceQuota = {
        limit: 300,
        specLimit: "300 req/min (1 Client ID)",
        period: "minute",
        source: "specification",
        unit: "req/分",
        type: "spec",
        note: "1分間あたり300リクエスト超過時 HTTP 429",
      };

      if (!appId) {
        return {
          id: "yahoo_nlp",
          name: "Yahoo! テキスト解析",
          category: "nlp",
          description: "サービス名ふりがな自動補完",
          status: "unconfigured",
          latencyMs: 0,
          message:
            "YAHOO_CLIENT_ID が未設定です (入力補完はフォールバックします)",
          quota,
        };
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch("https://jlp.yahooapis.jp/jsonrpc", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": `Yahoo AppID: ${appId}`,
          },
          body: JSON.stringify({
            id: "ping",
            jsonrpc: "2.0",
            method: "jlp.furiganaservice.furigana",
            params: { q: "漢字" },
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        const latencyMs = Date.now() - t0;

        if (res.ok) {
          return {
            id: "yahoo_nlp",
            name: "Yahoo! テキスト解析",
            category: "nlp",
            description: "サービス名ふりがな自動補完",
            status: latencyMs < 800 ? "healthy" : "degraded",
            latencyMs,
            message: "JSON-RPC 疎通確認成功",
            quota,
          };
        }
        return {
          id: "yahoo_nlp",
          name: "Yahoo! テキスト解析",
          category: "nlp",
          description: "サービス名ふりがな自動補完",
          status: "error",
          latencyMs,
          message: `APIエラー (HTTP ${res.status})`,
          quota,
        };
      } catch {
        return {
          id: "yahoo_nlp",
          name: "Yahoo! テキスト解析",
          category: "nlp",
          description: "サービス名ふりがな自動補完",
          status: "error",
          latencyMs: Date.now() - t0,
          message: "Yahoo API への接続に失敗しました",
          quota,
        };
      }
    };

    // 6. Abstract IP Geolocation API (Geo-IP 位置情報)
    const checkAbstractGeo = async (): Promise<ServiceHealth> => {
      const t0 = Date.now();
      const apiKey = process.env.ABSTRACT_IP_GEOLOCATION_API_KEY;

      const defaultSpecQuota: ServiceQuota = {
        limit: 1,
        specLimit: "1 req/s (Free: 1,000 req/月)",
        period: "second",
        source: "specification",
        unit: "req/s",
        type: "spec",
        note: "無料枠 1,000回/月 (超過時 HTTP 429/422)",
      };

      if (!apiKey) {
        return {
          id: "abstract_geo",
          name: "Abstract IP Geolocation",
          category: "geo",
          description: "ログイン通知・アクセス元IP位置情報解析",
          status: "unconfigured",
          latencyMs: 0,
          message: "ABSTRACT_IP_GEOLOCATION_API_KEY が未設定です",
          quota: defaultSpecQuota,
        };
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(
          `https://ip-intelligence.abstractapi.com/v1/?api_key=${apiKey}&ip_address=1.1.1.1`,
          { signal: controller.signal },
        );
        clearTimeout(timer);
        const latencyMs = Date.now() - t0;

        const limit =
          getHeader(res.headers, "x-ratelimit-limit") ??
          getHeader(res.headers, "ratelimit-limit");
        const remaining =
          getHeader(res.headers, "x-ratelimit-remaining") ??
          getHeader(res.headers, "ratelimit-remaining");
        const reset =
          getHeader(res.headers, "x-ratelimit-reset") ??
          getHeader(res.headers, "retry-after");

        const hasLimit = limit != null || remaining != null;
        const quota: ServiceQuota = {
          limit: limit ? Number(limit) : 1,
          remaining: remaining ? Number(remaining) : undefined,
          resetSeconds: reset ? Number(reset) : undefined,
          specLimit: "1 req/s (Free: 1,000 req/月)",
          period: "second",
          source: hasLimit ? "hybrid" : "specification",
          unit: "req/s",
          type: hasLimit ? "live" : "spec",
          note: "無料枠 1,000回/月 (超過時 HTTP 429/422)",
        };

        if (res.ok) {
          return {
            id: "abstract_geo",
            name: "Abstract IP Geolocation",
            category: "geo",
            description: "ログイン通知・アクセス元IP位置情報解析",
            status: latencyMs < 1000 ? "healthy" : "degraded",
            latencyMs,
            message: "Geo-IP API 正常疎通",
            quota,
          };
        }
        return {
          id: "abstract_geo",
          name: "Abstract IP Geolocation",
          category: "geo",
          description: "ログイン通知・アクセス元IP位置情報解析",
          status: "error",
          latencyMs,
          message: `APIエラー (HTTP ${res.status})`,
          quota,
        };
      } catch {
        return {
          id: "abstract_geo",
          name: "Abstract IP Geolocation",
          category: "geo",
          description: "ログイン通知・アクセス元IP位置情報解析",
          status: "error",
          latencyMs: Date.now() - t0,
          message: "Abstract API への接続に失敗しました",
          quota: defaultSpecQuota,
        };
      }
    };

    // 6基盤を完全並列実行して高速判定
    const results = await Promise.all([
      checkDb(),
      checkFirebaseAuth(),
      checkMicroCms(),
      checkResend(),
      checkYahoo(),
      checkAbstractGeo(),
    ]);

    const allHealthy = results.every(
      (s) => s.status === "healthy" || s.status === "unconfigured",
    );

    const convexTeamMetrics = results.find((s) => s.category === "database")
      ?.quota?.convexTeamMetrics;

    return {
      checkedAt: Date.now(),
      allHealthy,
      services: results,
      convexTeamMetrics,
    };
  },
});
