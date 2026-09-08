import { encrypt, generateDEK, wrapDEK } from "@/lib/crypto";
import type {
  EncryptedSampleRecordInput,
  SampleRecordDefinition,
} from "./types";

/**
 * 初回体験用のサンプルデータ定義
 * 家族で共有する代表的なサービスとして「動画配信サービス」と「自宅Wi-Fiルーター」を提供
 */
export const SAMPLE_RECORDS: SampleRecordDefinition[] = [
  {
    title: "動画配信サービス",
    titleReading: "どうがはいしんさーびす",
    url: "https://example.com/streaming",
    ogpDescription: "家族みんなで映画やアニメを楽しめる動画配信サービスです。",
    memo: "リビングのテレビやタブレットからもこのアカウントでログインできます。",
    tags: ["エンタメ", "サブスク"],
    ownerType: "family",
    credentials: [
      {
        label: "ファミリープラン",
        loginId: "family@example.com",
        passwordHint: "実家の柴犬の名前＋生まれた西暦4桁",
      },
    ],
  },
  {
    title: "自宅Wi-Fiルーター",
    titleReading: "じたくわいふぁいるーたー",
    url: "http://192.168.1.1",
    ogpDescription: "自宅のインターネット接続ルーターの設定管理画面です。",
    memo: "リビングのテレビ台の奥にある黒いルーターです。電波が途切れた時は再起動してみてください。",
    tags: ["家電・機器", "自宅"],
    ownerType: "family",
    credentials: [
      {
        label: "管理者ログイン",
        loginId: "admin",
        passwordHint: "本体底面ラベルシールの英数字（上段）",
      },
    ],
  },
];

/**
 * サンプルデータのパスワードヒントを端末上で安全にエンベロープ暗号化
 * 平文はサーバーへ一切送信されず、E2EE不変条件（Invariants）を完全に維持
 */
export async function encryptSampleRecords(
  records: SampleRecordDefinition[],
  masterKey: CryptoKey,
): Promise<EncryptedSampleRecordInput[]> {
  const encryptedRecords: EncryptedSampleRecordInput[] = [];

  for (const record of records) {
    const encryptedCredentials = [];

    for (const cred of record.credentials) {
      const dek = await generateDEK();
      const hintEncrypted = await encrypt(cred.passwordHint, dek);
      const dekWrapped = await wrapDEK(dek, masterKey);

      encryptedCredentials.push({
        label: cred.label,
        loginId: cred.loginId,
        passwordHint: hintEncrypted.encrypted,
        passwordHintIv: hintEncrypted.iv,
        passwordHintDekEncrypted: dekWrapped.encrypted,
        passwordHintDekIv: dekWrapped.iv,
      });
    }

    encryptedRecords.push({
      title: record.title,
      titleReading: record.titleReading,
      url: record.url,
      ogpImage: record.ogpImage,
      ogpDescription: record.ogpDescription,
      memo: record.memo,
      tags: record.tags,
      ownerType: record.ownerType,
      credentials: encryptedCredentials,
    });
  }

  return encryptedRecords;
}
