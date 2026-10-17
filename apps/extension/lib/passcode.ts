import {
  decrypt,
  deriveKeyFromPasscode,
  type KdfVersion,
  LEGACY_KDF_VERSION,
  LEGACY_PBKDF2_ITERATIONS,
  unwrapDEK,
  unwrapMasterKey,
} from "@poohma/crypto";
import type { ExtensionFamily } from "./auth";

// 誤入力指数バックオフ遅延計算（Web の PasscodeProvider と同一仕様）
export function calculateLockoutDelayMs(failedAttempts: number): number {
  if (failedAttempts < 3) return 0;
  // 3回目: 1秒, 4回目: 2秒, 5回目: 4秒 ... 最大30秒
  const exponent = failedAttempts - 3;
  const delaySec = Math.min(2 ** exponent, 30);
  return delaySec * 1000;
}

/**
 * 家族マスターパスコードを検証・解除して CryptoKey を導出する
 * ※ extractable: false により秘密鍵をメモリ外部へ取り出し不能にする
 */
export async function unlockMasterKeyWithPasscode(
  passcode: string,
  family: ExtensionFamily,
): Promise<CryptoKey> {
  const wrappingKey = await deriveKeyFromPasscode(
    passcode,
    family.masterKeySalt,
    family.kdfIterations ?? LEGACY_PBKDF2_ITERATIONS,
    (family.cryptoVersion ?? LEGACY_KDF_VERSION) as KdfVersion,
  );

  return await unwrapMasterKey(
    family.masterKeyEncrypted,
    family.masterKeyIv,
    wrappingKey,
    false, // extractable: false でメモリ保護
  );
}

/**
 * パスワードヒントを復号する（エンベロープ暗号方式）
 * masterKey -> DEK をアンラップ -> DEK でヒント本文を復号
 */
export async function decryptPasswordHint(
  encryptedHint: string,
  hintIv: string,
  dekEncrypted: string,
  dekIv: string,
  masterKey: CryptoKey,
): Promise<string> {
  const dek = await unwrapDEK(dekEncrypted, dekIv, masterKey);
  return await decrypt(encryptedHint, hintIv, dek);
}
