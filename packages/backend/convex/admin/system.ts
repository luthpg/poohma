import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalQuery } from "../_generated/server";
import { systemAdminAction, systemAdminQuery } from "../customBuilders";

/**
 * DB Ping計測用の内部クエリ
 */
export const pingDbInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    // 最小限のインデックスクエリで疎通確認
    const firstLog = await ctx.db.query("auditLogs").take(1);
    return { ok: true, timestamp: Date.now(), count: firstLog.length };
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

export interface ServiceHealth {
  id: string;
  name: string;
  category: "database" | "auth" | "cms" | "email" | "nlp" | "geo";
  description: string;
  status: HealthStatus;
  latencyMs: number;
  message: string;
  details?: Record<string, string | number | boolean>;
}

export interface SystemHealthResult {
  checkedAt: number;
  allHealthy: boolean;
  services: ServiceHealth[];
}

/**
 * 外部接続（外接）全6基盤のリアルタイムヘルスチェック
 */
export const checkSystemHealth = systemAdminAction({
  args: {},
  handler: async (ctx): Promise<SystemHealthResult> => {
    // 1. Convex DB
    const checkDb = async (): Promise<ServiceHealth> => {
      const t0 = Date.now();
      try {
        await ctx.runQuery(internal.admin.system.pingDbInternal, {});
        const latencyMs = Date.now() - t0;
        return {
          id: "convex_db",
          name: "Convex Database",
          category: "database",
          description: "リアクティブドキュメントDB & リアルタイム同期",
          status: latencyMs < 300 ? "healthy" : "degraded",
          latencyMs,
          message: "正常にクエリを実行できました",
        };
      } catch {
        return {
          id: "convex_db",
          name: "Convex Database",
          category: "database",
          description: "リアクティブドキュメントDB & リアルタイム同期",
          status: "error",
          latencyMs: Date.now() - t0,
          message: "DB接続またはクエリ実行に失敗しました",
        };
      }
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

        if (res.ok) {
          return {
            id: "firebase_auth",
            name: "Firebase Authentication",
            category: "auth",
            description: "Google OAuth 2.0 & IDトークン検証基盤",
            status: latencyMs < 1000 ? "healthy" : "degraded",
            latencyMs,
            message: "Google 公開鍵・認証エンドポイント正常応答",
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
        };
      }
    };

    // 3. microCMS (Content API)
    const checkMicroCms = async (): Promise<ServiceHealth> => {
      const t0 = Date.now();
      const domain = process.env.MICROCMS_SERVICE_DOMAIN;
      const key = process.env.MICROCMS_API_KEY;

      if (!domain || !key) {
        return {
          id: "microcms",
          name: "microCMS",
          category: "cms",
          description: "ヘッドレスCMS (info / faq / legal)",
          status: "unconfigured",
          latencyMs: 0,
          message: "MICROCMS_SERVICE_DOMAIN または API_KEY が未設定です",
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

        if (res.ok) {
          return {
            id: "microcms",
            name: "microCMS",
            category: "cms",
            description: "ヘッドレスCMS (info / faq / legal)",
            status: latencyMs < 800 ? "healthy" : "degraded",
            latencyMs,
            message: "Content API 正常疎通 (info エンドポイント応答)",
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
        };
      }
    };

    // 4. Resend (Email Delivery)
    const checkResend = async (): Promise<ServiceHealth> => {
      const t0 = Date.now();
      const apiKey = process.env.RESEND_API_KEY;

      if (!apiKey) {
        return {
          id: "resend",
          name: "Resend",
          category: "email",
          description: "トランザクションメール配信 (招待・通知)",
          status: "unconfigured",
          latencyMs: 0,
          message: "RESEND_API_KEY が未設定です (メール送信はスキップされます)",
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

        if (res.ok) {
          return {
            id: "resend",
            name: "Resend",
            category: "email",
            description: "トランザクションメール配信 (招待・通知)",
            status: latencyMs < 800 ? "healthy" : "degraded",
            latencyMs,
            message: "APIキー認証成功 & 正常疎通",
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
        };
      }
    };

    // 5. Yahoo! テキスト解析 API (ふりがな補完)
    const checkYahoo = async (): Promise<ServiceHealth> => {
      const t0 = Date.now();
      const appId = process.env.YAHOO_CLIENT_ID;

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
        };
      }
    };

    // 6. Abstract IP Geolocation API (Geo-IP 位置情報)
    const checkAbstractGeo = async (): Promise<ServiceHealth> => {
      const t0 = Date.now();
      const apiKey = process.env.ABSTRACT_IP_GEOLOCATION_API_KEY;

      if (!apiKey) {
        return {
          id: "abstract_geo",
          name: "Abstract IP Geolocation",
          category: "geo",
          description: "ログイン通知・アクセス元IP位置情報解析",
          status: "unconfigured",
          latencyMs: 0,
          message: "ABSTRACT_IP_GEOLOCATION_API_KEY が未設定です",
        };
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        // パブリックDNS IPで疎通確認
        const res = await fetch(
          `https://ip-intelligence.abstractapi.com/v1/?api_key=${apiKey}&ip=1.1.1.1`,
          { signal: controller.signal },
        );
        clearTimeout(timer);
        const latencyMs = Date.now() - t0;

        if (res.ok) {
          return {
            id: "abstract_geo",
            name: "Abstract IP Geolocation",
            category: "geo",
            description: "ログイン通知・アクセス元IP位置情報解析",
            status: latencyMs < 1000 ? "healthy" : "degraded",
            latencyMs,
            message: "Geo-IP API 正常疎通",
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

    return {
      checkedAt: Date.now(),
      allHealthy,
      services: results,
    };
  },
});
