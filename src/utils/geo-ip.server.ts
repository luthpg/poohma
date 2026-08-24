import { env } from "@/env/server";

/**
 * プライベートIP / ループバックアドレス判定
 */
function isPrivateOrLocalIp(ip: string): boolean {
  if (
    !ip ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "localhost" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("fc00:") ||
    ip.startsWith("fd00:") || // fc00::/7 includes fd00::/8
    ip.startsWith("fe80:") ||
    ip.startsWith("fe90:") || // fe80::/10 includes fe80::/64 through febf::/64
    ip.startsWith("fea0:") ||
    ip.startsWith("feb0:") ||
    ip.startsWith("169.254.") // IPv4 link-local
  ) {
    return true;
  }

  // 172.16.0.0/12
  if (ip.startsWith("172.")) {
    const parts = ip.split(".");
    if (parts.length >= 2) {
      const secondOctet = Number.parseInt(parts[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) {
        return true;
      }
    }
  }

  return false;
}

interface AbstractGeoIpResponse {
  city?: string | null;
  region?: string | null;
  country?: string | null;
}

/**
 * IPアドレスから位置情報（例: "東京都, 日本" or "Los Angeles, California, United States"）を取得する
 */
export async function fetchGeoLocation(
  ipAddress?: string,
): Promise<string | undefined> {
  if (!ipAddress) return undefined;

  // プライベートIPまたはローカルホストの場合は外部API呼び出しをスキップ
  if (isPrivateOrLocalIp(ipAddress)) {
    return undefined;
  }

  const apiKey = env.ABSTRACT_IP_GEOLOCATION_API_KEY;
  if (!apiKey) {
    return undefined;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    try {
      const url = new URL("https://ipgeolocation.abstractapi.com/v1/");
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("ip_address", ipAddress);

      const response = await fetch(url.toString(), {
        signal: controller.signal,
      });

      if (!response.ok) {
        console.warn(
          `Abstract API GeoIP request failed: status ${response.status}`,
        );
        return undefined;
      }

      const data = (await response.json()) as AbstractGeoIpResponse;
      const parts: string[] = [];

      if (data.city) parts.push(data.city);
      if (data.region && data.region !== data.city) parts.push(data.region);
      if (data.country) parts.push(data.country);

      if (parts.length === 0) return undefined;
      return parts.join(", ");
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.warn("Failed to fetch geolocation from Abstract API:", error);
    return undefined;
  }
}
