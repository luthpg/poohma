import dns from "node:dns/promises";
import net from "node:net";
import ipaddr from "ipaddr.js";

/**
 * プライベートIP / 予約済みIPアドレスかどうかを判定 (SSRF対策)
 * ipaddr.js を利用して RFC 準拠の安全な判定を行う
 */
export function isPrivateIp(ip: string): boolean {
  if (!ipaddr.isValid(ip)) {
    // パースできない不正形式は安全側に倒してブロック
    return true;
  }

  const addr = ipaddr.parse(ip);

  // IPv4 チェック
  if (addr.kind() === "ipv4") {
    // unicast 以外（private, loopback, linkLocal, broadcast, carrierGradeNat, unspecified, reserved 等）はすべてブロック
    return addr.range() !== "unicast";
  }

  // IPv6 チェック
  const v6 = addr as ipaddr.IPv6;
  const range = v6.range();

  // 1. IPv4-mapped (::ffff:x.x.x.x)
  if (range === "ipv4Mapped") {
    return isPrivateIp(v6.toIPv4Address().toString());
  }

  // 2. IPv4-compatible (::x.x.x.x) - RFC 4291 廃止済みだが埋め込みIPv4を検証
  if (v6.parts.slice(0, 6).every((p) => p === 0)) {
    const p6 = v6.parts[6] ?? 0;
    const p7 = v6.parts[7] ?? 0;
    const ipv4 = new ipaddr.IPv4([
      (p6 >> 8) & 0xff,
      p6 & 0xff,
      (p7 >> 8) & 0xff,
      p7 & 0xff,
    ]);
    return isPrivateIp(ipv4.toString());
  }

  // 3. 6to4 (2002::/16) - 続く32ビットが埋め込みIPv4
  if (range === "6to4") {
    const p1 = v6.parts[1] ?? 0;
    const p2 = v6.parts[2] ?? 0;
    const ipv4 = new ipaddr.IPv4([
      (p1 >> 8) & 0xff,
      p1 & 0xff,
      (p2 >> 8) & 0xff,
      p2 & 0xff,
    ]);
    return isPrivateIp(ipv4.toString());
  }

  // 4. Teredo (2001:0000::/32) - 末尾32ビットが XOR 0xffff されたIPv4
  if (range === "teredo") {
    const p6 = (v6.parts[6] ?? 0) ^ 0xffff;
    const p7 = (v6.parts[7] ?? 0) ^ 0xffff;
    const ipv4 = new ipaddr.IPv4([
      (p6 >> 8) & 0xff,
      p6 & 0xff,
      (p7 >> 8) & 0xff,
      p7 & 0xff,
    ]);
    return isPrivateIp(ipv4.toString());
  }

  // 5. NAT64 Well-Known Prefix (64:ff9b::/96) (RFC 6052)
  if (range === "rfc6052") {
    const p6 = v6.parts[6] ?? 0;
    const p7 = v6.parts[7] ?? 0;
    const ipv4 = new ipaddr.IPv4([
      (p6 >> 8) & 0xff,
      p6 & 0xff,
      (p7 >> 8) & 0xff,
      p7 & 0xff,
    ]);
    return isPrivateIp(ipv4.toString());
  }

  // 6. 一般的な IPv6: unicast 以外（loopback, linkLocal, uniqueLocal, unspecified, multicast, reserved 等）はすべてブロック
  return range !== "unicast";
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
    // biome-ignore lint/style/noNonNullAssertion: addresses4 is not empty
    return addresses4[0]!;
  }

  for (const addr of addresses6) {
    if (isPrivateIp(addr)) {
      throw new Error("Access to private IP addresses is not allowed");
    }
  }
  if (addresses6.length > 0) {
    // biome-ignore lint/style/noNonNullAssertion: addresses6 is not empty
    return addresses6[0]!;
  }

  throw new Error("No safe IP addresses found");
}
