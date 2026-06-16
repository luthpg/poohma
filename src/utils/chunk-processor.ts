/**
 * 重い非同期処理を分割実行し、メインスレッドのフリーズを防ぐユーティリティ
 * @param items 処理対象の配列
 * @param processItem 1件あたりの非同期処理関数
 * @param chunkSize 1度に処理する件数（デフォルト: 10）
 * @param onProgress 進捗を通知するコールバック（オプション）
 */
export async function processInChunks<T, R>(
  items: T[],
  processItem: (item: T) => Promise<R>,
  chunkSize = 10,
  onProgress?: (current: number, total: number) => void,
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);

    // チャンク単位で並列処理
    const chunkResults = await Promise.all(chunk.map(processItem));
    results.push(...chunkResults);

    if (onProgress) {
      onProgress(Math.min(i + chunkSize, items.length), items.length);
    }

    // 次のチャンク処理へ移る前に、メインスレッドのキューを空にする（UI描画を許容する）
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return results;
}
