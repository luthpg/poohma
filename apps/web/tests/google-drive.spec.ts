// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	downloadFileFromGoogleDrive,
	loadGooglePickerScript,
	showGoogleDrivePicker,
	uploadFileToGoogleDrive,
} from "@/lib/google-drive";

describe("Google Drive / Google Picker 連携 (src/lib/google-drive.ts)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		// cleanup window properties
		delete (window as unknown as { google?: unknown }).google;
		delete (window as unknown as { gapi?: unknown }).gapi;
	});

	describe("loadGooglePickerScript", () => {
		it("window.google.picker が既に存在する場合は即座に true を返すこと", async () => {
			(window as unknown as { google: unknown }).google = {
				picker: {
					DocsView: class {},
					PickerBuilder: class {},
					ViewId: { FOLDERS: "folders", DOCS: "docs" },
					Action: { PICKED: "picked", CANCEL: "cancel" },
				},
			};
			const result = await loadGooglePickerScript();
			expect(result).toBe(true);
		});

		it("script 要素が挿入されて gapi.load が成功した場合に true を返すこと", async () => {
			(window as unknown as { gapi: unknown }).gapi = {
				load: vi.fn().mockImplementation((_name, callback) => {
					(window as unknown as { google: unknown }).google = {
						picker: {
							DocsView: class {},
							PickerBuilder: class {},
							ViewId: { FOLDERS: "folders", DOCS: "docs" },
							Action: { PICKED: "picked", CANCEL: "cancel" },
						},
					};
					callback();
				}),
			};

			const promise = loadGooglePickerScript();
			const script = document.querySelector("script");
			if (script) {
				script.dispatchEvent(new Event("load"));
			}

			const result = await promise;
			expect(result).toBe(true);
		});

		it("script ロードに失敗した場合は false を返すこと", async () => {
			const promise = loadGooglePickerScript();
			const script = document.querySelector("script");
			if (script) {
				script.dispatchEvent(new Event("error"));
			}

			const result = await promise;
			expect(result).toBe(false);
		});
	});

	describe("showGoogleDrivePicker", () => {
		it("Google Picker が未ロードの場合はエラーを投げること", async () => {
			await expect(
				showGoogleDrivePicker({
					accessToken: "fake-token",
					apiKey: "fake-key",
				}),
			).rejects.toThrow("Google Picker library is not loaded");
		});

		it("Picker を構築・表示し、選択された folderId を解決すること", async () => {
			let capturedCallback: (data: unknown) => void = () => {};

			const mockDocsView = {
				setIncludeFolders: vi.fn().mockReturnThis(),
				setSelectFolderEnabled: vi.fn().mockReturnThis(),
				setEnableDrives: vi.fn().mockReturnThis(),
				setParent: vi.fn().mockReturnThis(),
				setMimeTypes: vi.fn().mockReturnThis(),
			};

			const mockPicker = {
				setVisible: vi.fn(),
			};

			const mockPickerBuilder = {
				addView: vi.fn().mockReturnThis(),
				enableFeature: vi.fn().mockReturnThis(),
				setOAuthToken: vi.fn().mockReturnThis(),
				setDeveloperKey: vi.fn().mockReturnThis(),
				setAppId: vi.fn().mockReturnThis(),
				setTitle: vi.fn().mockReturnThis(),
				setCallback: vi.fn().mockImplementation((cb) => {
					capturedCallback = cb;
					return mockPickerBuilder;
				}),
				build: vi.fn().mockReturnValue(mockPicker),
			};

			class MockDocsView {
				setIncludeFolders = mockDocsView.setIncludeFolders;
				setSelectFolderEnabled = mockDocsView.setSelectFolderEnabled;
				setEnableDrives = mockDocsView.setEnableDrives;
				setParent = mockDocsView.setParent;
				setMimeTypes = mockDocsView.setMimeTypes;
			}
			class MockPickerBuilder {
				addView = mockPickerBuilder.addView;
				enableFeature = mockPickerBuilder.enableFeature;
				setOAuthToken = mockPickerBuilder.setOAuthToken;
				setDeveloperKey = mockPickerBuilder.setDeveloperKey;
				setAppId = mockPickerBuilder.setAppId;
				setTitle = mockPickerBuilder.setTitle;
				setCallback = mockPickerBuilder.setCallback;
				build = mockPickerBuilder.build;
			}

			(window as unknown as { google: unknown }).google = {
				picker: {
					DocsView: MockDocsView,
					PickerBuilder: MockPickerBuilder,
					ViewId: { FOLDERS: "folders", DOCS: "docs" },
					Feature: {
						SUPPORT_DRIVES: "support_drives",
						SUPPORT_TEAM_DRIVES: "support_team_drives",
					},
					Action: { PICKED: "picked", CANCEL: "cancel" },
				},
			};

			const pickerPromise = showGoogleDrivePicker({
				accessToken: "test-access-token",
				apiKey: "test-api-key",
				appId: "test-app-id",
			});

			expect(mockDocsView.setParent).toHaveBeenCalledWith("root");
			expect(mockDocsView.setEnableDrives).toHaveBeenCalledWith(true);
			expect(mockPickerBuilder.addView).toHaveBeenCalledTimes(2);
			expect(mockPickerBuilder.enableFeature).toHaveBeenCalledWith(
				"support_drives",
			);
			expect(mockPickerBuilder.setOAuthToken).toHaveBeenCalledWith(
				"test-access-token",
			);
			expect(mockPickerBuilder.setDeveloperKey).toHaveBeenCalledWith(
				"test-api-key",
			);
			expect(mockPickerBuilder.setAppId).toHaveBeenCalledWith("test-app-id");
			expect(mockPicker.setVisible).toHaveBeenCalledWith(true);

			// PICKED イベントを発火
			capturedCallback({
				action: "picked",
				docs: [{ id: "folder-abc-123", name: "My Backups" }],
			});

			const result = await pickerPromise;
			expect(result).toEqual({ folderId: "folder-abc-123" });
		});

		it("キャンセル (CANCEL) 時に null を返すこと", async () => {
			let capturedCallback: (data: unknown) => void = () => {};

			const mockDocsView = {
				setIncludeFolders: vi.fn().mockReturnThis(),
				setSelectFolderEnabled: vi.fn().mockReturnThis(),
				setEnableDrives: vi.fn().mockReturnThis(),
				setParent: vi.fn().mockReturnThis(),
				setMimeTypes: vi.fn().mockReturnThis(),
			};

			const mockPicker = {
				setVisible: vi.fn(),
			};

			const mockPickerBuilder = {
				addView: vi.fn().mockReturnThis(),
				enableFeature: vi.fn().mockReturnThis(),
				setOAuthToken: vi.fn().mockReturnThis(),
				setDeveloperKey: vi.fn().mockReturnThis(),
				setAppId: vi.fn().mockReturnThis(),
				setTitle: vi.fn().mockReturnThis(),
				setCallback: vi.fn().mockImplementation((cb) => {
					capturedCallback = cb;
					return mockPickerBuilder;
				}),
				build: vi.fn().mockReturnValue(mockPicker),
			};

			class MockDocsView {
				setIncludeFolders = mockDocsView.setIncludeFolders;
				setSelectFolderEnabled = mockDocsView.setSelectFolderEnabled;
				setEnableDrives = mockDocsView.setEnableDrives;
				setParent = mockDocsView.setParent;
				setMimeTypes = mockDocsView.setMimeTypes;
			}
			class MockPickerBuilder {
				addView = mockPickerBuilder.addView;
				enableFeature = mockPickerBuilder.enableFeature;
				setOAuthToken = mockPickerBuilder.setOAuthToken;
				setDeveloperKey = mockPickerBuilder.setDeveloperKey;
				setAppId = mockPickerBuilder.setAppId;
				setTitle = mockPickerBuilder.setTitle;
				setCallback = mockPickerBuilder.setCallback;
				build = mockPickerBuilder.build;
			}

			(window as unknown as { google: unknown }).google = {
				picker: {
					DocsView: MockDocsView,
					PickerBuilder: MockPickerBuilder,
					ViewId: { FOLDERS: "folders", DOCS: "docs" },
					Feature: {
						SUPPORT_DRIVES: "support_drives",
						SUPPORT_TEAM_DRIVES: "support_team_drives",
					},
					Action: { PICKED: "picked", CANCEL: "cancel" },
				},
			};

			const pickerPromise = showGoogleDrivePicker({
				accessToken: "test-token",
				apiKey: "test-key",
			});

			// CANCEL イベントを発火
			capturedCallback({
				action: "cancel",
			});

			const result = await pickerPromise;
			expect(result).toBeNull();
		});

		it("エラー (ERROR) 時に受信したエラー情報で reject すること", async () => {
			let capturedCallback: (data: unknown) => void = () => {};

			class MockDocsView {
				setIncludeFolders() {
					return this;
				}
				setSelectFolderEnabled() {
					return this;
				}
				setEnableDrives() {
					return this;
				}
				setParent() {
					return this;
				}
				setMimeTypes() {
					return this;
				}
			}
			class MockPickerBuilder {
				addView() {
					return this;
				}
				enableFeature() {
					return this;
				}
				setOAuthToken() {
					return this;
				}
				setDeveloperKey() {
					return this;
				}
				setAppId() {
					return this;
				}
				setTitle() {
					return this;
				}
				setCallback(callback: (data: unknown) => void) {
					capturedCallback = callback;
					return this;
				}
				build() {
					return { setVisible: vi.fn() };
				}
			}

			(window as unknown as { google: unknown }).google = {
				picker: {
					DocsView: MockDocsView,
					PickerBuilder: MockPickerBuilder,
					ViewId: { FOLDERS: "folders", DOCS: "docs" },
					Feature: {
						SUPPORT_DRIVES: "support_drives",
						SUPPORT_TEAM_DRIVES: "support_team_drives",
					},
					Action: { PICKED: "picked", CANCEL: "cancel", ERROR: "error" },
				},
			};

			const pickerPromise = showGoogleDrivePicker({
				accessToken: "test-token",
				apiKey: "test-key",
			});
			const errorResponse = { action: "error", message: "Picker failed" };

			capturedCallback(errorResponse);

			await expect(pickerPromise).rejects.toEqual(errorResponse);
		});
	});

	describe("uploadFileToGoogleDrive", () => {
		it("parentFolderId を含めてファイルをマルチパートアップロードできること", async () => {
			const mockResponse = {
				id: "new-file-id-456",
				webViewLink: "https://drive.google.com/file/d/new-file-id-456/view",
			};

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			} as Response);

			const dummyData = new Uint8Array([1, 2, 3, 4]);
			const result = await uploadFileToGoogleDrive({
				accessToken: "valid-token",
				fileName: "test-recovery-kit.pdf",
				mimeType: "application/pdf",
				data: dummyData,
				parentFolderId: "target-folder-789",
			});

			expect(result).toEqual({
				fileId: "new-file-id-456",
				webViewLink: "https://drive.google.com/file/d/new-file-id-456/view",
			});

			expect(global.fetch).toHaveBeenCalledWith(
				"https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink",
				expect.objectContaining({
					method: "POST",
					headers: {
						Authorization: "Bearer valid-token",
					},
					body: expect.any(FormData),
				}),
			);
		});

		it("アップロード API 失敗時に null を返すこと", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Bad Request",
			} as Response);

			const result = await uploadFileToGoogleDrive({
				accessToken: "invalid-token",
				fileName: "test.pdf",
				mimeType: "application/pdf",
				data: new Uint8Array([0]),
			});

			expect(result).toBeNull();
		});
	});

	describe("downloadFileFromGoogleDrive", () => {
		it("指定した fileId のファイル内容を Blob としてダウンロードできること", async () => {
			const mockBlob = new Blob(["test-content"], { type: "application/pdf" });
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				blob: async () => mockBlob,
			} as Response);

			const result = await downloadFileFromGoogleDrive({
				accessToken: "valid-token",
				fileId: "file-xyz",
			});

			expect(result).toEqual(mockBlob);
			expect(global.fetch).toHaveBeenCalledWith(
				"https://www.googleapis.com/drive/v3/files/file-xyz?alt=media",
				expect.objectContaining({
					headers: {
						Authorization: "Bearer valid-token",
					},
				}),
			);
		});

		it("ダウンロード失敗時に null を返すこと", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
			} as Response);

			const result = await downloadFileFromGoogleDrive({
				accessToken: "valid-token",
				fileId: "not-existing-file",
			});

			expect(result).toBeNull();
		});
	});
});
