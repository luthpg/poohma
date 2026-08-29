/**
 * E2EE用の暗号化ユーティリティ (Web Crypto API)
 */

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
// KDFパラメータのバージョン管理テーブル。
// 値は追記のみ行い、既存バージョンのエントリは変更しないこと（過去データの復号を壊すため）。
export const KDF_VERSIONS = {
	1: { hash: "SHA-256" as const, defaultIterations: 300_000 },
} as const;

export type KdfVersion = keyof typeof KDF_VERSIONS;

// 新規に鍵をラップする際に使用する「現在の」KDFパラメータ。
export const CURRENT_KDF_VERSION: KdfVersion = 1;
export const CURRENT_KDF_ITERATIONS =
	KDF_VERSIONS[CURRENT_KDF_VERSION].defaultIterations;

// kdfIterations / cryptoVersion が未設定の（=このフィールド導入前の）
// families レコードを復号する際のフォールバック値。
export const LEGACY_PBKDF2_ITERATIONS = 300_000;
export const LEGACY_KDF_VERSION: KdfVersion = 1;

// リカバリーキット用KDFパラメータ
export const RECOVERY_KDF_VERSION: KdfVersion = 1;
export const RECOVERY_KDF_ITERATIONS = 300_000;

// Crockford's Base32 character set (excluding I, L, O, U to avoid misreading)
const CROCKFORD_BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

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
	iterations: number = LEGACY_PBKDF2_ITERATIONS,
	kdfVersion: KdfVersion = LEGACY_KDF_VERSION,
): Promise<CryptoKey> {
	const params = KDF_VERSIONS[kdfVersion];
	if (!params) {
		throw new Error(`Unsupported KDF version: ${kdfVersion}`);
	}

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
			iterations,
			hash: params.hash,
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
		["encrypt", "decrypt", "wrapKey", "unwrapKey"],
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
		true, // エクスポート可能 (再ラップ・ローテーション等のため)
		["encrypt", "decrypt", "wrapKey", "unwrapKey"],
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

/**
 * 新しいData Encryption Key (DEK)を生成
 */
export async function generateDEK(): Promise<CryptoKey> {
	return await crypto.subtle.generateKey(
		{ name: ALGORITHM, length: KEY_LENGTH },
		true, // エクスポート可能 (ラップして保存するため)
		["encrypt", "decrypt"],
	);
}

/**
 * DEKをマスターキーでラップ（暗号化）
 */
export async function wrapDEK(
	dek: CryptoKey,
	masterKey: CryptoKey,
): Promise<{ encrypted: string; iv: string }> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const wrapped = await crypto.subtle.wrapKey("raw", dek, masterKey, {
		name: ALGORITHM,
		iv,
	});

	return {
		encrypted: bufferToBase64(wrapped),
		iv: bufferToBase64(iv.buffer as ArrayBuffer),
	};
}

/**
 * ラップされたDEKをマスターキーで復号
 */
export async function unwrapDEK(
	encryptedBase64: string,
	ivBase64: string,
	masterKey: CryptoKey,
): Promise<CryptoKey> {
	const wrapped = base64ToBuffer(encryptedBase64);
	const iv = base64ToBuffer(ivBase64);

	return await crypto.subtle.unwrapKey(
		"raw",
		wrapped,
		masterKey,
		{ name: ALGORITHM, iv },
		{ name: ALGORITHM, length: KEY_LENGTH },
		true, // マスターキーローテーション（再暗号化）時に再ラップするためエクスポート可能にする
		["encrypt", "decrypt"],
	);
}

export interface ReEncryptCredentialInput {
	recordId?: string;
	id: string;
	passwordHint?: string;
	passwordHintIv?: string;
	passwordHintDekEncrypted?: string;
	passwordHintDekIv?: string;
}

export interface ReEncryptRecordInput {
	_id?: string;
	id?: string;
	credentials: {
		id: string;
		passwordHint?: string;
		passwordHintIv?: string;
		passwordHintDekEncrypted?: string;
		passwordHintDekIv?: string;
	}[];
}

export interface ReEncryptedCredentialOutput {
	recordId?: string;
	id: string;
	passwordHint: string;
	passwordHintIv: string;
	passwordHintDekEncrypted: string;
	passwordHintDekIv: string;
}

/**
 * 単一のクレデンシャルの DEK を旧マスターキーで復号し、新マスターキーで再ラップする
 */
