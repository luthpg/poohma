import { v } from "convex/values";
import { systemAdminAction } from "../customBuilders";

// 共通ヘルパー: microCMS 設定取得
function getMicroCmsConfig() {
  const serviceDomain = process.env.MICROCMS_SERVICE_DOMAIN;
  const apiKey = process.env.MICROCMS_API_KEY;
  if (!serviceDomain || !apiKey) {
    throw new Error(
      "microCMS is not configured (missing MICROCMS_SERVICE_DOMAIN or MICROCMS_API_KEY)",
    );
  }
  return {
    serviceDomain,
    apiKey,
    baseUrl: `https://${serviceDomain}.microcms.io/api/v1`,
  };
}

// -------------------------------------------------------------
// 1. info (お知らせ)
// -------------------------------------------------------------

export interface AdminNewsItem {
  id: string;
  title: string;
  content?: string;
  published_at?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  status?: "published" | "draft";
}

export const getCmsInfoList = systemAdminAction({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (
    _ctx,
    args,
  ): Promise<{
    contents: AdminNewsItem[];
    totalCount: number;
    configured: boolean;
  }> => {
    let config: ReturnType<typeof getMicroCmsConfig>;
    try {
      config = getMicroCmsConfig();
    } catch {
      return { contents: [], totalCount: 0, configured: false };
    }

    const limit = args.limit ?? 20;
    const offset = args.offset ?? 0;
    const url = `${config.baseUrl}/info?limit=${limit}&offset=${offset}&orders=-publishedAt,-createdAt`;

    try {
      const res = await fetch(url, {
        headers: { "X-MICROCMS-API-KEY": config.apiKey },
      });
      if (!res.ok) {
        return { contents: [], totalCount: 0, configured: true };
      }
      const data = (await res.json()) as {
        contents: AdminNewsItem[];
        totalCount: number;
      };
      return {
        contents: data.contents,
        totalCount: data.totalCount,
        configured: true,
      };
    } catch {
      return { contents: [], totalCount: 0, configured: true };
    }
  },
});

