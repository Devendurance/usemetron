/**
 * SSRF-safe upstream URL validation for creator-supplied endpoint URLs.
 *
 * Rejects malformed URLs, non-HTTP(S) schemes, HTTP in production,
 * localhost, loopback/private/link-local IP ranges (IPv4 + IPv6 incl.
 * IPv4-mapped IPv6), cloud metadata endpoints, and URLs with embedded
 * credentials. When `resolveDns` is enabled the hostname is resolved and
 * every resulting IP is checked; DNS failure fails closed.
 *
 * Pure and injectable: the DNS resolver is passed in so tests never touch
 * the real network. Validation never follows redirects (it never fetches).
 */

import { lookup as defaultLookup } from "node:dns/promises";

export type UpstreamUrlResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

export type DnsResolver = (hostname: string) => Promise<string[]>;

export type ValidateUpstreamUrlOptions = {
  /** Reject plain http:// URLs. Default: `NODE_ENV === "production"`. */
  rejectHttp?: boolean;
  /** Resolve hostnames and reject any destination resolving to a blocked IP. */
  resolveDns?: boolean;
  /** Injectable DNS resolver (defaults to node:dns/promises lookup all). */
  resolver?: DnsResolver;
};

const PRIVATE_IPV4_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00000000, 0x00ffffff], // 0.0.0.0/8 — "this network" (incl. 0.0.0.0)
  [0x0a000000, 0x0affffff], // 10.0.0.0/8
  [0x7f000000, 0x7fffffff], // 127.0.0.0/8 loopback
  [0x64400000, 0x647fffff], // 100.64.0.0/10 CGNAT
  [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16 link-local (cloud metadata)
  [0xac100000, 0xac1fffff], // 172.16.0.0/12
  [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16
  [0xc6120000, 0xc613ffff], // 198.18.0.0/15 benchmarking
  [0xe0000000, 0xefffffff], // 224.0.0.0/4 multicast
  [0xf0000000, 0xffffffff], // 240.0.0.0/4 reserved
];

function ipv4ToNumber(parts: number[]): number {
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return false;
  }
  const value = ipv4ToNumber(parts);
  return PRIVATE_IPV4_RANGES.some(([start, end]) => value >= start && value <= end);
}

function parseIpv6(ip: string): number[] {
  // Returns the expanded groups as a flat array of 16-bit numbers.
  const raw = ip.toLowerCase();
  const [head, tail] = raw.split("::");
  const headParts = head === "" ? [] : head.split(":");
  const tailParts = tail === undefined || tail === "" ? [] : tail.split(":");
  const total = headParts.length + tailParts.length;
  if (total > 7) return [];
  const zeros = 8 - total;
  const groups = [
    ...headParts,
    ...Array.from({ length: zeros }, () => "0"),
    ...tailParts,
  ];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) {
    return [];
  }
  return groups.map((g) => parseInt(g, 16));
}

function isBlockedIpv6(ip: string): boolean {
  // Handle IPv4-mapped IPv6 (::ffff:1.2.3.4 and Node's hex form
  // ::ffff:7f00:1) by checking the embedded IPv4.
  const v4MappedDotted = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4MappedDotted) {
    return isBlockedIpv4(v4MappedDotted[1]!);
  }
  const groups = parseIpv6(ip);
  if (groups.length !== 8) return false;

  const v4MappedHex =
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff;
  if (v4MappedHex) {
    const embedded = [
      (groups[6]! >> 8) & 0xff,
      groups[6]! & 0xff,
      (groups[7]! >> 8) & 0xff,
      groups[7]! & 0xff,
    ].join(".");
    return isBlockedIpv4(embedded);
  }

  // :: (unspecified), ::1 (loopback)
  if (groups.every((g) => g === 0)) return true;
  if (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0 && groups[6] === 0 && groups[7] === 1) {
    return true;
  }
  // fc00::/7 unique local
  if ((groups[0]! & 0xfe00) === 0xfc00) return true;
  // fe80::/10 link-local
  if ((groups[0]! & 0xffc0) === 0xfe80) return true;
  // ff00::/8 multicast
  if ((groups[0]! & 0xff00) === 0xff00) return true;
  // 2001:db8::/32 documentation
  if (groups[0]! === 0x2001 && groups[1]! === 0x0db8) return true;
  return false;
}

