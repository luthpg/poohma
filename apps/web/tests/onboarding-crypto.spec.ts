import { describe, expect, it } from "vitest";
import { decrypt, generateMasterKey, unwrapDEK } from "@/lib/crypto";
import {
  encryptSampleRecords,
  SAMPLE_RECORDS,
} from "@/lib/onboarding/sampleData";

describe("オンボーディング サンプルデータ暗号化テスト", () => {
  it("encryptSampleRecords: マスターキーで暗号化されたパスワードヒントが正しく復号できること", async () => {
    const masterKey = await generateMasterKey();
    const encrypted = await encryptSampleRecords(SAMPLE_RECORDS, masterKey);

    expect(encrypted).toHaveLength(SAMPLE_RECORDS.length);

    for (let i = 0; i < SAMPLE_RECORDS.length; i++) {
      const original = SAMPLE_RECORDS[i];
      const encRecord = encrypted[i];

      expect(encRecord.title).toBe(original.title);
      expect(encRecord.credentials).toHaveLength(original.credentials.length);

      for (let j = 0; j < original.credentials.length; j++) {
        const origCred = original.credentials[j];
        const encCred = encRecord.credentials[j];

        // 平文がそのまま保持されていないこと
        expect(encCred.passwordHint).not.toBe(origCred.passwordHint);
        expect(encCred.passwordHintIv).toBeDefined();
        expect(encCred.passwordHintDekEncrypted).toBeDefined();
        expect(encCred.passwordHintDekIv).toBeDefined();

        // DEK のアンラップとパスワードヒントの復号
        const unwrappedDek = await unwrapDEK(
          encCred.passwordHintDekEncrypted,
          encCred.passwordHintDekIv,
          masterKey,
        );

        const decryptedHint = await decrypt(
          encCred.passwordHint,
          encCred.passwordHintIv,
          unwrappedDek,
        );

        expect(decryptedHint).toBe(origCred.passwordHint);
      }
    }
  });
});
