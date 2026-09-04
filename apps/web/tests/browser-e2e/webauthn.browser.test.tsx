import { afterEach, describe, expect, test } from "vitest";
import { commands } from "vitest/browser";
import "./setup/cdp-authenticator.ts";
import {
	BiometricNotSupportedError,
	decryptPasscodeWithBiometrics,
	disableBiometricUnlock,
	isBiometricEnabledForUser,
	isBiometricSupported,
	registerBiometricUnlock,
} from "@/lib/biometric";

describe("WebAuthn / Passkey (Virtual Authenticator in Chromium)", () => {
	let authenticatorId: string | null = null;

	afterEach(async () => {
		if (authenticatorId) {
			try {
				await commands.removeVirtualAuthenticator(authenticatorId);
			} catch {
				// ignore cleanup error
			}
			authenticatorId = null;
		}
	});

	test("Virtual AuthenticatorでPasskey登録〜PRF暗号化〜IndexedDB保存〜Passkey復号のラウンドトリップが成功する", async () => {
		// 1. CDP 経由で CTAP2 / residentKey / userVerification / PRF 対応の Virtual Authenticator を作成
		authenticatorId = await commands.setupVirtualAuthenticator({
			prfSupported: true,
		});
		expect(authenticatorId).toBeTruthy();

		// 2. プラットフォーム認証器がサポートされていることを確認
		const isSupported = await isBiometricSupported();
		expect(isSupported).toBe(true);

		const userId = `test-user-${Date.now()}`;
		const familyPasscode = "my-secret-family-passcode-2026";

		// 3. 初期状態では生体認証が無効
		const initiallyEnabled = await isBiometricEnabledForUser(userId);
		expect(initiallyEnabled).toBe(false);

		// 4. Passkey 登録（navigator.credentials.create + PRF 拡張）
		await registerBiometricUnlock(userId, familyPasscode, "Test Device");

		// 5. IndexedDB に登録されたことを確認
		const enabledAfterReg = await isBiometricEnabledForUser(userId);
		expect(enabledAfterReg).toBe(true);

		// 6. Passkey によるアンロック（navigator.credentials.get + PRF 拡張による復号）
		const decryptedPasscode = await decryptPasscodeWithBiometrics(userId);
		expect(decryptedPasscode).toBe(familyPasscode);

		// 7. 生体認証の無効化
		await disableBiometricUnlock(userId);
		const enabledAfterDisable = await isBiometricEnabledForUser(userId);
		expect(enabledAfterDisable).toBe(false);
	});

	test("生体認証非対応環境（isUserVerifyingPlatformAuthenticatorAvailable = false）時のフォールバック", async () => {
		// プラットフォーム認証器非対応を設定
		await commands.setPlatformAuthenticatorAvailable(false);

		const isSupported = await isBiometricSupported();
		expect(isSupported).toBe(false);

		const userId = `fallback-user-${Date.now()}`;
		await expect(
			registerBiometricUnlock(userId, "dummy-passcode"),
		).rejects.toThrow(BiometricNotSupportedError);
	});
});
