import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * HTML文字列から安全にタグを除去してプレーンテキストを生成する。
 * タグ除去を繰り返し適用し、残留する孤立タグや多重タグを完全に排除。
 */
export function stripHtmlTags(input: string): string {
  if (!input) return "";

  let text = input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style[^>]*>/gi, " ");

  let prev = "";
  while (text !== prev) {
    prev = text;
    text = text.replace(/<[^<>]+>/g, " ");
  }

  return text.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
}
