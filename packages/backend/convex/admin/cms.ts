import type {
  Faq,
  Info,
  Legal,
  MainServiceSchema,
} from "@poohma/shared/microcms";
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

export const getCmsInfoList = systemAdminAction({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (
    _ctx,
    args,
  ): Promise<{
    contents: Info[];
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
        contents: Info[];
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
    slug: v.optional(v.string()),
    published_at: v.optional(v.string()),
    isDraft: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    const config = getMicroCmsConfig();
    const query = args.isDraft ? "?status=draft" : "";
    const url = `${config.baseUrl}/info${query}`;

    const body: MainServiceSchema["info"]["create"] = {
      title: args.title,
      slug: args.slug ?? `info-${Date.now()}`,
      content: args.content,
      published_at: args.published_at ?? new Date().toISOString(),
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-MICROCMS-API-KEY": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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
    slug: v.optional(v.string()),
    published_at: v.optional(v.string()),
    isDraft: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    const config = getMicroCmsConfig();
    const query = args.isDraft ? "?status=draft" : "";
    const url = `${config.baseUrl}/info/${encodeURIComponent(args.id)}${query}`;

    const body: MainServiceSchema["info"]["update"] = {
      title: args.title,
      content: args.content,
      ...(args.slug ? { slug: args.slug } : {}),
      ...(args.published_at ? { published_at: args.published_at } : {}),
    };

    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "X-MICROCMS-API-KEY": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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

export const getCmsFaqList = systemAdminAction({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (
    _ctx,
    args,
  ): Promise<{
    contents: Faq[];
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
        contents: Faq[];
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
    category: v.optional(v.string()),
    slug: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const config = getMicroCmsConfig();
    const url = `${config.baseUrl}/faq`;

    const body: MainServiceSchema["faq"]["create"] = {
      question: args.question,
      answer: args.answer,
      slug: args.slug ?? `faq-${Date.now()}`,
      ...(args.category ? { category: args.category } : {}),
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-MICROCMS-API-KEY": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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
    category: v.optional(v.string()),
    slug: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const config = getMicroCmsConfig();
    const url = `${config.baseUrl}/faq/${encodeURIComponent(args.id)}`;

    const body: MainServiceSchema["faq"]["update"] = {
      question: args.question,
      answer: args.answer,
      ...(args.category ? { category: args.category } : {}),
      ...(args.slug ? { slug: args.slug } : {}),
    };

    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "X-MICROCMS-API-KEY": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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

export const getCmsLegal = systemAdminAction({
  args: {},
  handler: async (
    _ctx,
  ): Promise<{
    data: Legal | null;
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
      const data = (await res.json()) as Legal;
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

    const body: MainServiceSchema["legal"]["update"] = {
      terms: args.terms,
      privacy: args.privacy,
      published_at: args.published_at ?? new Date().toISOString(),
    };

    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "X-MICROCMS-API-KEY": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`microCMS update Legal failed: ${res.statusText}`);
    }
    return { success: true };
  },
});
