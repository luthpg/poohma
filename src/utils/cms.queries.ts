// src/utils/cms.queries.ts
import { queryOptions } from "@tanstack/react-query";
import { fetchFaqsServer, fetchLegalServer } from "@/services/cms.functions";

// ドキュメント類は更新頻度が低いため、インメモリキャッシュ（staleTime）を1時間~24時間に設定
const CMS_STALE_TIME = 1000 * 60 * 60; // 1時間

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
};
