import { describe, expect, it } from "vitest";
import {
	CURRENT_KDF_ITERATIONS,
	CURRENT_KDF_VERSION,
	decrypt,
	deriveKeyFromPasscode,
	deriveKeyFromRecoveryCode,
	encrypt,
	generateDEK,
	generateMasterKey,
	generateRecoveryCode,
	isValidRecoveryCode,
	LEGACY_PBKDF2_ITERATIONS,
	normalizeRecoveryCode,
	reEncryptCredentials,
	reWrapCredential,
	unwrapDEK,
	unwrapMasterKey,
	unwrapMasterKeyWithRecovery,
	wrapDEK,
	wrapMasterKey,
	wrapMasterKeyWithRecovery,
} from "@/lib/crypto";

describe("1.1 暗号化コアロジックの単体テスト (src/lib/crypto.ts)", () => {
	// テスト共通のダミーデータ定義
	const DUMMY_PASSCODE = "SuperSecurePasscode123!";
	const DUMMY_SALT = "FamilySaltBase64StringOrString=";
	const SECRET_HINT_DATA = "MySecretHint-Netflix-Password-Is-Pooh";

	/**
	 * 1.1.1 マスターキー生成とラップ・アンラップのサイクル
	 */
	describe("1.1.1 マスターキー生成とラップ・アンラップのサイクル", () => {
		it("マスターキーの生成、パスコード鍵によるラップ、および元のマスターキーへの復元が正しく連動すること", async () => {
			// 1. マスターキー (AES-GCM 256bit) の新規生成
			const masterKey = await generateMasterKey();
			expect(masterKey.type).toBe("secret");
			expect(masterKey.extractable).toBe(true);
			expect(masterKey.algorithm.name).toBe("AES-GCM");

			// 2. ラップ用キー（パスコード由来の鍵）の導出
			const wrappingKey = await deriveKeyFromPasscode(
				DUMMY_PASSCODE,
				DUMMY_SALT,
			);

			// 3. 生成したマスターキーをパスコード鍵でラップ（暗号化）
			const wrapped = await wrapMasterKey(masterKey, wrappingKey);
			expect(wrapped.encrypted).toBeTypeOf("string");
			expect(wrapped.iv).toBeTypeOf("string");
			expect(wrapped.encrypted.length).toBeGreaterThan(0);
			expect(wrapped.iv.length).toBeGreaterThan(0);

			// 4. ラップされた暗号文・IVから元のマスターキーをアンラップ（復元）
			const unwrappedMasterKey = await unwrapMasterKey(
				wrapped.encrypted,
				wrapped.iv,
				wrappingKey,
			);
			expect(unwrappedMasterKey.type).toBe("secret");
			expect(unwrappedMasterKey.algorithm.name).toBe("AES-GCM");

			// 5. 【実効性検証】復元されたマスターキーを使ってデータを暗号化し、元のキーで復号できるかチェック
			const testEncrypted = await encrypt(SECRET_HINT_DATA, unwrappedMasterKey);
			const testDecrypted = await decrypt(
				testEncrypted.encrypted,
				testEncrypted.iv,
				masterKey,
			);
			expect(testDecrypted).toBe(SECRET_HINT_DATA);
		});
	});

	/**
	 * 1.1.2 暗号化・復号の整合性とIVのランダム性
	 */
	describe("1.1.2 暗号化・復号の整合性とIVのランダム性", () => {
		it("任意の文字列を暗号化し、同一のキーとIVで完全に平文へ復号できること", async () => {
			const masterKey = await generateMasterKey();

			// 暗号化の実行
			const { encrypted, iv } = await encrypt(SECRET_HINT_DATA, masterKey);

			// 復号の実行
			const decrypted = await decrypt(encrypted, iv, masterKey);

			// 平文の完全一致検証
			expect(decrypted).toBe(SECRET_HINT_DATA);
		});

		it("同一キー・同一平文で複数回暗号化を実行した際、IVが毎回ランダムに生成され、暗号文が非決定論的（ユニーク）になること", async () => {
			const masterKey = await generateMasterKey();

			// 同じ条件下で2回暗号化処理を実行
			const run1 = await encrypt(SECRET_HINT_DATA, masterKey);
			const run2 = await encrypt(SECRET_HINT_DATA, masterKey);

			// IVおよび暗号文（Base64）が毎回異なっていることを確認（IV再利用による鍵ストリーム漏洩脆弱性の防御検証）
			expect(run1.iv).not.toBe(run2.iv);
			expect(run1.encrypted).not.toBe(run2.encrypted);
		});
	});

	/**
	 * 1.1.3 パスコードからの鍵導出 (PBKDF2)
	 */
	describe("1.1.3 パスコードからの鍵導出 (PBKDF2)", () => {
		it("同一のパスコードおよびソルトからは、常に同一の暗号鍵が決定論的に導出されること", async () => {
			// 独立して2回同じパラメータから鍵を導出
			const key1 = await deriveKeyFromPasscode(DUMMY_PASSCODE, DUMMY_SALT);
			const key2 = await deriveKeyFromPasscode(DUMMY_PASSCODE, DUMMY_SALT);

			// 片方のキーで暗号化したデータを、もう片方のキーで正常に復号できることで鍵の同一性を証明
			const { encrypted, iv } = await encrypt(SECRET_HINT_DATA, key1);
			const decrypted = await decrypt(encrypted, iv, key2);

			expect(decrypted).toBe(SECRET_HINT_DATA);
		});

		it("異なるパスコード、または異なるソルトを使用した場合は異なる鍵が導出され、相互に復号できないこと", async () => {
			const keyCorrect = await deriveKeyFromPasscode(
				DUMMY_PASSCODE,
				DUMMY_SALT,
			);
			const keyWrongPass = await deriveKeyFromPasscode(
				"WrongPasscode123!",
				DUMMY_SALT,
			);
			const keyWrongSalt = await deriveKeyFromPasscode(
				DUMMY_PASSCODE,
				"DifferentSaltValue=",
			);

			const { encrypted, iv } = await encrypt(SECRET_HINT_DATA, keyCorrect);

			// 異なるパスコード由来の鍵での復号は認証失敗（エラーがスロー）すること
			await expect(decrypt(encrypted, iv, keyWrongPass)).rejects.toThrow();

			// 異なるソルト由来の鍵での復号も認証失敗すること
			await expect(decrypt(encrypted, iv, keyWrongSalt)).rejects.toThrow();
		});
	});

	/**
	 * 1.1.4 異常系：改ざん検知とエラーハンドリング
	 */
	describe("1.1.4 異常系：改ざん検知とエラーハンドリング", () => {
		it("暗号文の一部が改ざんされた場合、AES-GCMのタグ検証により復号処理が適切に例外をスローすること", async () => {
			const masterKey = await generateMasterKey();
			const { encrypted, iv } = await encrypt(SECRET_HINT_DATA, masterKey);

			// 暗号文（Base64）の末尾の文字を意図的に書き換えて改ざんをシミュレート
			const corruptedEncrypted =
				encrypted.slice(0, -1) + (encrypted.endsWith("A") ? "B" : "A");

			// AES-GCMの改ざん検知（認証タグ不一致）により例外がスローされることを検証
			await expect(
				decrypt(corruptedEncrypted, iv, masterKey),
			).rejects.toThrow();
		});

		it("IV（初期化ベクトル）が改ざんされた場合、復号処理が認証エラーとして失敗すること", async () => {
			const masterKey = await generateMasterKey();
			const { encrypted, iv } = await encrypt(SECRET_HINT_DATA, masterKey);

			// IVの文字を一文字書き換える
			const corruptedIv = iv.slice(0, -1) + (iv.endsWith("A") ? "B" : "A");

			await expect(
				decrypt(encrypted, corruptedIv, masterKey),
			).rejects.toThrow();
		});

		it("誤ったパスコード（鍵）でマスターキーのアンラップを試みた場合、処理が適切に失敗すること", async () => {
			const masterKey = await generateMasterKey();
			const correctWrappingKey = await deriveKeyFromPasscode(
				DUMMY_PASSCODE,
				DUMMY_SALT,
			);
			const wrongWrappingKey = await deriveKeyFromPasscode(
				"InvalidFamilyPasscode!!!",
				DUMMY_SALT,
			);

			// 正しい鍵でラップ
			const wrapped = await wrapMasterKey(masterKey, correctWrappingKey);

			// 誤った鍵でアンラップを試みた場合、復号エラー（例外スロー）になることを検証
			await expect(
				unwrapMasterKey(wrapped.encrypted, wrapped.iv, wrongWrappingKey),
			).rejects.toThrow();
		});
	});

	describe("1.2 エンベロープ暗号 (DEK) のテスト", () => {
		const SECRET_DATA = "SensitiveHintData-Envelope-123";

		it("DEKの生成、ラップ、アンラップが正常に連動し、データが復号できること", async () => {
			// 1. マスターキー（KEK）の生成
			const masterKey = await generateMasterKey();

			// 2. DEKの生成
			const dek = await generateDEK();
			expect(dek.type).toBe("secret");
			expect(dek.algorithm.name).toBe("AES-GCM");

			// 3. DEKをマスターキーでラップ
			const wrappedDEK = await wrapDEK(dek, masterKey);
			expect(wrappedDEK.encrypted).toBeTypeOf("string");
			expect(wrappedDEK.iv).toBeTypeOf("string");

			// 4. DEKをマスターキーでアンラップ
			const unwrappedDEK = await unwrapDEK(
				wrappedDEK.encrypted,
				wrappedDEK.iv,
				masterKey,
			);
			expect(unwrappedDEK.type).toBe("secret");
			expect(unwrappedDEK.algorithm.name).toBe("AES-GCM");

			// 5. アンラップされたDEKでデータを暗号化・復号
			const { encrypted, iv } = await encrypt(SECRET_DATA, unwrappedDEK);
			const decrypted = await decrypt(encrypted, iv, unwrappedDEK);
			expect(decrypted).toBe(SECRET_DATA);
		});

		it("無効なマスターキーでDEKのアンラップを試みた場合、エラーをスローすること", async () => {
			const masterKeyCorrect = await generateMasterKey();
			const masterKeyWrong = await generateMasterKey();

			const dek = await generateDEK();
			const wrappedDEK = await wrapDEK(dek, masterKeyCorrect);

			// 誤ったマスターキーでのアンラップはエラーになること
			await expect(
				unwrapDEK(wrappedDEK.encrypted, wrappedDEK.iv, masterKeyWrong),
			).rejects.toThrow();
		});

		it("旧形式（マスターキーによる直接暗号化）と新形式（DEK暗号化）の両方から正しくデータを復号できること（互換性の検証）", async () => {
			const masterKey = await generateMasterKey();

			// 1. 旧形式: マスターキーで直接暗号化
			const oldEncrypted = await encrypt(SECRET_DATA, masterKey);

			// 2. 新形式: DEKで暗号化
			const dek = await generateDEK();
			const wrappedDEK = await wrapDEK(dek, masterKey);
			const newEncrypted = await encrypt(SECRET_DATA, dek);

			// 復号関数を利用して、それぞれ復号できることを確認
			// 旧形式
			const oldDecrypted = await decrypt(
				oldEncrypted.encrypted,
				oldEncrypted.iv,
				masterKey,
			);
			expect(oldDecrypted).toBe(SECRET_DATA);

			// 新形式
			const unwrappedDEK = await unwrapDEK(
				wrappedDEK.encrypted,
				wrappedDEK.iv,
				masterKey,
			);
			const newDecrypted = await decrypt(
				newEncrypted.encrypted,
				newEncrypted.iv,
				unwrappedDEK,
			);
			expect(newDecrypted).toBe(SECRET_DATA);
		});

		it("マスターキーのローテーション時、アンラップされたDEKから再ラップが行えること", async () => {
			const oldMasterKey = await generateMasterKey();
			const newMasterKey = await generateMasterKey();

			const dek = await generateDEK();
			const wrappedDEKOld = await wrapDEK(dek, oldMasterKey);

			// 古いマスターキーでアンラップ
			const unwrappedDEK = await unwrapDEK(
				wrappedDEKOld.encrypted,
				wrappedDEKOld.iv,
				oldMasterKey,
			);

			// 新しいマスターキーで再ラップ
			const wrappedDEKNew = await wrapDEK(unwrappedDEK, newMasterKey);
			expect(wrappedDEKNew.encrypted).not.toBe(wrappedDEKOld.encrypted);

			// 新しいマスターキーでアンラップして動作確認
			const unwrappedDEKNew = await unwrapDEK(
				wrappedDEKNew.encrypted,
				wrappedDEKNew.iv,
				newMasterKey,
			);
			const { encrypted, iv } = await encrypt(SECRET_DATA, unwrappedDEKNew);
			const decrypted = await decrypt(encrypted, iv, unwrappedDEKNew);
			expect(decrypted).toBe(SECRET_DATA);
		});
	});

	describe("1.3 KDFバージョン管理とイテレーション数の可変化", () => {
		it("iterations/version を省略した場合、レガシー値にフォールバックすること", async () => {
			const keyDefault = await deriveKeyFromPasscode(
				DUMMY_PASSCODE,
				DUMMY_SALT,
			);
			const keyExplicit = await deriveKeyFromPasscode(
				DUMMY_PASSCODE,
				DUMMY_SALT,
				LEGACY_PBKDF2_ITERATIONS,
			);
			const { encrypted, iv } = await encrypt(SECRET_HINT_DATA, keyDefault);
			const decrypted = await decrypt(encrypted, iv, keyExplicit);
			expect(decrypted).toBe(SECRET_HINT_DATA);
		});

		it("保存されているイテレーション数が異なると、導出される鍵も異なること", async () => {
			const keyLow = await deriveKeyFromPasscode(
				DUMMY_PASSCODE,
				DUMMY_SALT,
				100_000,
			);
			const keyHigh = await deriveKeyFromPasscode(
				DUMMY_PASSCODE,
				DUMMY_SALT,
				300_000,
			);
			const { encrypted, iv } = await encrypt(SECRET_HINT_DATA, keyLow);
			await expect(decrypt(encrypted, iv, keyHigh)).rejects.toThrow();
		});

		it("CURRENT_KDF_ITERATIONS を将来引き上げても、保存済みの旧イテレーション数でマスターキーを復号できること", async () => {
			const legacyIterations = 300_000;
			const wrappingKeyAtCreation = await deriveKeyFromPasscode(
				DUMMY_PASSCODE,
				DUMMY_SALT,
				legacyIterations,
			);
			const masterKey = await generateMasterKey();
			const wrapped = await wrapMasterKey(masterKey, wrappingKeyAtCreation);

			// 将来イテレーション数が引き上げられた状況をシミュレート
			const futureIterations = 600_000;
			const wrappingKeyWithFutureParams = await deriveKeyFromPasscode(
				DUMMY_PASSCODE,
				DUMMY_SALT,
				futureIterations,
			);

			// 将来値では復号できない（=別の鍵になっている）
			await expect(
				unwrapMasterKey(
					wrapped.encrypted,
					wrapped.iv,
					wrappingKeyWithFutureParams,
				),
			).rejects.toThrow();

			// DBに保存されているはずの legacyIterations を使えば引き続き復号できる
			const unwrapped = await unwrapMasterKey(
				wrapped.encrypted,
				wrapped.iv,
				wrappingKeyAtCreation,
			);
			expect(unwrapped.algorithm.name).toBe("AES-GCM");
		});

		it("未対応の cryptoVersion を指定した場合はエラーになること", async () => {
			await expect(
				deriveKeyFromPasscode(DUMMY_PASSCODE, DUMMY_SALT, 300_000, 99 as never),
			).rejects.toThrow("Unsupported KDF version");
		});

		it("CURRENT_KDF_ITERATIONS / CURRENT_KDF_VERSION を用いた新規作成フローが従来どおり成立すること", async () => {
			const wrappingKey = await deriveKeyFromPasscode(
				DUMMY_PASSCODE,
				DUMMY_SALT,
				CURRENT_KDF_ITERATIONS,
				CURRENT_KDF_VERSION,
			);
			const masterKey = await generateMasterKey();
			const wrapped = await wrapMasterKey(masterKey, wrappingKey);
			const unwrapped = await unwrapMasterKey(
				wrapped.encrypted,
				wrapped.iv,
				wrappingKey,
			);
			expect(unwrapped.algorithm.name).toBe("AES-GCM");
		});
	});

	/**
	 * 1.1.8 パスコードローテーションの鍵再ラップサイクル
	 */
	describe("1.1.8 パスコードローテーション（マスターキーの再ラップ）", () => {
		it("旧パスコードでラップされたマスターキーを新パスコードで再ラップし、新鍵でアンラップでき旧鍵では失敗すること", async () => {
			const oldPasscode = "OldSecretPasscode123!";
			const oldSalt = "OldSaltBase64String1=";
			const newPasscode = "NewSecretPasscode456!";
			const newSalt = "NewSaltBase64String2=";

			// 1. マスターキーを生成し、旧パスコードでラップ
			const masterKey = await generateMasterKey();
			const oldWrappingKey = await deriveKeyFromPasscode(
				oldPasscode,
				oldSalt,
				CURRENT_KDF_ITERATIONS,
				CURRENT_KDF_VERSION,
			);
			const oldWrapped = await wrapMasterKey(masterKey, oldWrappingKey);

			// 2. 旧パスコードでアンラップ（現在のアンロック動作）
			const unlockedMasterKey = await unwrapMasterKey(
				oldWrapped.encrypted,
				oldWrapped.iv,
				oldWrappingKey,
			);

			// 3. 新パスコード・新ソルトで再ラップ
			const newWrappingKey = await deriveKeyFromPasscode(
				newPasscode,
				newSalt,
				CURRENT_KDF_ITERATIONS,
				CURRENT_KDF_VERSION,
			);
			const newWrapped = await wrapMasterKey(unlockedMasterKey, newWrappingKey);

			// 4. 新パスコードでは正常にアンラップできる
			const restoredMasterKey = await unwrapMasterKey(
				newWrapped.encrypted,
				newWrapped.iv,
				newWrappingKey,
			);

			// 5. 新マスターキーでDEKやヒントを復号・検証
			const dek = await generateDEK();
			const wrappedDek = await wrapDEK(dek, masterKey);
			const unwrappedDek = await unwrapDEK(
				wrappedDek.encrypted,
				wrappedDek.iv,
				restoredMasterKey,
			);
			const encryptedHint = await encrypt(SECRET_HINT_DATA, dek);
			const decryptedHint = await decrypt(
				encryptedHint.encrypted,
				encryptedHint.iv,
				unwrappedDek,
			);
			expect(decryptedHint).toBe(SECRET_HINT_DATA);

			// 6. 旧パスコードでは新ラップデータをアンラップできない（認証タグエラー）
			await expect(
				unwrapMasterKey(newWrapped.encrypted, newWrapped.iv, oldWrappingKey),
			).rejects.toThrow();
		});
	});

	/**
	 * 1.1.7 再暗号化共通関数 (reWrapCredential / reEncryptCredentials)
	 */
	describe("1.1.7 再暗号化共通関数 (reWrapCredential / reEncryptCredentials)", () => {
		it("reWrapCredential: 単一クレデンシャルが新マスターキーで正しく再ラップされ、暗号文を維持したまま新キーで復号できること", async () => {
			const oldMasterKey = await generateMasterKey();
			const newMasterKey = await generateMasterKey();

			// 元データの生成
			const dek = await generateDEK();
			const { encrypted: passwordHint, iv: passwordHintIv } = await encrypt(
				SECRET_HINT_DATA,
				dek,
			);
			const wrappedDekOld = await wrapDEK(dek, oldMasterKey);

			const input = {
				recordId: "record-1",
				id: "cred-1",
				passwordHint,
				passwordHintIv,
				passwordHintDekEncrypted: wrappedDekOld.encrypted,
				passwordHintDekIv: wrappedDekOld.iv,
			};

			// 再ラップ実行
			const result = await reWrapCredential(input, oldMasterKey, newMasterKey);

			// 検証: IDや暗号文自体は変更されていないこと
			expect(result.recordId).toBe("record-1");
			expect(result.id).toBe("cred-1");
			expect(result.passwordHint).toBe(passwordHint);
			expect(result.passwordHintIv).toBe(passwordHintIv);
			expect(result.passwordHintDekEncrypted).toBeDefined();
			expect(result.passwordHintDekIv).toBeDefined();

			// 新マスターキーで DEK がアンラップでき、平文が復号できること
			const unwrappedDek = await unwrapDEK(
				result.passwordHintDekEncrypted,
				result.passwordHintDekIv,
				newMasterKey,
			);
			const decrypted = await decrypt(
				result.passwordHint,
				result.passwordHintIv,
				unwrappedDek,
			);
			expect(decrypted).toBe(SECRET_HINT_DATA);

			// 旧マスターキーでは新しくラップされた DEK をアンラップできないこと
			await expect(
				unwrapDEK(
					result.passwordHintDekEncrypted,
					result.passwordHintDekIv,
					oldMasterKey,
				),
			).rejects.toThrow();
		});

		it("reWrapCredential: DEK情報が欠落している場合はエラーをスローすること（DEKなしパターンの廃止検証）", async () => {
			const oldMasterKey = await generateMasterKey();
			const newMasterKey = await generateMasterKey();

			const inputWithoutDek = {
				id: "cred-no-dek",
				passwordHint: "some-hint",
				passwordHintIv: "some-iv",
			};

			await expect(
				reWrapCredential(inputWithoutDek, oldMasterKey, newMasterKey),
			).rejects.toThrow(
				"Credential (id: cred-no-dek) is missing DEK information for re-wrapping",
			);
		});

		it("reEncryptCredentials: 複数レコード・複数クレデンシャルの一括再ラップが正しく動作し、暗号化情報のないクレデンシャルはスキップされること", async () => {
			const oldMasterKey = await generateMasterKey();
			const newMasterKey = await generateMasterKey();

			// レコード1: 2件の暗号化クレデンシャル
			const dek1 = await generateDEK();
			const enc1 = await encrypt("hint-record1-cred1", dek1);
			const wrap1 = await wrapDEK(dek1, oldMasterKey);

			const dek2 = await generateDEK();
			const enc2 = await encrypt("hint-record1-cred2", dek2);
			const wrap2 = await wrapDEK(dek2, oldMasterKey);

			// レコード2: 1件の暗号化クレデンシャル + 1件の空クレデンシャル（パスワードヒントなし）
			const dek3 = await generateDEK();
			const enc3 = await encrypt("hint-record2-cred1", dek3);
			const wrap3 = await wrapDEK(dek3, oldMasterKey);

			const recordsInput = [
				{
					_id: "rec-1",
					credentials: [
						{
							id: "c1",
							passwordHint: enc1.encrypted,
							passwordHintIv: enc1.iv,
							passwordHintDekEncrypted: wrap1.encrypted,
							passwordHintDekIv: wrap1.iv,
						},
						{
							id: "c2",
							passwordHint: enc2.encrypted,
							passwordHintIv: enc2.iv,
							passwordHintDekEncrypted: wrap2.encrypted,
							passwordHintDekIv: wrap2.iv,
						},
					],
				},
				{
					id: "rec-2", // _id ではなく id プロパティの場合
					credentials: [
						{
							id: "c3",
							passwordHint: enc3.encrypted,
							passwordHintIv: enc3.iv,
							passwordHintDekEncrypted: wrap3.encrypted,
							passwordHintDekIv: wrap3.iv,
						},
						{
							id: "c4-empty",
							passwordHint: "",
							passwordHintIv: "",
						},
					],
				},
			];

			const results = await reEncryptCredentials(
				recordsInput,
				oldMasterKey,
				newMasterKey,
			);

			// c4-empty はスキップされ、合計3件になること
			expect(results).toHaveLength(3);

			// 各クレデンシャルの検証
			const [res1, res2, res3] = results;
			expect(res1?.recordId).toBe("rec-1");
			expect(res1?.id).toBe("c1");
			expect(res2?.recordId).toBe("rec-1");
			expect(res2?.id).toBe("c2");
			expect(res3?.recordId).toBe("rec-2");
			expect(res3?.id).toBe("c3");

			// 新マスターキーで各平文が正常に復号できること
			for (const [res, expectedPlain] of [
				[res1, "hint-record1-cred1"],
				[res2, "hint-record1-cred2"],
				[res3, "hint-record2-cred1"],
			] as const) {
				const unwrappedDek = await unwrapDEK(
					res.passwordHintDekEncrypted,
					res.passwordHintDekIv,
					newMasterKey,
				);
				const plain = await decrypt(
					res.passwordHint,
					res.passwordHintIv,
					unwrappedDek,
				);
				expect(plain).toBe(expectedPlain);
			}
		});
	});

	describe("1.4 リカバリーキット・Recovery Codeの単体テスト", () => {
		it("generateRecoveryCode: 32文字のBase32（4文字ごとハイフン区切りの8グループ）が生成されること", () => {
			const code = generateRecoveryCode();
			expect(code).toMatch(/^[0-9A-HJKMNP-Z]{4}(-[0-9A-HJKMNP-Z]{4}){7}$/);
			expect(code.replace(/-/g, "").length).toBe(32);
		});

		it("normalizeRecoveryCode: 小文字、ハイフン、スペース、混同しやすい文字(O->0, I/L->1)が正しく正規化されること", () => {
			const raw = "abcd-efgh-jkmn-pqrt-wxyz-2345-6789-oilu";
			const normalized = normalizeRecoveryCode(raw);
			// o -> 0, i -> 1, l -> 1
			expect(normalized).toBe("ABCDEFGHJKMNPQRTWXYZ23456789011U");
		});

		it("isValidRecoveryCode: 有効なコードと無効なコードを正しく判定できること", () => {
			const validCode = generateRecoveryCode();
			expect(isValidRecoveryCode(validCode)).toBe(true);

			// 短すぎる
			expect(isValidRecoveryCode("ABCD-EFGH")).toBe(false);
			// 不正な文字
			expect(
				isValidRecoveryCode("ABCD-EFGH-JKMN-PQRT-WXYZ-2345-6789-@@@@"),
			).toBe(false);
		});

		it("リカバリーキーによるマスターキーのラップ・アンラップとデータ復号が成立すること", async () => {
			const recoveryCode = generateRecoveryCode();
			const salt = "RecoverySaltBase64Val==";
			const masterKey = await generateMasterKey();

			// 1. リカバリーキーの導出
			const recoveryKey = await deriveKeyFromRecoveryCode(recoveryCode, salt);

			// 2. マスターキーをリカバリーキーでラップ
			const wrapped = await wrapMasterKeyWithRecovery(masterKey, recoveryKey);
			expect(wrapped.encrypted).toBeTypeOf("string");
			expect(wrapped.iv).toBeTypeOf("string");

			// 3. リカバリーキーでマスターキーをアンラップ
			const unwrappedMasterKey = await unwrapMasterKeyWithRecovery(
				wrapped.encrypted,
				wrapped.iv,
				recoveryKey,
			);

			// 4. 元のマスターキーで暗号化したデータを復元されたマスターキーで復号できること
			const testData = "TopSecretRecoveryData123";
			const encrypted = await encrypt(testData, masterKey);
			const decrypted = await decrypt(
				encrypted.encrypted,
				encrypted.iv,
				unwrappedMasterKey,
			);
			expect(decrypted).toBe(testData);
		});

		it("異なるリカバリーコードではマスターキーのアンラップに失敗すること", async () => {
			const recoveryCodeCorrect = generateRecoveryCode();
			const recoveryCodeWrong = generateRecoveryCode();
			const salt = "RecoverySaltBase64Val==";
			const masterKey = await generateMasterKey();

			const recoveryKeyCorrect = await deriveKeyFromRecoveryCode(
				recoveryCodeCorrect,
				salt,
			);
			const recoveryKeyWrong = await deriveKeyFromRecoveryCode(
				recoveryCodeWrong,
				salt,
			);

			const wrapped = await wrapMasterKeyWithRecovery(
				masterKey,
				recoveryKeyCorrect,
			);

			await expect(
				unwrapMasterKeyWithRecovery(
					wrapped.encrypted,
					wrapped.iv,
					recoveryKeyWrong,
				),
			).rejects.toThrow();
		});
	});
});
