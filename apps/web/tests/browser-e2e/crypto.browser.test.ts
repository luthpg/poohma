import { describe, expect, test } from "vitest";
import {
	base64ToBuffer,
	bufferToBase64,
	decrypt,
	deriveKeyFromPasscode,
	encrypt,
	generateDEK,
	generateMasterKey,
	unwrapDEK,
	unwrapMasterKey,
	wrapDEK,
	wrapMasterKey,
} from "@/lib/crypto";

describe("Web Crypto API (実ブラウザ Chromium)", () => {
	test("実ブラウザでMaster Key生成〜KEK導出〜Wrap〜Unwrap〜レコード暗号化復号のラウンドトリップが成功する", async () => {
		const passcode = "family-super-passcode-2026!";
		const salt = "test-family-salt-12345678";

		// 1. KEK 導出
		const kek = await deriveKeyFromPasscode(passcode, salt);
		expect(kek).toBeDefined();
		expect(kek.algorithm.name).toBe("AES-GCM");

		// 2. Master Key 生成
		const masterKey = await generateMasterKey();
		expect(masterKey).toBeDefined();

		// 3. Master Key Wrap
		const wrappedMasterKey = await wrapMasterKey(masterKey, kek);
		expect(wrappedMasterKey.encrypted).toBeTruthy();
		expect(wrappedMasterKey.iv).toBeTruthy();

		// 4. Master Key Unwrap
		const unwrappedMasterKey = await unwrapMasterKey(
			wrappedMasterKey.encrypted,
			wrappedMasterKey.iv,
			kek,
		);
		expect(unwrappedMasterKey).toBeDefined();

		// 5. DEK 生成 & Wrap
		const dek = await generateDEK();
		const wrappedDek = await wrapDEK(dek, unwrappedMasterKey);
		expect(wrappedDek.encrypted).toBeTruthy();
		expect(wrappedDek.iv).toBeTruthy();

		// 6. DEK Unwrap
		const unwrappedDek = await unwrapDEK(
			wrappedDek.encrypted,
			wrappedDek.iv,
			unwrappedMasterKey,
		);
		expect(unwrappedDek).toBeDefined();

		// 7. 平文暗号化 & 復号
		const plainText = "秘密のヒント: 銀行の暗証番号は誕生日+00";
		const { encrypted, iv } = await encrypt(plainText, unwrappedDek);
		expect(encrypted).toBeTruthy();
		expect(iv).toBeTruthy();

		const decrypted = await decrypt(encrypted, iv, unwrappedDek);
		expect(decrypted).toBe(plainText);
	});

	test("誤ったパスコード（不正なKEK）でMaster KeyのUnwrapを試みた場合、復号に失敗する", async () => {
		const correctPasscode = "correct-passcode-123";
		const wrongPasscode = "wrong-passcode-456";
		const salt = "salt-test-12345";

		const correctKek = await deriveKeyFromPasscode(correctPasscode, salt);
		const wrongKek = await deriveKeyFromPasscode(wrongPasscode, salt);

		const masterKey = await generateMasterKey();
		const wrapped = await wrapMasterKey(masterKey, correctKek);

		await expect(
			unwrapMasterKey(wrapped.encrypted, wrapped.iv, wrongKek),
		).rejects.toThrow();
	});

	test("暗号文またはIVが改ざんされた場合、復号が拒絶される", async () => {
		const dek = await generateDEK();
		const plainText = "改ざんテスト対象テキスト";
		const { encrypted, iv } = await encrypt(plainText, dek);

		// 暗号文を1バイト改ざん
		const rawBytes = new Uint8Array(base64ToBuffer(encrypted));
		rawBytes[0] ^= 0xff;
		const tamperedEncrypted = bufferToBase64(rawBytes.buffer as ArrayBuffer);

		await expect(decrypt(tamperedEncrypted, iv, dek)).rejects.toThrow();
	});
});
