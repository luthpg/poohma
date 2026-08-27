export interface Env {
  BACKUP_BUCKET: R2Bucket;
  CONVEX_DEPLOY_KEY: string;
}

interface ExportStatus {
  state: "requested" | "in_progress" | "completed" | "failed";
  start_ts?: number | string;
  complete_ts?: number | string;
}

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(runBackup(env));
  },
};

async function runBackup(env: Env): Promise<{ fileName: string }> {
  if (!env.CONVEX_DEPLOY_KEY) {
    throw new Error("CONVEX_DEPLOY_KEY is not set in Cloudflare Secrets.");
  }

  const [rawKey] = env.CONVEX_DEPLOY_KEY.split("|");
  if (!rawKey) {
    throw new Error("Invalid CONVEX_DEPLOY_KEY format.");
  }

  const deploymentIdentifier = rawKey.replace(/^(prod|preview|dev):/, "");
  const baseUrl = deploymentIdentifier.startsWith("http")
    ? deploymentIdentifier.replace(/\/+$/, "")
    : `https://${deploymentIdentifier}.convex.cloud`;

  const authHeaders = {
    Authorization: `Convex ${env.CONVEX_DEPLOY_KEY}`,
    "Content-Type": "application/json",
    "Convex-Client": "npm-1.43.0",
  };

  console.log(
    `[Backup] 1. Requesting snapshot export from Convex (${baseUrl})...`,
  );

  // 1. スナップショットエクスポート（ZIP）の生成リクエスト
  const requestRes = await fetch(
    `${baseUrl}/api/export/request/zip?includeStorage=false`,
    {
      method: "POST",
      headers: authHeaders,
    },
  );

  const requestResText = await requestRes.text();
  console.log(
    `[Backup] Step 1 response (${requestRes.status}): ${requestResText}`,
  );

  if (!requestRes.ok) {
    console.error(
      `[Backup] Failed to request export (${requestRes.status}): ${requestResText}`,
    );
    throw new Error(
      `Convex export request failed (${requestRes.status}): ${requestResText}`,
    );
  }

  console.log("[Backup] 2. Waiting for export to complete...");

  // 2. エクスポート完了のポーリング（最大2分、2秒間隔）
  let snapshotExportTs: string | undefined;
  const maxAttempts = 60;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const queryRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        path: "_system/cli/exports:getLatest",
        args: [{}],
        format: "json",
      }),
    });

    const queryResText = await queryRes.text();
    if (!queryRes.ok) {
      console.warn(
        `[Backup] Failed to poll export status (${queryRes.status}): ${queryResText}`,
      );
      continue;
    }

    try {
      const queryData = JSON.parse(queryResText) as {
        value?: ExportStatus | null;
        status?: string;
        errorMessage?: string;
      };

      if (queryData.status === "error") {
        console.error(
          `[Backup] Query returned error: ${queryData.errorMessage}`,
        );
        throw new Error(`Convex query error: ${queryData.errorMessage}`);
      }

      const exportState = queryData.value;
      console.log(
        `[Backup] Polling export status (attempt ${attempt}/${maxAttempts}): state=${exportState?.state ?? "null"}`,
      );

      if (exportState?.state === "completed" && exportState.start_ts != null) {
        snapshotExportTs = String(exportState.start_ts);
        console.log(
          `[Backup] Export completed successfully! Timestamp: ${snapshotExportTs}`,
        );
        break;
      }

      if (exportState?.state === "failed") {
        throw new Error("Convex snapshot export failed on the server.");
      }
    } catch (parseErr) {
      console.warn(`[Backup] JSON parse error on poll:`, parseErr);
    }
  }

  if (!snapshotExportTs) {
    throw new Error("Timed out waiting for Convex export to complete.");
  }

  console.log(
    `[Backup] 3. Downloading snapshot ZIP from timestamp ${snapshotExportTs}...`,
  );

  // 3. 生成された ZIP ファイルのダウンロード
  const downloadRes = await fetch(
    `${baseUrl}/api/export/zip/${snapshotExportTs}`,
    {
      method: "GET",
      headers: {
        Authorization: `Convex ${env.CONVEX_DEPLOY_KEY}`,
        "Convex-Client": "npm-1.43.0",
      },
    },
  );

  if (!downloadRes.ok || !downloadRes.body) {
    const errText = await downloadRes.text().catch(() => "");
    console.error(
      `[Backup] Failed to download export zip (${downloadRes.status}): ${errText}`,
    );
    throw new Error(
      `Failed to download export zip (${downloadRes.status}): ${errText}`,
    );
  }

  console.log(`[Backup] 4. Saving zip to Cloudflare R2...`);

  // 4. Cloudflare R2 への保存
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `convex_backup_${timestamp}.zip`;

  await env.BACKUP_BUCKET.put(fileName, downloadRes.body, {
    httpMetadata: {
      contentType: "application/zip",
    },
    customMetadata: {
      exportedAt: new Date().toISOString(),
      trigger: "scheduled",
      deployment: deploymentIdentifier,
      snapshotTs: snapshotExportTs,
    },
  });

  console.log(
    `[Backup Success] Successfully exported and saved ${fileName} to R2.`,
  );

  return { fileName };
}
