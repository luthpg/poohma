import type { BrowserCommand } from "vitest/node";

export const setupVirtualAuthenticator: BrowserCommand<
	[{ prfSupported?: boolean }?]
> = async (context, options = { prfSupported: true }) => {
	const cdp = await context.page.context().newCDPSession(context.page);
	await cdp.send("WebAuthn.enable");
	const { authenticatorId } = await cdp.send(
		"WebAuthn.addVirtualAuthenticator",
		{
			options: {
				protocol: "ctap2",
				transport: "internal",
				hasResidentKey: true,
				hasUserVerification: true,
				isUserVerified: true,
				automaticPresenceSimulation: true,
				hasPrf: options?.prfSupported ?? true,
				...(options?.prfSupported
					? { defaultBackupEligibility: true, defaultBackupState: true }
					: {}),
			},
		},
	);
	return authenticatorId;
};

export const removeVirtualAuthenticator: BrowserCommand<[string]> = async (
	context,
	authenticatorId,
) => {
	const cdp = await context.page.context().newCDPSession(context.page);
	await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
};

export const setPlatformAuthenticatorAvailable: BrowserCommand<
	[boolean]
> = async (context, available) => {
	const overridePlatformAuthenticatorAvailability = (isAvailable: boolean) => {
		if (window.PublicKeyCredential) {
			window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable =
				() => Promise.resolve(isAvailable);
		}
	};

	await context.page.addInitScript(
		overridePlatformAuthenticatorAvailability,
		available,
	);
	await context.page.evaluate(
		overridePlatformAuthenticatorAvailability,
		available,
	);
};

declare module "vitest/browser" {
	interface BrowserCommands {
		setupVirtualAuthenticator: (options?: {
			prfSupported?: boolean;
		}) => Promise<string>;
		removeVirtualAuthenticator: (authenticatorId: string) => Promise<void>;
		setPlatformAuthenticatorAvailable: (available: boolean) => Promise<void>;
	}
}
