import dns from "node:dns/promises";
import net from "node:net";

/**
 * IPv6 アドレスを 8 個の 16 ビット整数配列に正規化・展開する
 */
function parseIpv6(ip: string): number[] | null {
  const normalized = ip.toLowerCase();
  const lastColon = normalized.lastIndexOf(":");
  let ipv4Parts: number[] | null = null;
  let v6Part = normalized;

  // 埋め込み IPv4 (例: ::ffff:192.168.1.1 や ::127.0.0.1) の処理
  if (lastColon !== -1 && normalized.includes(".")) {
    const possibleIpv4 = normalized.slice(lastColon + 1);
    if (net.isIPv4(possibleIpv4)) {
      const octets = possibleIpv4.split(".").map(Number);
      ipv4Parts = [
        ((octets[0] ?? 0) << 8) | (octets[1] ?? 0),
        ((octets[2] ?? 0) << 8) | (octets[3] ?? 0),
      ];
      v6Part = normalized.slice(0, lastColon);
    }
  }

  const parts = v6Part.split("::");
  if (parts.length > 2) return null;

  const left = parts[0]
    ? parts[0]
        .split(":")
        .filter(Boolean)
        .map((h) => parseInt(h, 16))
    : [];
  let right = parts[1]
    ? parts[1]
        .split(":")
        .filter(Boolean)
        .map((h) => parseInt(h, 16))
    : [];

  if (ipv4Parts) {
    if (parts.length === 2) {
      right = right.concat(ipv4Parts);
    } else {
      left.push(...ipv4Parts);
    }
  }

  if (left.some(Number.isNaN) || right.some(Number.isNaN)) return null;

  const totalGroups = 8;
  const missing = totalGroups - (left.length + right.length);
  if (parts.length === 2 && missing >= 0) {
    const zeros = new Array(missing).fill(0);
    return [...left, ...zeros, ...right];
  }
  if (parts.length === 1 && left.length === totalGroups) {
    return left;
  }
  return null;
}

/**
 * プライベートIP / 予約済みIPアドレスかどうかを判定
 */
export function isPrivateIp(ip: string): boolean {
  // IPv4 チェック
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts as [number, number, number, number];

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
    const words = parseIpv6(ip);
    if (!words) return true; // パースできない不正形式は安全側に倒してブロック

    const [w0, w1, w2, _w3, _w4, w5, w6, w7] = words as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];

    // :: (unspecified)
    if (words.every((w) => w === 0)) return true;

    // ::1 (loopback)
    if (words.slice(0, 7).every((w) => w === 0) && w7 === 1) return true;

    // fc00::/7 (Unique Local Address: fc00::/8, fd00::/8)
    if ((w0 & 0xfe00) === 0xfc00) return true;

    // fe80::/10 (Link-Local unicast)
    if ((w0 & 0xffc0) === 0xfe80) return true;

    // IPv4-mapped (::ffff:0:0/96) & IPv4-compatible (::/96)
    const isMappedOrCompatible =
      words.slice(0, 5).every((w) => w === 0) &&
      (w5 === 0xffff || w5 === 0x0000);
    if (isMappedOrCompatible) {
      const ipv4Str = `${(w6 >> 8) & 0xff}.${w6 & 0xff}.${(w7 >> 8) & 0xff}.${w7 & 0xff}`;
      return isPrivateIp(ipv4Str);
    }

    // 6to4 (2002::/16) - 埋め込みIPv4を検証
    if (w0 === 0x2002) {
      const ipv4Str = `${(w1 >> 8) & 0xff}.${w1 & 0xff}.${(w2 >> 8) & 0xff}.${w2 & 0xff}`;
      return isPrivateIp(ipv4Str);
    }

    // Teredo (2001:0000::/32) - XOR反転されたIPv4を検証
    if (w0 === 0x2001 && w1 === 0x0000) {
      const invWord6 = w6 ^ 0xffff;
      const invWord7 = w7 ^ 0xffff;
      const ipv4Str = `${(invWord6 >> 8) & 0xff}.${invWord6 & 0xff}.${(invWord7 >> 8) & 0xff}.${invWord7 & 0xff}`;
      return isPrivateIp(ipv4Str);
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
