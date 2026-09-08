import { queryOptions } from "@tanstack/react-query";
import {
  fetchFaqsServer,
  fetchLegalServer,
  fetchNewsDetailServer,
  fetchNewsListServer,
} from "@/services/cms.functions";

// ドキュメント類は更新頻度が低いため、インメモリキャッシュ（staleTime）を1時間に設定
const CMS_STALE_TIME = 1000 * 60 * 60; // 1時間
// お知らせは更新確認のため、staleTimeを5分に設定
const NEWS_STALE_TIME = 1000 * 60 * 5; // 5分

export const cmsQueries = {
  faqs: () =>
    queryOptions({
      queryKey: ["cms", "faqs"],
      queryFn: () => fetchFaqsServer(),
      staleTime: CMS_STALE_TIME,
    }),
  legal: () =>
    queryOptions({
      queryKey: ["cms", "legal"],
      queryFn: () => fetchLegalServer(),
      staleTime: CMS_STALE_TIME,
    }),
  newsList: (params?: { limit?: number; offset?: number }) =>
    queryOptions({
      queryKey: ["cms", "news", params],
      queryFn: () => fetchNewsListServer({ data: params }),
      staleTime: NEWS_STALE_TIME,
    }),
  newsDetail: (id: string) =>
    queryOptions({
      queryKey: ["cms", "news", id],
      queryFn: () => fetchNewsDetailServer({ data: id }),
      staleTime: NEWS_STALE_TIME,
    }),
};
