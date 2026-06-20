import { del, get, set } from "idb-keyval";
import { bufferToBase64 } from "@/lib/crypto";

// ユーザーIDに基づいてIndexedDBのキーを一意に決定する
const getBiometricKey = (userId: string) => `poohma_biometric_${userId}`;

export interface BiometricCredentials {
  credentialId: string;
  encryptedPasscode: string;
  iv: string;
  prfSalt: string;
}

/**
 * デバイスおよびブラウザが生体認証（WebAuthn / プラットフォーム認証）に対応しているか判定
 */
export async function isBiometricSupported(): Promise<boolean> {
  if (typeof window === "undefined" || window.PublicKeyCredential == null) {
    return false;
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * 特定のユーザーで生体認証ロック解除が有効になっているか判定
 */
export async function isBiometricEnabledForUser(
  userId: string,
): Promise<boolean> {
  if (!userId) return false;
  try {
    const data = await get<BiometricCredentials>(getBiometricKey(userId));
    return data != null;
  } catch {
    return false;
  }
}

/**
 * ユーザーIDに紐づけて生体認証ロック解除を登録する (PRF拡張版)
 */
export async function registerBiometricUnlock(
  userId: string,
  passcode: string,
  displayName?: string,
): Promise<void> {
  if (!userId) {
    throw new Error(
      "ユーザーIDが指定されていません。ユーザー情報がロードされるのを待ってください。",
    );
  }

  const supported = await isBiometricSupported();
  if (!supported) {
    throw new Error("このデバイスまたはブラウザは生体認証に対応していません。");
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  // ユーザーID（String）をバイト列に変換し、WebAuthn仕様に準拠したuser.idとして設定
  const userIdBytes = new TextEncoder().encode(userId);
  const rpId = window.location.hostname;

  // PRF拡張でハードウェアに渡すソルト（32バイト）
  const prfSalt = crypto.getRandomValues(new Uint8Array(32));

  const creationOptions: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: {
      name: "PoohMa Local Lock",
      id: rpId,
    },
    user: {
      id: userIdBytes,
      name: displayName ?? userId, // ユーザーの一意な識別子
      displayName: displayName ?? `PoohMa User (${userId.slice(0, 8)}...)`,
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 }, // ES256
      { type: "public-key", alg: -257 }, // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: "platform", // 指紋やFaceID等のプラットフォーム認証に限定
      userVerification: "required",
      residentKey: "preferred",
    },
    timeout: 60000,
    attestation: "none",
    extensions: {
      prf: {
        eval: {
          first: prfSalt,
        },
      },
    },
  };

  const credential = (await navigator.credentials.create({
    publicKey: creationOptions,
  })) as PublicKeyCredential;

  if (credential == null) {
    throw new Error("生体認証の登録に失敗しました。");
  }

  // ハードウェアから導出されたPRFの鍵（シード）を取得
  const extensionResults = credential.getClientExtensionResults();
  const prfSeed = extensionResults.prf?.results?.first;

  if (!prfSeed) {
    throw new Error(
      "このデバイスは高度な暗号化保護（PRF拡張）に対応していません。",
    );
  }

  // シードをAES-GCMキーに変換
  const encKey = await crypto.subtle.importKey(
    "raw",
    prfSeed,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  // パスコードを暗号化
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    encKey,
    new TextEncoder().encode(passcode),
  );

  // 構造化データを作成
  const biometricData: BiometricCredentials = {
    credentialId: bufferToBase64(credential.rawId),
    encryptedPasscode: bufferToBase64(encrypted),
    iv: bufferToBase64(iv.buffer as ArrayBuffer),
    prfSalt: bufferToBase64(prfSalt.buffer as ArrayBuffer),
  };

  // ユーザーごとに独立したキーでIndexedDBへ保存
  await set(getBiometricKey(userId), biometricData);
}

/**
 * ユーザーIDに紐づく生体認証データを使用して暗号化されたパスコードを復号・取得する
 */
export async function decryptPasscodeWithBiometrics(
  userId: string,
): Promise<string> {
  if (!userId) {
    throw new Error("ユーザーIDが指定されていません。");
  }

  const data = await get<BiometricCredentials>(getBiometricKey(userId));
  if (data == null) {
    throw new Error("このユーザーの生体認証が有効になっていません。");
  }

  // Base64 → ArrayBuffer 変換
  const credentialIdBuf = base64ToArrayBuffer(data.credentialId);
  const prfSaltBuf = base64ToArrayBuffer(data.prfSalt);

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  // 生体認証ゲート: allowCredentials でこのユーザーの既存クレデンシャルIDを明示的に指定
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: window.location.hostname,
      allowCredentials: [
        {
          type: "public-key",
          id: credentialIdBuf,
        },
      ],
      userVerification: "required",
      timeout: 60000,
      extensions: {
        prf: {
          eval: {
            first: new Uint8Array(prfSaltBuf),
          },
        },
      },
    },
  })) as PublicKeyCredential;

  if (assertion == null) {
    throw new Error("生体認証の検証に失敗しました。");
  }

  const extensionResults = assertion.getClientExtensionResults();
  const prfSeed = extensionResults.prf?.results?.first;

  if (!prfSeed) {
    throw new Error("生体認証器から暗号鍵を取得できませんでした。");
  }

  // シードを復号用のAES-GCMキーに変換
  const encKey = await crypto.subtle.importKey(
    "raw",
    prfSeed,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  const encryptedBuf = base64ToArrayBuffer(data.encryptedPasscode);
  const ivBuf = base64ToArrayBuffer(data.iv);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBuf },
    encKey,
    encryptedBuf,
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * ユーザーIDに紐づく生体認証によるロック解除を無効化（IndexedDB から削除）
 */
export async function disableBiometricUnlock(userId: string): Promise<void> {
  if (!userId) return;
  await del(getBiometricKey(userId));
}

/**
 * Base64 文字列を ArrayBuffer に変換（ローカルヘルパー）
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}
