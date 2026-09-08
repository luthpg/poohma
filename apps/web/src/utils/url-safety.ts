import dns from "node:dns/promises";
import net from "node:net";

/**
 * プライベートIP / 予約済みIPアドレスかどうかを判定
 */
export function isPrivateIp(ip: string): boolean {
  // IPv4 チェック
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;

    // 10.0.0.0/8
    if (a === 10) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 127.0.0.0/8 (loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254) return true;
    // 0.0.0.0/8
    if (a === 0) return true;

    return false;
  }

  // IPv6 チェック
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    // ::1 (loopback)
    if (normalized === "::1") return true;
    // fc00::/7 (Unique Local Address)
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    // fe80::/10 (link-local)
    if (normalized.startsWith("fe80")) return true;
    // :: (unspecified)
    if (normalized === "::") return true;

    // ::ffff:0:0/96 (IPv4-mapped IPv6)
    if (normalized.startsWith("::ffff:")) {
      const ipv4Part = normalized.substring(7);
      if (net.isIPv4(ipv4Part)) {
        return isPrivateIp(ipv4Part);
      }
      // If it's another form of IPv4-mapped IPv6 (e.g. hex), block it for safety
      return true;
    }

    return false;
  }

  return false;
}

/**
 * URLの安全性をバリデーション (SSRF対策)
 * - http/https スキームのみ許可
 * - プライベートIP / 予約済みIPへのアクセスを禁止
 *
 * @throws URLが安全でない場合にエラーをスロー
 */
export async function validateUrlSafety(urlString: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error("Invalid URL format");
  }

  // スキームチェック: http / https のみ許可
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }

  // ホスト名がIPアドレスの場合は直接チェック (IPv6の場合はブラケットを削除)
  const hostnameWithoutBrackets = parsed.hostname.replace(/^\[(.*)\]$/, "$1");

  if (net.isIP(hostnameWithoutBrackets)) {
    if (isPrivateIp(hostnameWithoutBrackets)) {
      throw new Error("Access to private IP addresses is not allowed");
    }
    return hostnameWithoutBrackets;
  }

  // DNS解決してIPをチェック
  const addresses4 = await dns
    .resolve4(hostnameWithoutBrackets)
    .catch(() => []);
  const addresses6 = await dns
    .resolve6(hostnameWithoutBrackets)
    .catch(() => []);

  if (addresses4.length === 0 && addresses6.length === 0) {
    throw new Error("Could not resolve host");
  }

  for (const addr of addresses4) {
    if (isPrivateIp(addr)) {
      throw new Error("Access to private IP addresses is not allowed");
    }
  }
  if (addresses4.length > 0) {
    return addresses4[0];
  }

  for (const addr of addresses6) {
    if (isPrivateIp(addr)) {
      throw new Error("Access to private IP addresses is not allowed");
    }
  }
  if (addresses6.length > 0) {
    return addresses6[0];
  }

  throw new Error("No safe IP addresses found");
}
