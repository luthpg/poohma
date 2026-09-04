import { describe, expect, test } from "vitest";
import {
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

describe("Family Migration & パスコード変更時の再暗号化 (実ブラウザ Chromium)", () => {
	test("パスコード変更時: 旧Master KeyからDEKを取り出し、新Master Keyで再Wrapして復号できる", async () => {
		const oldPasscode = "old-family-passcode-2026";
		const newPasscode = "new-family-passcode-2027";
		const salt = "family-salt-98765432";

		// 1. 旧環境のセットアップ
		const oldKek = await deriveKeyFromPasscode(oldPasscode, salt);
		const oldMasterKey = await generateMasterKey();
		const oldWrappedMasterKey = await wrapMasterKey(oldMasterKey, oldKek);

		// 2. 既存レコード作成（平文 -> DEK暗号化 -> DEKを旧Master KeyでWrap）
		const plainSecret = "家族のWi-Fiパスワード: secret1234";
		const originalDek = await generateDEK();
		const recordCipher = await encrypt(plainSecret, originalDek);
		const oldWrappedDek = await wrapDEK(originalDek, oldMasterKey);

		// 3. パスコード変更処理（クライアント側再暗号化フロー）
		// a. 旧Master Keyのアンラップ
		const unwrappedOldMasterKey = await unwrapMasterKey(
			oldWrappedMasterKey.encrypted,
			oldWrappedMasterKey.iv,
			oldKek,
		);
		// b. 旧Master KeyでDEKをアンラップ
		const unwrappedDek = await unwrapDEK(
			oldWrappedDek.encrypted,
			oldWrappedDek.iv,
			unwrappedOldMasterKey,
		);
		// c. 新パスコードから新KEKを導出し、新Master Keyを生成・Wrap
		const newKek = await deriveKeyFromPasscode(newPasscode, salt);
		const newMasterKey = await generateMasterKey();
		const newWrappedMasterKey = await wrapMasterKey(newMasterKey, newKek);

		// d. DEKを新Master Keyで再Wrap
		const newWrappedDek = await wrapDEK(unwrappedDek, newMasterKey);

		// 4. 検証: 新パスコードからアンラップした新Master Keyで既存レコードが復号できること
		const unwrappedNewMasterKey = await unwrapMasterKey(
			newWrappedMasterKey.encrypted,
			newWrappedMasterKey.iv,
			newKek,
		);
		const recoveredDek = await unwrapDEK(
			newWrappedDek.encrypted,
			newWrappedDek.iv,
			unwrappedNewMasterKey,
		);
		const decryptedText = await decrypt(
			recordCipher.encrypted,
			recordCipher.iv,
			recoveredDek,
		);
		expect(decryptedText).toBe(plainSecret);

		// 5. 検証: 旧Master Keyでは新しくWrapされたDEKをアンラップできないこと
		await expect(
			unwrapDEK(
				newWrappedDek.encrypted,
				newWrappedDek.iv,
				unwrappedOldMasterKey,
			),
		).rejects.toThrow();
	});

	test("Family Migration時: 移行元Master KeyでDEKを取り出し、移行先Master Keyで再Wrapして移行先で復号できる", async () => {
		// 1. 移行元Family
		const sourceMasterKey = await generateMasterKey();

		// 2. 移行先Family
		const targetMasterKey = await generateMasterKey();

		// 3. 移行対象レコード（平文 -> DEK -> 移行元Master KeyでWrap）
		const migrationRecordSecret = "銀行口座番号: 1234-5678-9012";
		const dek = await generateDEK();
		const cipher = await encrypt(migrationRecordSecret, dek);
		const sourceWrappedDek = await wrapDEK(dek, sourceMasterKey);

		// 4. Migration 実行（handleCompleteTransfer 相当のクライアント処理）
		// a. 移行元Master KeyでDEKをアンラップ
		const rawDek = await unwrapDEK(
			sourceWrappedDek.encrypted,
			sourceWrappedDek.iv,
			sourceMasterKey,
		);
		// b. 移行先Master KeyでDEKを再Wrap
		const targetWrappedDek = await wrapDEK(rawDek, targetMasterKey);

		// 5. 検証: 移行先Master Keyで復号できること
		const targetRecoveredDek = await unwrapDEK(
			targetWrappedDek.encrypted,
			targetWrappedDek.iv,
			targetMasterKey,
		);
		const decrypted = await decrypt(
			cipher.encrypted,
			cipher.iv,
			targetRecoveredDek,
		);
		expect(decrypted).toBe(migrationRecordSecret);

		// 6. 検証: 移行元Master Keyでは移行後DEKを復号できないこと
		await expect(
			unwrapDEK(
				targetWrappedDek.encrypted,
				targetWrappedDek.iv,
				sourceMasterKey,
			),
		).rejects.toThrow();
	});
});
