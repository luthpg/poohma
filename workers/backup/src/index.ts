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

  let deploymentIdentifier = rawKey;
  for (const prefix of ["prod:", "preview:", "dev:"]) {
    if (deploymentIdentifier.startsWith(prefix)) {
      deploymentIdentifier = deploymentIdentifier.slice(prefix.length);
      break;
    }
  }

  while (deploymentIdentifier.endsWith("/")) {
    deploymentIdentifier = deploymentIdentifier.slice(0, -1);
  }

  const baseUrl = deploymentIdentifier.startsWith("http")
    ? deploymentIdentifier
    : `https://${deploymentIdentifier}.convex.cloud`;

  const authHeaders = {
    Authorization: `Convex ${env.CONVEX_DEPLOY_KEY}`,
    "Content-Type": "application/json",
    "Convex-Client": "npm-1.43.0",
  };

  console.log(
    `[Backup] Checking existing latest export state before request...`,
  );

  // リクエスト送信前に既存の最新エクスポート start_ts を確認（直前の完了エクスポート誤取得防止）
  let initialExportTs: string | undefined;
  const initialQueryRes = await fetch(`${baseUrl}/api/query`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      path: "_system/cli/exports:getLatest",
      args: [{}],
      format: "json",
    }),
  });
  if (!initialQueryRes.ok) {
    const errorText = await initialQueryRes.text();
    throw new Error(
      `[Backup] Failed to check initial export state (${initialQueryRes.status}): ${errorText}`,
    );
  }
  const initialQueryText = await initialQueryRes.text();
  const initialData = JSON.parse(initialQueryText) as {
    value?: ExportStatus | null;
    status?: string;
    errorMessage?: string;
  };
  if (initialData.status === "error") {
    throw new Error(
      `[Backup] Query returned error on initial check: ${initialData.errorMessage}`,
    );
  }
  if (initialData.value?.start_ts != null) {
    initialExportTs = String(initialData.value.start_ts);
    console.log(`[Backup] Found previous export start_ts: ${initialExportTs}`);
  }

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
        `[Backup] Polling export status (attempt ${attempt}/${maxAttempts}): state=${exportState?.state ?? "null"} start_ts=${exportState?.start_ts ?? "null"}`,
      );

      if (
        exportState?.state === "completed" &&
        exportState.start_ts != null &&
        (initialExportTs == null ||
          String(exportState.start_ts) !== initialExportTs)
      ) {
        snapshotExportTs = String(exportState.start_ts);
        console.log(
          `[Backup] Export completed successfully! Timestamp: ${snapshotExportTs}`,
        );
        break;
      }

      if (
        initialExportTs != null &&
        String(exportState?.start_ts) === initialExportTs
      ) {
        console.log(
          `[Backup] Previous export still displayed (start_ts=${initialExportTs}), awaiting new export completion...`,
        );
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

  console.log(`[Backup] 4. Validating and streaming zip to Cloudflare R2...`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `convex_backup_${timestamp}.zip`;

  const { size } = await uploadZipStreamToR2(
    env.BACKUP_BUCKET,
    fileName,
    downloadRes.body,
    {
      httpMetadata: {
        contentType: "application/zip",
      },
      customMetadata: {
        exportedAt: new Date().toISOString(),
        trigger: "scheduled",
        deployment: deploymentIdentifier,
        snapshotTs: snapshotExportTs,
      },
    },
  );

  console.log(
    `[Backup Success] Successfully exported and saved ${fileName} (${size} bytes) to R2.`,
  );

  return { fileName };
}

export const MULTIPART_PART_SIZE = 8 * 1024 * 1024; // 8 MiB (R2 最小 5MiB 制約を満たす)

export interface UploadZipOptions {
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
  partSize?: number;
}

function concatChunks(chunks: Uint8Array[], totalLength: number): Uint8Array {
  if (chunks.length === 1 && chunks[0].length === totalLength) {
    return chunks[0];
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * ReadableStream を ZIP 検証しながら Cloudflare R2 へマルチパートアップロードする
 * - ストリーム長が事前不明でも確実に保存可能 (FixedLengthStream 不要)
 * - メモリ常駐は最大 1 パート分 (8 MiB) に制限し、サイズ無制限の全件読み込みを回避
 * - 先頭 4 バイトのマジックナンバー (PK\x03\x04) をアップロード前に検証
 * - 中断・エラー発生時は abort() で R2 の未完了マルチパートを確実に後始末
 * - 保存完了後に head() でサイズ突合を検証
 */
export async function uploadZipStreamToR2(
  bucket: R2Bucket,
  key: string,
  stream: ReadableStream<Uint8Array>,
  options?: UploadZipOptions,
): Promise<{ key: string; size: number }> {
  const reader = stream.getReader();
  const initialChunks: Uint8Array[] = [];
  let accumulatedLength = 0;

  while (accumulatedLength < 4) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.length > 0) {
      initialChunks.push(value);
      accumulatedLength += value.length;
    }
  }

  if (accumulatedLength < 4) {
    throw new Error(
      `[Backup] Downloaded zip is corrupted or empty (size < 4 bytes, actual: ${accumulatedLength} bytes)`,
    );
  }

  // 先頭4バイトを抽出して ZIP マジックナンバー (0x50, 0x4b, 0x03, 0x04) を検証
  const header = new Uint8Array(4);
  let offset = 0;
  for (const chunk of initialChunks) {
    const copyLength = Math.min(chunk.length, 4 - offset);
    header.set(chunk.subarray(0, copyLength), offset);
    offset += copyLength;
    if (offset >= 4) break;
  }

  const isZip =
    header[0] === 0x50 &&
    header[1] === 0x4b &&
    header[2] === 0x03 &&
    header[3] === 0x04;
  if (!isZip) {
    throw new Error(
      `[Backup] Downloaded file lacks valid ZIP magic number (header: ${Array.from(header).join(",")})`,
    );
  }

  const partSize = options?.partSize ?? MULTIPART_PART_SIZE;
  const multipart = await bucket.createMultipartUpload(key, {
    httpMetadata: options?.httpMetadata,
    customMetadata: options?.customMetadata,
  });

  const uploadedParts: R2UploadedPart[] = [];
  let partNumber = 1;
  let currentPartChunks: Uint8Array[] = [...initialChunks];
  let currentPartLength = accumulatedLength;
  let totalBytesUploaded = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length > 0) {
        currentPartChunks.push(value);
        currentPartLength += value.length;

        if (currentPartLength >= partSize) {
          const partBuffer = concatChunks(currentPartChunks, currentPartLength);
          const uploadedPart = await multipart.uploadPart(
            partNumber,
            partBuffer,
          );
          uploadedParts.push(uploadedPart);
          totalBytesUploaded += currentPartLength;
          partNumber++;
          currentPartChunks = [];
          currentPartLength = 0;
        }
      }
    }

    // 残りのバッファがあれば最終パートとしてアップロード (1パートのみで完了する場合も含む)
    if (currentPartLength > 0 || uploadedParts.length === 0) {
      const partBuffer = concatChunks(currentPartChunks, currentPartLength);
      const uploadedPart = await multipart.uploadPart(partNumber, partBuffer);
      uploadedParts.push(uploadedPart);
      totalBytesUploaded += currentPartLength;
    }

    await multipart.complete(uploadedParts);
  } catch (error) {
    // 途中中断・例外発生時は R2 未完了パートを確実に abort
    try {
      await multipart.abort();
    } catch (_abortErr) {
      // abort自体の失敗は元の例外を優先
    }
    throw error;
  }

  // アップロード後の実データ検証 (サイズ突合)
  const headObj = await bucket.head(key);
  if (!headObj) {
    throw new Error(
      `[Backup] Uploaded object not found in R2 after completion: ${key}`,
    );
  }
  if (headObj.size !== totalBytesUploaded) {
    throw new Error(
      `[Backup] Uploaded size mismatch in R2: expected ${totalBytesUploaded} bytes, actual ${headObj.size} bytes`,
    );
  }

  return { key, size: totalBytesUploaded };
}
