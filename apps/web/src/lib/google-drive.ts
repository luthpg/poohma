/**
 * Google Drive / Google Picker 連携ユーティリティ
 * ユーザー主導で Google Drive 内の保存先フォルダまたはファイルを選択・操作する
 */

interface GoogleTokenResponse {
	access_token?: string;
	error?: string;
}

interface GoogleTokenClient {
	requestAccessToken: (options?: { prompt?: string }) => void;
}

declare global {
	interface Window {
		gapi?: {
			load: (apiName: string, callback: () => void) => void;
		};
		google?: {
			accounts?: {
				oauth2?: {
					initTokenClient: (config: {
						client_id: string;
						scope: string;
						callback: (response: GoogleTokenResponse) => void;
					}) => GoogleTokenClient;
				};
			};
		};
	}
}

const GOOGLE_PICKER_SCRIPT_URL = "https://apis.google.com/js/api.js";
const GOOGLE_GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

/**
 * Google API スクリプトの動的読み込み
 */
export async function loadGoogleScripts(): Promise<boolean> {
	if (typeof window === "undefined") return false;

	const loadScript = (src: string) => {
		return new Promise<boolean>((resolve) => {
			if (document.querySelector(`script[src="${src}"]`)) {
				resolve(true);
				return;
			}
			const script = document.createElement("script");
			script.src = src;
			script.async = true;
			script.defer = true;
			script.onload = () => resolve(true);
			script.onerror = () => resolve(false);
			document.head.appendChild(script);
		});
	};

	const [gapiLoaded, gisLoaded] = await Promise.all([
		loadScript(GOOGLE_PICKER_SCRIPT_URL),
		loadScript(GOOGLE_GIS_SCRIPT_URL),
	]);

	if (!gapiLoaded || !gisLoaded || !window.gapi) return false;

	return new Promise<boolean>((resolve) => {
		const timeoutId = setTimeout(() => {
			resolve(false);
		}, 10000);

		try {
			window.gapi?.load("picker", () => {
				clearTimeout(timeoutId);
				resolve(true);
			});
		} catch (error) {
			clearTimeout(timeoutId);
			console.error("Failed to load Google Picker:", error);
			resolve(false);
		}
	});
}

/**
 * Google OAuth2 Access Token を取得（Google Identity Services / Drive.file スコープ）
 */
export async function getGoogleAccessToken(
	clientId: string,
): Promise<string | null> {
	if (typeof window === "undefined" || !window.google?.accounts?.oauth2) {
		return null;
	}

	return new Promise((resolve) => {
		const timeoutId = setTimeout(() => {
			resolve(null);
		}, 60000); // 60秒でタイムアウト

		try {
			const tokenClient = window.google?.accounts?.oauth2?.initTokenClient({
				client_id: clientId,
				scope: DRIVE_SCOPE,
				callback: (response: GoogleTokenResponse) => {
					clearTimeout(timeoutId);
					if (response.error || !response.access_token) {
						resolve(null);
					} else {
						resolve(response.access_token);
					}
				},
			});

			tokenClient?.requestAccessToken({ prompt: "consent" });
		} catch (error) {
			clearTimeout(timeoutId);
			console.error("Failed to initialize Google token client:", error);
			resolve(null);
		}
	});
}

/**
 * Google Drive へファイルをアップロード（マルチパート）
 */
export async function uploadFileToGoogleDrive({
	accessToken,
	fileName,
	mimeType,
	data,
	parentFolderId,
}: {
	accessToken: string;
	fileName: string;
	mimeType: string;
	data: Uint8Array | Blob;
	parentFolderId?: string;
}): Promise<{ fileId: string; webViewLink?: string } | null> {
	const metadata: Record<string, string | string[]> = {
		name: fileName,
		mimeType,
	};

	if (parentFolderId) {
		metadata.parents = [parentFolderId];
	}

	const form = new FormData();
	form.append(
		"metadata",
		new Blob([JSON.stringify(metadata)], { type: "application/json" }),
	);
	form.append(
		"file",
		data instanceof Blob
			? data
			: new Blob([data as Uint8Array<ArrayBuffer>], { type: mimeType }),
	);

	try {
		const res = await fetch(
			"https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
				body: form,
			},
		);

		if (!res.ok) {
			console.error("Failed to upload to Google Drive:", res.statusText);
			return null;
		}

		const result = await res.json();
		return { fileId: result.id, webViewLink: result.webViewLink };
	} catch (err) {
		console.error("Google Drive upload error:", err);
		return null;
	}
}

/**
 * Google Drive からファイルの内容をダウンロード
 */
export async function downloadFileFromGoogleDrive({
	accessToken,
	fileId,
}: {
	accessToken: string;
	fileId: string;
}): Promise<Blob | null> {
	try {
		const res = await fetch(
			`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
			{
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			},
		);

		if (!res.ok) {
			console.error("Failed to download from Google Drive:", res.statusText);
			return null;
		}

		return await res.blob();
	} catch (err) {
		console.error("Google Drive download error:", err);
		return null;
	}
}
