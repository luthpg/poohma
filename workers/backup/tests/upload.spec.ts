import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { uploadZipStreamToR2 } from "../src/index";

describe("uploadZipStreamToR2", () => {
  let mf: Miniflare;
  let bucket: R2Bucket;

  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response(null); } }",
      r2Buckets: ["BACKUP_BUCKET"],
    });
    bucket = (await mf.getR2Bucket("BACKUP_BUCKET")) as unknown as R2Bucket;
  });

  afterAll(async () => {
    await mf.dispose();
  });

  function createStreamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
    let index = 0;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(chunks[index]);
          index++;
        } else {
          controller.close();
        }
      },
    });
  }

  it("8MiB未満の正常なZIPストリームを1パートでR2に保存し、サイズと内容が一致すること", async () => {
    const key = "test_small.zip";
    // ZIP マジックナンバー (PK\x03\x04) + 100 バイトのペイロード
    const data = new Uint8Array(104);
    data[0] = 0x50;
    data[1] = 0x4b;
    data[2] = 0x03;
    data[3] = 0x04;
    for (let i = 4; i < 104; i++) {
      data[i] = i % 256;
    }

    const stream = createStreamFromChunks([data.subarray(0, 10), data.subarray(10)]);
    const res = await uploadZipStreamToR2(bucket, key, stream, {
      httpMetadata: { contentType: "application/zip" },
    });

    expect(res.key).toBe(key);
    expect(res.size).toBe(104);

    const obj = await bucket.get(key);
    expect(obj).not.toBeNull();
    expect(obj?.size).toBe(104);
    expect(obj?.httpMetadata?.contentType).toBe("application/zip");

    const savedBuffer = await obj?.arrayBuffer();
    expect(new Uint8Array(savedBuffer!)).toEqual(data);
  });

  it("パートサイズを超えるストリームが正しくマルチパート分割されて保存されること", async () => {
    const key = "test_large.zip";
    // R2 の制約: 最終パート以外は最低 5 MiB 必要
    const testPartSize = 5 * 1024 * 1024; // 5 MiB
    const totalSize = 5 * 1024 * 1024 + 1024; // 5 MiB + 1 KiB (2 パート: 5MiB + 1KiB)
    const data = new Uint8Array(totalSize);
    data[0] = 0x50;
    data[1] = 0x4b;
    data[2] = 0x03;
    data[3] = 0x04;
    for (let i = 4; i < 1000; i++) {
      data[i] = (i * 7) % 256;
    }

    // 1 MiB ずつ送出するストリーム
    const chunks: Uint8Array[] = [];
    const chunkSize = 1024 * 1024; // 1 MiB
    for (let offset = 0; offset < totalSize; offset += chunkSize) {
      chunks.push(data.subarray(offset, Math.min(offset + chunkSize, totalSize)));
    }

    const stream = createStreamFromChunks(chunks);
    const res = await uploadZipStreamToR2(bucket, key, stream, {
      partSize: testPartSize,
    });

    expect(res.key).toBe(key);
    expect(res.size).toBe(totalSize);

    const obj = await bucket.get(key);
    expect(obj?.size).toBe(totalSize);
    const headObj = await bucket.head(key);
    expect(headObj?.size).toBe(totalSize);
  });

  it("チャンク境界が partSize と揃わない場合でも厳密に partSize で切り出されて保存されること", async () => {
    const key = "test_unaligned_chunks.zip";
    const testPartSize = 5 * 1024 * 1024; // 5 MiB
    // 3 MiB チャンク × 2 = 6 MiB (5 MiB + 1 MiB に分割される)
    const totalSize = 6 * 1024 * 1024;
    const data = new Uint8Array(totalSize);
    data[0] = 0x50;
    data[1] = 0x4b;
    data[2] = 0x03;
    data[3] = 0x04;
    for (let i = 4; i < totalSize; i++) {
      data[i] = (i * 31) % 251;
    }

    const chunk1 = data.subarray(0, 3 * 1024 * 1024);
    const chunk2 = data.subarray(3 * 1024 * 1024);
    const stream = createStreamFromChunks([chunk1, chunk2]);

    const res = await uploadZipStreamToR2(bucket, key, stream, {
      partSize: testPartSize,
    });

    expect(res.key).toBe(key);
    expect(res.size).toBe(totalSize);

    const obj = await bucket.get(key);
    expect(obj?.size).toBe(totalSize);
    const saved = new Uint8Array((await obj?.arrayBuffer())!);
    expect(saved).toEqual(data);
  }, 15000);

  it("先頭4バイトがZIPマジックナンバーでない場合はエラーとなりR2に保存されないこと", async () => {
    const key = "test_invalid_magic.zip";
    const data = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
    const stream = createStreamFromChunks([data]);

    await expect(uploadZipStreamToR2(bucket, key, stream)).rejects.toThrow(
      "lacks valid ZIP magic number",
    );

    const obj = await bucket.get(key);
    expect(obj).toBeNull();
  });

  it("データが4バイト未満で破損している場合はエラーとなること", async () => {
    const key = "test_too_short.zip";
    const data = new Uint8Array([0x50, 0x4b]);
    const stream = createStreamFromChunks([data]);

    await expect(uploadZipStreamToR2(bucket, key, stream)).rejects.toThrow(
      "size < 4 bytes",
    );

    const obj = await bucket.get(key);
    expect(obj).toBeNull();
  });

  it("ストリーム読み取り中断・失敗時に abort されてR2に不完全なオブジェクトが残らないこと", async () => {
    const key = "test_aborted.zip";
    let chunkCount = 0;
    const failingStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunkCount++;
        if (chunkCount === 1) {
          controller.enqueue(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x05]));
        } else {
          controller.error(new Error("Network connection lost during download"));
        }
      },
    });

    await expect(uploadZipStreamToR2(bucket, key, failingStream)).rejects.toThrow(
      "Network connection lost during download",
    );

    const obj = await bucket.get(key);
    expect(obj).toBeNull();
  });
});
