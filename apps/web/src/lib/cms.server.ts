import type { MainServiceSchema } from "@poohma/shared/microcms";
import { createClient } from "microcms-js-sdk";
import { env } from "@/env/server";

// サーバーサイドでのみ初期化されるクライアント
export const microCmsClient = createClient<MainServiceSchema>({
  serviceDomain: env.MICROCMS_SERVICE_DOMAIN,
  apiKey: env.MICROCMS_API_KEY,
});
