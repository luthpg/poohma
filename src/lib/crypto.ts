/**
 * E2EE用の暗号化ユーティリティ (Web Crypto API)
 */

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const PBKDF2_ITERATIONS = 300000;

/**
 * 文字列を Uint8Array に変換
 */
function textToBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

/**
 * ArrayBuffer を文字列に変換
 */
function bufferToText(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(buffer);
}

/**
 * ArrayBuffer を Base64 文字列に変換
 */
export function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

/**
 * Base64 文字列を ArrayBuffer に変換
 */
export function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

/**
 * パスコードとソルトから鍵を導出 (PBKDF2)
 */
export async function deriveKeyFromPasscode(
  passcode: string,
  salt: string,
): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    textToBuffer(passcode),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: textToBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    passwordKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false, // エクスポート不可
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
  );
}

/**
 * 新しいマスターキーを生成
 */
export async function generateMasterKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true, // エクスポート可能 (ラップして保存するため)
    ["encrypt", "decrypt"],
  );
}

/**
 * データを暗号化
 */
export async function encrypt(
  data: string,
  key: CryptoKey,
): Promise<{ encrypted: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    textToBuffer(data),
  );

  return {
    encrypted: bufferToBase64(encrypted),
    iv: bufferToBase64(iv.buffer as ArrayBuffer),
  };
}

/**
 * データを復号
 */
export async function decrypt(
  encryptedBase64: string,
  ivBase64: string,
  key: CryptoKey,
): Promise<string> {
  const encrypted = base64ToBuffer(encryptedBase64);
  const iv = base64ToBuffer(ivBase64);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    encrypted,
  );

  return bufferToText(decrypted);
}

/**
 * マスターキーをパスコード鍵でラップ（暗号化）
 */
export async function wrapMasterKey(
  masterKey: CryptoKey,
  wrappingKey: CryptoKey,
): Promise<{ encrypted: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.wrapKey("raw", masterKey, wrappingKey, {
    name: ALGORITHM,
    iv,
  });

  return {
    encrypted: bufferToBase64(wrapped),
    iv: bufferToBase64(iv.buffer as ArrayBuffer),
  };
}

/**
 * ラップされたマスターキーを復号
 */
export async function unwrapMasterKey(
  encryptedBase64: string,
  ivBase64: string,
  unwrappingKey: CryptoKey,
): Promise<CryptoKey> {
  const wrapped = base64ToBuffer(encryptedBase64);
  const iv = base64ToBuffer(ivBase64);

  return await crypto.subtle.unwrapKey(
    "raw",
    wrapped,
    unwrappingKey,
    { name: ALGORITHM, iv },
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * ランダムなソルトを生成
 */
export function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return bufferToBase64(salt.buffer as ArrayBuffer);
}

/**
 * CryptoKey を Base64 文字列にエクスポート
 */
export async function exportKeyToBase64(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey("raw", key);
  return bufferToBase64(exported);
}

/**
 * Base64 文字列から CryptoKey をインポート
 */
export async function importKeyFromBase64(base64: string): Promise<CryptoKey> {
  const buffer = base64ToBuffer(base64);
  return await crypto.subtle.importKey("raw", buffer, ALGORITHM, true, [
    "encrypt",
    "decrypt",
  ]);
}
