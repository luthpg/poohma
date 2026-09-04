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

	test("メンバーキック時: Export Vault経由で旧Master Keyを取り出し、新Master Keyで個人レコードのDEKを再Wrapして移行先で復号できる（共有レコードは家族側に残り新Master Keyでは復号不可）", async () => {
		const oldFamilyPasscode = "old-family-passcode-2026";
		const newFamilyPasscode = "new-independent-passcode-2027";
		const salt = "family-salt-11223344";

		// 1. 旧家族環境のセットアップ
		const oldKek = await deriveKeyFromPasscode(oldFamilyPasscode, salt);
		const oldMasterKey = await generateMasterKey();
		const oldWrappedMasterKey = await wrapMasterKey(oldMasterKey, oldKek);

		// Export Vault 退避データ
		const exportVault = {
			masterKeyEncrypted: oldWrappedMasterKey.encrypted,
			masterKeyIv: oldWrappedMasterKey.iv,
			masterKeySalt: salt,
		};

		// 2. 被キックユーザーの個人所有レコード（PRIVATE）
		const personalSecret = "個人用秘密メモ: my-personal-secret-123";
		const personalDek = await generateDEK();
		const personalCipher = await encrypt(personalSecret, personalDek);
		const oldWrappedPersonalDek = await wrapDEK(personalDek, oldMasterKey);

		// 3. 家族共有レコード（SHARED: 家族側に残るもの）
		const sharedSecret = "家族共有のWi-Fi: family-wifi-shared";
		const sharedDek = await generateDEK();
		const sharedCipher = await encrypt(sharedSecret, sharedDek);
		const oldWrappedSharedDek = await wrapDEK(sharedDek, oldMasterKey);

		// 4. キック後：被キックユーザーが旧パスコードを入力し、Export Vaultから旧Master Keyを取り出す
		const vaultKek = await deriveKeyFromPasscode(
			oldFamilyPasscode,
			exportVault.masterKeySalt,
		);
		const recoveredOldMasterKey = await unwrapMasterKey(
			exportVault.masterKeyEncrypted,
			exportVault.masterKeyIv,
			vaultKek,
		);

		// 5. 新家族の作成：新パスコードから新Master Keyを作成
		const newKek = await deriveKeyFromPasscode(newFamilyPasscode, salt);
		const newMasterKey = await generateMasterKey();
		const newWrappedMasterKey = await wrapMasterKey(newMasterKey, newKek);

		// 6. 個人所有レコードのDEKを、Export Vault由来の旧Master Keyでアンラップし、新Master Keyで再Wrap
		const unwrappedPersonalDek = await unwrapDEK(
			oldWrappedPersonalDek.encrypted,
			oldWrappedPersonalDek.iv,
			recoveredOldMasterKey,
		);
		const newWrappedPersonalDek = await wrapDEK(
			unwrappedPersonalDek,
			newMasterKey,
		);

		// 7. 検証: 新家族Master Keyで個人所有レコードが正常に復号できること
		const unwrappedNewMasterKey = await unwrapMasterKey(
			newWrappedMasterKey.encrypted,
			newWrappedMasterKey.iv,
			newKek,
		);
		const restoredPersonalDek = await unwrapDEK(
			newWrappedPersonalDek.encrypted,
			newWrappedPersonalDek.iv,
			unwrappedNewMasterKey,
		);
		const decryptedPersonal = await decrypt(
			personalCipher.encrypted,
			personalCipher.iv,
			restoredPersonalDek,
		);
		expect(decryptedPersonal).toBe(personalSecret);

		// 8. 検証: 旧Master Keyでは新家族へ持ち出された個人レコードのDEKをアンラップできないこと
		await expect(
			unwrapDEK(
				newWrappedPersonalDek.encrypted,
				newWrappedPersonalDek.iv,
				recoveredOldMasterKey,
			),
		).rejects.toThrow();

		// 9. 検証: 家族側に残った共有レコードのDEKは、新家族Master Keyでは復号できないこと（共有資産保護）
		await expect(
			unwrapDEK(
				oldWrappedSharedDek.encrypted,
				oldWrappedSharedDek.iv,
				unwrappedNewMasterKey,
			),
		).rejects.toThrow();

		// 10. 検証: 共有レコードは旧家族側Master Keyでのみ復号できること
		const restoredSharedDek = await unwrapDEK(
			oldWrappedSharedDek.encrypted,
			oldWrappedSharedDek.iv,
			oldMasterKey,
		);
		const decryptedShared = await decrypt(
			sharedCipher.encrypted,
			sharedCipher.iv,
			restoredSharedDek,
		);
		expect(decryptedShared).toBe(sharedSecret);
	});
});