export async function reWrapCredential(
	cred: ReEncryptCredentialInput,
	oldMasterKey: CryptoKey,
	newMasterKey: CryptoKey,
): Promise<ReEncryptedCredentialOutput> {
	if (!cred.passwordHint || !cred.passwordHintIv) {
		throw new Error(
			`Credential (id: ${cred.id}) is missing password hint information for re-wrapping`,
		);
	}
	if (!cred.passwordHintDekEncrypted || !cred.passwordHintDekIv) {
		throw new Error(
			`Credential (id: ${cred.id}) is missing DEK information for re-wrapping`,
		);
	}

	const dek = await unwrapDEK(
		cred.passwordHintDekEncrypted,
		cred.passwordHintDekIv,
		oldMasterKey,
	);
	const dekWrapped = await wrapDEK(dek, newMasterKey);

	return {
		recordId: cred.recordId,
		id: cred.id,
		passwordHint: cred.passwordHint,
		passwordHintIv: cred.passwordHintIv,
		passwordHintDekEncrypted: dekWrapped.encrypted,
		passwordHintDekIv: dekWrapped.iv,
	};
}

/**
 * 移行対象レコード群の全クレデンシャルの DEK を旧マスターキーで復号し、新マスターキーで再ラップする
 */
export async function reEncryptCredentials(
	records: ReEncryptRecordInput[],
	oldMasterKey: CryptoKey,
	newMasterKey: CryptoKey,
): Promise<ReEncryptedCredentialOutput[]> {
	const reEncryptedCredentials: ReEncryptedCredentialOutput[] = [];

	for (const record of records) {
		const recordId = record._id ?? record.id;
		for (const cred of record.credentials) {
			if (cred.passwordHint && cred.passwordHintIv) {
				const result = await reWrapCredential(
					{ ...cred, recordId },
					oldMasterKey,
					newMasterKey,
				);
				reEncryptedCredentials.push(result);
			}
		}
	}

	return reEncryptedCredentials;
}

/**
 * 暗号学的に安全なリカバリーコードを生成（32文字 Crockford's Base32, 4文字ごとハイフン区切り）
 * 例: `ABCD-EFGH-JKMN-PQRT-WXYZ-2345-6789-BCDF`
 */
export function generateRecoveryCode(): string {
	const randomBytes = crypto.getRandomValues(new Uint8Array(32));
	const chars: string[] = [];
	for (let i = 0; i < 32; i++) {
		// 0..31 のインデックスにマッピング
		const idx = randomBytes[i] % CROCKFORD_BASE32_ALPHABET.length;
		chars.push(CROCKFORD_BASE32_ALPHABET[idx]);
	}

	// 4文字ずつハイフンで区切る (8グループ)
	const chunks: string[] = [];
	for (let i = 0; i < 32; i += 4) {
		chunks.push(chars.slice(i, i + 4).join(""));
	}
	return chunks.join("-");
}

/**
 * リカバリーコードの正規化（ハイフン・スペース除去、大文字化、誤読文字 O->0, I/L->1 の置換）
 */
export function normalizeRecoveryCode(code: string): string {
	let normalized = code.trim().toUpperCase().replace(/[\s-]/g, "");

	// 類似文字の正規化
	normalized = normalized.replace(/[O]/g, "0").replace(/[IL]/g, "1");

	return normalized;
}

/**
 * リカバリーコードが有効な形式（32文字のBase32）か検証
 */
export function isValidRecoveryCode(code: string): boolean {
	const normalized = normalizeRecoveryCode(code);
	if (normalized.length !== 32) return false;
	for (let i = 0; i < normalized.length; i++) {
		if (!CROCKFORD_BASE32_ALPHABET.includes(normalized[i])) {
			return false;
		}
	}
	return true;
}

/**
 * リカバリーコードからキーを導出 (PBKDF2)
 */
export async function deriveKeyFromRecoveryCode(
	recoveryCode: string,
	salt: string,
	iterations: number = RECOVERY_KDF_ITERATIONS,
	kdfVersion: KdfVersion = RECOVERY_KDF_VERSION,
): Promise<CryptoKey> {
	const normalized = normalizeRecoveryCode(recoveryCode);
	return await deriveKeyFromPasscode(normalized, salt, iterations, kdfVersion);
}

/**
 * マスターキーをリカバリーキーでラップ
 */
export async function wrapMasterKeyWithRecovery(
	masterKey: CryptoKey,
	recoveryKey: CryptoKey,
): Promise<{
	encrypted: string;
	iv: string;
}> {
	return await wrapMasterKey(masterKey, recoveryKey);
}

/**
 * リカバリーキーでラップされたマスターキーを復号
 */
export async function unwrapMasterKeyWithRecovery(
	encryptedBase64: string,
	ivBase64: string,
	recoveryKey: CryptoKey,
): Promise<CryptoKey> {
	return await unwrapMasterKey(encryptedBase64, ivBase64, recoveryKey);
}
