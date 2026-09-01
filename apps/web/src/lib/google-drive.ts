/**
 * Google Drive / Google Picker 連携ユーティリティ
 * ユーザー主導で Google Drive 内の保存先フォルダを選択し、ファイルをアップロードする
 */

declare global {
	interface Window {
		gapi?: {
			load: (apiName: string, callback: () => void) => void;
		};
		google?: {
			picker?: {
				PickerBuilder: new () => GooglePickerBuilder;
				DocsView: new (viewId?: string) => GoogleDocsView;
				ViewId: {
					FOLDERS: string;
					DOCS: string;
				};
				Action: {
					PICKED: string;
					CANCEL: string;
					ERROR: string;
				};
			};
		};
	}
}

export interface GooglePickerDocument {
	id: string;
	name: string;
	mimeType: string;
	url?: string;
	[key: string]: unknown;
}

export interface GooglePickerResponse {
	action: string;
	docs?: GooglePickerDocument[];
	[key: string]: unknown;
}

export interface GoogleDocsView {
	setIncludeFolders: (include: boolean) => GoogleDocsView;
	setSelectFolderEnabled: (enabled: boolean) => GoogleDocsView;
	setMimeTypes: (mimeTypes: string) => GoogleDocsView;
}

export interface GooglePicker {
	setVisible: (visible: boolean) => void;
}

export interface GooglePickerBuilder {
	addView: (view: GoogleDocsView | string) => GooglePickerBuilder;
	setOAuthToken: (token: string) => GooglePickerBuilder;
	setDeveloperKey: (key: string) => GooglePickerBuilder;
	setAppId: (appId: string) => GooglePickerBuilder;
	setTitle: (title: string) => GooglePickerBuilder;
	setCallback: (
		callback: (data: GooglePickerResponse) => void,
	) => GooglePickerBuilder;
	build: () => GooglePicker;
}

const GOOGLE_PICKER_SCRIPT_URL = "https://apis.google.com/js/api.js";

/**
 * Google Picker API スクリプト（gapi + picker）の動的読み込み
 */
export async function loadGooglePickerScript(): Promise<boolean> {
	if (typeof window === "undefined") return false;

	if (window.google?.picker) {
		return true;
	}

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

	const gapiLoaded = await loadScript(GOOGLE_PICKER_SCRIPT_URL);
	if (!gapiLoaded || !window.gapi) return false;

	return new Promise<boolean>((resolve) => {
		const timeoutId = setTimeout(() => {
			resolve(false);
		}, 10000);

		try {
			window.gapi?.load("picker", () => {
				clearTimeout(timeoutId);
				resolve(typeof window.google?.picker !== "undefined");
			});
		} catch (error) {
			clearTimeout(timeoutId);
			console.error("Failed to load Google Picker:", error);
			resolve(false);
		}
	});
}

/**
 * Google Picker を起動して保存先フォルダを選択させる
 * フォルダが選択された場合はその folderId を返し、キャンセルの場合は null を返す
 */
export async function showGoogleDrivePicker({
	accessToken,
	apiKey,
	appId,
}: {
	accessToken: string;
	apiKey: string;
	appId?: string;
}): Promise<{ folderId?: string } | null> {
	if (typeof window === "undefined" || !window.google?.picker) {
		throw new Error(
			"Google Picker library is not loaded. Call loadGooglePickerScript first.",
		);
	}

	const pickerApi = window.google.picker;

	return new Promise((resolve, reject) => {
		try {
			const { DocsView, PickerBuilder, ViewId, Action } = pickerApi;

			const view = new DocsView(ViewId.FOLDERS)
				.setIncludeFolders(true)
				.setSelectFolderEnabled(true)
				.setMimeTypes("application/vnd.google-apps.folder");

			const pickerBuilder = new PickerBuilder()
				.addView(view)
				.setOAuthToken(accessToken)
				.setDeveloperKey(apiKey)
				.setTitle("保存先フォルダを選択")
				.setCallback((data: GooglePickerResponse) => {
					if (data.action === Action.PICKED) {
						const doc = data.docs?.[0];
						resolve({ folderId: doc?.id });
					} else if (data.action === Action.CANCEL) {
						resolve(null);
					} else if (data.action === Action.ERROR) {
						reject(data);
					}
				});

			if (appId) {
				pickerBuilder.setAppId(appId);
			}

			const picker = pickerBuilder.build();
			picker.setVisible(true);
		} catch (err) {
			reject(err);
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
