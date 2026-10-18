import type { api } from "@poohma/backend/api";
import type { ExtensionMessage } from "@poohma/shared/schemas/extension-messages";
import type { FunctionReturnType } from "convex/server";

export type ServiceRecordItem = FunctionReturnType<
  typeof api.records.getRecords
>[number];

export type CredentialItem = NonNullable<
  ServiceRecordItem["credentials"]
>[number];

export interface MatchedCredential {
  _id: string;
  label?: string;
  loginId: string;
  hasPasswordHint: boolean;
}

export interface MatchedRecord {
  _id: string;
  title: string;
  url?: string;
  credentials: MatchedCredential[];
}

export const DEFAULT_MESSAGE_TIMEOUT_MS = 3000;

/**
 * タイムアウト保護付きの型安全な chrome.runtime.sendMessage ラッパー
 */
export async function sendExtensionMessage<T = unknown>(
  message: ExtensionMessage | { type: string; [key: string]: unknown },
  timeoutMs = DEFAULT_MESSAGE_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let isSettled = false;
    const timer = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        reject(
          new Error(
            `Extension message timeout after ${timeoutMs}ms: ${message.type}`,
          ),
        );
      }
    }, timeoutMs);

    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timer);

        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response as T);
        }
      });
    } catch (error) {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timer);
        reject(error);
      }
    }
  });
}

/**
 * タイムアウト保護付きのタブメッセージ送信ラッパー
 */
export async function sendTabMessage<T = unknown>(
  tabId: number,
  message: ExtensionMessage | { type: string; [key: string]: unknown },
  timeoutMs = DEFAULT_MESSAGE_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let isSettled = false;
    const timer = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        reject(
          new Error(
            `Tab message timeout after ${timeoutMs}ms: ${message.type}`,
          ),
        );
      }
    }, timeoutMs);

    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timer);

        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response as T);
        }
      });
    } catch (error) {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timer);
        reject(error);
      }
    }
  });
}
