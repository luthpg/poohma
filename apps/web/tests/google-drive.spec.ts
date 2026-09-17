// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGoogleDriveFolder,
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

  describe("createGoogleDriveFolder", () => {
    it("指定したフォルダ名とparentFolderIdで新規フォルダを作成できること", async () => {
      const mockResponse = { id: "created-folder-id-123" };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await createGoogleDriveFolder({
        accessToken: "valid-token",
        folderName: "PoohMa",
        parentFolderId: "parent-folder-456",
      });

      expect(result).toEqual({ folderId: "created-folder-id-123" });
      expect(global.fetch).toHaveBeenCalledWith(
        "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id",
        expect.objectContaining({
          method: "POST",
          headers: {
            Authorization: "Bearer valid-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "PoohMa",
            mimeType: "application/vnd.google-apps.folder",
            parents: ["parent-folder-456"],
          }),
        }),
      );
    });

    it("フォルダ作成 API 失敗時に null を返すこと", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: "Internal Server Error",
      } as Response);

      const result = await createGoogleDriveFolder({
        accessToken: "valid-token",
        folderName: "PoohMa",
      });

      expect(result).toBeNull();
    });
  });
});
