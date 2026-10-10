import { describe, expect, it } from "vitest";
import {
  decrypt,
  deriveKeyFromPasscode,
  encrypt,
  exportKeyToBase64,
  generateDEK,
  unwrapDEK,
  wrapDEK,
} from "../src/lib/crypto";

describe("Family Passcode Rotation - Envelope Re-wrapping Integration", () => {
  it("旧パスコードでラップされたDEKが、新しいパスコードのマスターキーで正しく再ラップされ、データが復号可能な状態を維持できること", async () => {
    //---------------------------------------------------------
    // 1. 準備段階: 旧パスコードで暗号化されたレコードを模倣
    //---------------------------------------------------------
    const oldPasscode = "old-family-passcode-1234";
    const newPasscode = "new-family-passcode-5678";
    const secretHint = "super-secret-password-hint";

    // 鍵の導出 (ストレッチング等はモックするか、実関数を使用)
    const oldMasterKey = await deriveKeyFromPasscode(
      oldPasscode,
      "static-salt-for-test",
    );
    const newMasterKey = await deriveKeyFromPasscode(
      newPasscode,
      "static-salt-for-test",
    );

    // 個別DEKの生成とデータの暗号化
    const originalDek = await generateDEK();
    const encryptedHint = await encrypt(secretHint, originalDek);
    const wrappedDekOld = await wrapDEK(originalDek, oldMasterKey);

    // Convexに格納されていると仮定するダミーのデータ構造
    const mockDbCredential = {
      id: "cred-test-id",
      passwordHint: encryptedHint.encrypted,
      passwordHintIv: encryptedHint.iv,
      passwordHintDekEncrypted: wrappedDekOld.encrypted,
      passwordHintDekIv: wrappedDekOld.iv,
    };

    // ローテーション前: 旧マスターキーではアンラップでき、新マスターキーでは失敗することを確認
    await expect(
      unwrapDEK(
        mockDbCredential.passwordHintDekEncrypted,
        mockDbCredential.passwordHintDekIv,
        newMasterKey,
      ),
    ).rejects.toThrow();

    //---------------------------------------------------------
    // 2. 実行段階: family.tsx 内のローテーションロジックのシミュレーション
    //---------------------------------------------------------
    // ① 旧マスターキーを使ってDEKを取り出す
    const unwrappedDek = await unwrapDEK(
      mockDbCredential.passwordHintDekEncrypted,
      mockDbCredential.passwordHintDekIv,
      oldMasterKey,
    );

    // ② 取り出したDEKを、新しいマスターキーでラップし直す
    const reWrappedDek = await wrapDEK(unwrappedDek, newMasterKey);

    // ③ 新しいペイロードの作成（これがConvexのMutationに送信される）
    const rotatedCredentialPayload = {
      id: mockDbCredential.id,
      passwordHint: mockDbCredential.passwordHint, // 暗号文自体は不変
      passwordHintIv: mockDbCredential.passwordHintIv,
      passwordHintDekEncrypted: reWrappedDek.encrypted, // 新しい封筒
      passwordHintDekIv: reWrappedDek.iv,
    };

    //---------------------------------------------------------
    // 3. 検証段階: 新しいパスコード（新マスターキー）だけで復号ができるか
    //---------------------------------------------------------
    // 新しい鍵でDEKをアンラップできるか
    const decryptedDek = await unwrapDEK(
      rotatedCredentialPayload.passwordHintDekEncrypted,
      rotatedCredentialPayload.passwordHintDekIv,
      newMasterKey,
    );

    // 復号後のDEKが期待する鍵用途・アルゴリズム・生データと完全に一致することを検証
    expect(decryptedDek.algorithm.name).toBe("AES-GCM");
    expect(decryptedDek.usages).toEqual(["encrypt", "decrypt"]);
    expect(await exportKeyToBase64(decryptedDek)).toBe(
      await exportKeyToBase64(originalDek),
    );

    // アンラップしたDEKで、暗号文が元の平文に戻るか
    const finalPlainHint = await decrypt(
      rotatedCredentialPayload.passwordHint,
      rotatedCredentialPayload.passwordHintIv,
      decryptedDek,
    );

    // 鍵が書き換わっても、データの中身が正しく復元できること
    expect(finalPlainHint).toBe(secretHint);

    // ローテーション後: 旧マスターキー（旧パスコード）では復号できないことを検証
    await expect(
      unwrapDEK(
        rotatedCredentialPayload.passwordHintDekEncrypted,
        rotatedCredentialPayload.passwordHintDekIv,
        oldMasterKey,
      ),
    ).rejects.toThrow();
  });
});