function isBlockedIp(ip: string): boolean {
  return ip.includes(":") ? isBlockedIpv6(ip) : isBlockedIpv4(ip);
}

export { isBlockedIp };

function isIpLiteral(host: string): boolean {
  return (
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.includes(":")
  );
}

/** Hostnames that never represent a legitimate public upstream. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.aws.internal",
  "metadata.azure.internal",
]);

export function isBlockedHostname(host: string): boolean {
  const normalized = host.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(normalized)) return true;
  if (normalized.endsWith(".localhost")) return true;
  if (normalized.endsWith(".local")) return true;
  return false;
}

function defaultResolver(hostname: string): Promise<string[]> {
  return defaultLookup(hostname, { all: true }).then((records) =>
    records.map((r) => r.address)
  );
}

/**
 * Resolves a hostname and returns ONLY its public addresses. Rejects when
 * any resolved address is blocked (loopback/private/link-local/metadata/
 * reserved, including IPv4-mapped IPv6) or when resolution fails.
 *
 * The returned address list is what the upstream client pins its
 * connection to (see `lib/gateway/upstream-client.ts`) so a post-resolution
 * DNS rebinding cannot redirect the connection to a private destination.
 */
export async function resolvePublicAddresses(
  hostname: string,
  resolver: DnsResolver = defaultResolver
): Promise<{ ok: true; addresses: string[] } | { ok: false; reason: string }> {
  let addresses: string[];
  try {
    addresses = await resolver(hostname);
  } catch {
    return { ok: false, reason: "url_dns_resolution_failed" };
  }
  if (addresses.length === 0) {
    return { ok: false, reason: "url_dns_resolution_failed" };
  }
  if (addresses.some((address) => isBlockedIp(address))) {
    return { ok: false, reason: "url_resolves_to_blocked_ip" };
  }
  return { ok: true, addresses };
}

/**
 * Validates a creator-supplied upstream URL. Fails closed: any uncertainty
 * (unparseable, blocked, DNS failure) is a rejection with a reason string.
 */
export async function validateUpstreamUrl(
  input: string,
  options: ValidateUpstreamUrlOptions = {}
): Promise<UpstreamUrlResult> {
  const rejectHttp = options.rejectHttp ?? process.env.NODE_ENV === "production";
  const resolveDns = options.resolveDns ?? false;
  const resolver = options.resolver ?? defaultResolver;

  if (typeof input !== "string" || input.trim() === "") {
    return { ok: false, reason: "url_empty" };
  }
  const trimmed = input.trim();

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "url_malformed" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "url_unsupported_scheme" };
  }
  if (url.protocol === "http:" && rejectHttp) {
    return { ok: false, reason: "url_http_not_allowed" };
  }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "url_embedded_credentials" };
  }
  if (url.port !== "" && Number.isNaN(Number(url.port))) {
    return { ok: false, reason: "url_malformed" };
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");

  if (isIpLiteral(host)) {
    return isBlockedIp(host)
      ? { ok: false, reason: "url_blocked_ip" }
      : { ok: true, url };
  }

  if (isBlockedHostname(host)) {
    return { ok: false, reason: "url_blocked_hostname" };
  }

  if (resolveDns) {
    let addresses: string[];
    try {
      addresses = await resolver(host);
    } catch {
      // Cannot verify the destination — fail closed.
      return { ok: false, reason: "url_dns_resolution_failed" };
    }
    for (const address of addresses) {
      if (isBlockedIp(address)) {
        return { ok: false, reason: "url_resolves_to_blocked_ip" };
      }
    }
  }

  return { ok: true, url };
}