export const createCmsInfo = systemAdminAction({
  args: {
    title: v.string(),
    content: v.string(),
    published_at: v.optional(v.string()),
    isDraft: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    const config = getMicroCmsConfig();
    const query = args.isDraft ? "?status=draft" : "";
    const url = `${config.baseUrl}/info${query}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-MICROCMS-API-KEY": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: args.title,
        content: args.content,
        published_at: args.published_at ?? new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      throw new Error(`microCMS create failed: ${res.statusText}`);
    }
    return (await res.json()) as { id: string };
  },
});

export const updateCmsInfo = systemAdminAction({
  args: {
    id: v.string(),
    title: v.string(),
    content: v.string(),
    published_at: v.optional(v.string()),
    isDraft: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    const config = getMicroCmsConfig();
    const query = args.isDraft ? "?status=draft" : "";
    const url = `${config.baseUrl}/info/${encodeURIComponent(args.id)}${query}`;

    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "X-MICROCMS-API-KEY": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: args.title,
        content: args.content,
        published_at: args.published_at,
      }),
    });

    if (!res.ok) {
      throw new Error(`microCMS update failed: ${res.statusText}`);
    }
    return (await res.json()) as { id: string };
  },
});

export const deleteCmsInfo = systemAdminAction({
  args: {
    id: v.string(),
  },
  handler: async (_ctx, args) => {
    const config = getMicroCmsConfig();
    const url = `${config.baseUrl}/info/${encodeURIComponent(args.id)}`;

    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        "X-MICROCMS-API-KEY": config.apiKey,
      },
    });

    if (!res.ok) {
      throw new Error(`microCMS delete failed: ${res.statusText}`);
    }
    return { success: true };
  },
});

// -------------------------------------------------------------
// 2. faq (よくある質問)
// -------------------------------------------------------------

export interface AdminFaqItem {
  id: string;
  slug?: string;
  question: string;
  answer: string;
  category: string | { id?: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export const getCmsFaqList = systemAdminAction({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (
    _ctx,
    args,
  ): Promise<{
    contents: AdminFaqItem[];
    totalCount: number;
    configured: boolean;
  }> => {
    let config: ReturnType<typeof getMicroCmsConfig>;
    try {
      config = getMicroCmsConfig();
    } catch {
      return { contents: [], totalCount: 0, configured: false };
    }

    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;
    const url = `${config.baseUrl}/faq?limit=${limit}&offset=${offset}&orders=createdAt`;

    try {
      const res = await fetch(url, {
        headers: { "X-MICROCMS-API-KEY": config.apiKey },
      });
      if (!res.ok) {
        return { contents: [], totalCount: 0, configured: true };
      }
      const data = (await res.json()) as {
        contents: AdminFaqItem[];
        totalCount: number;
      };
      return {
        contents: data.contents,
        totalCount: data.totalCount,
        configured: true,
      };
    } catch {
      return { contents: [], totalCount: 0, configured: true };
    }
  },
});

export const createCmsFaq = systemAdminAction({
  args: {
    question: v.string(),
    answer: v.string(),
    category: v.string(),
    slug: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const config = getMicroCmsConfig();
    const url = `${config.baseUrl}/faq`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-MICROCMS-API-KEY": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question: args.question,
        answer: args.answer,
        category: args.category,
        slug: args.slug ?? `faq-${Date.now()}`,
      }),
    });

    if (!res.ok) {
      throw new Error(`microCMS create FAQ failed: ${res.statusText}`);
    }
    return (await res.json()) as { id: string };
  },
});

export const updateCmsFaq = systemAdminAction({
  args: {
    id: v.string(),
    question: v.string(),
    answer: v.string(),
    category: v.string(),
    slug: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const config = getMicroCmsConfig();
    const url = `${config.baseUrl}/faq/${encodeURIComponent(args.id)}`;

    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "X-MICROCMS-API-KEY": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question: args.question,
        answer: args.answer,
        category: args.category,
        ...(args.slug ? { slug: args.slug } : {}),
      }),
    });

    if (!res.ok) {
      throw new Error(`microCMS update FAQ failed: ${res.statusText}`);
    }
    return (await res.json()) as { id: string };
  },
});

export const deleteCmsFaq = systemAdminAction({
  args: {
    id: v.string(),
  },
  handler: async (_ctx, args) => {
    const config = getMicroCmsConfig();
    const url = `${config.baseUrl}/faq/${encodeURIComponent(args.id)}`;

    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        "X-MICROCMS-API-KEY": config.apiKey,
      },
    });

    if (!res.ok) {
      throw new Error(`microCMS delete FAQ failed: ${res.statusText}`);
    }
    return { success: true };
  },
});

// -------------------------------------------------------------
// 3. legal (利用規約 & プライバシーポリシー)
// -------------------------------------------------------------

export interface AdminLegalContent {
  terms: string;
  privacy: string;
  published_at?: string;
  updatedAt?: string;
}

export const getCmsLegal = systemAdminAction({
  args: {},
  handler: async (
    _ctx,
  ): Promise<{
    data: AdminLegalContent | null;
    configured: boolean;
  }> => {
    let config: ReturnType<typeof getMicroCmsConfig>;
    try {
      config = getMicroCmsConfig();
    } catch {
      return { data: null, configured: false };
    }

    const url = `${config.baseUrl}/legal`;

    try {
      const res = await fetch(url, {
        headers: { "X-MICROCMS-API-KEY": config.apiKey },
      });
      if (!res.ok) {
        return { data: null, configured: true };
      }
      const data = (await res.json()) as AdminLegalContent;
      return { data, configured: true };
    } catch {
      return { data: null, configured: true };
    }
  },
});

export const updateCmsLegal = systemAdminAction({
  args: {
    terms: v.string(),
    privacy: v.string(),
    published_at: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const config = getMicroCmsConfig();
    const url = `${config.baseUrl}/legal`;

    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "X-MICROCMS-API-KEY": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        terms: args.terms,
        privacy: args.privacy,
        published_at: args.published_at ?? new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      throw new Error(`microCMS update Legal failed: ${res.statusText}`);
    }
    return { success: true };
  },
});
