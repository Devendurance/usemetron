import { describe, expect, it } from "vitest";

import {
  isBlockedHostname,
  validateUpstreamUrl,
} from "./validate";

/** Deterministic resolver used instead of real DNS. */
function resolverFor(...addresses: string[]) {
  return async () => addresses;
}

describe("validateUpstreamUrl — accepted URLs", () => {
  it("accepts a public HTTPS URL", async () => {
    const result = await validateUpstreamUrl("https://api.example.com/v1/translate", {
      rejectHttp: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url.hostname).toBe("api.example.com");
  });

  it("accepts public HTTPS with path and query", async () => {
    const result = await validateUpstreamUrl(
      "https://api.example.com/v1/translate?lang=en",
      { rejectHttp: true }
    );
    expect(result.ok).toBe(true);
  });

  it("accepts HTTP when allowed (non-production)", async () => {
    const result = await validateUpstreamUrl("http://api.example.com", {
      rejectHttp: false,
    });
    expect(result.ok).toBe(true);
  });
});

describe("validateUpstreamUrl — rejected URLs", () => {
  it("rejects malformed URLs", async () => {
    for (const bad of ["", "not a url", "https://", "https://exa mple.com", "//host/path"]) {
      const result = await validateUpstreamUrl(bad, { rejectHttp: true });
      expect(result.ok, `should reject ${JSON.stringify(bad)}`).toBe(false);
    }
  });

  it("rejects unsafe schemes", async () => {
    for (const bad of ["ftp://example.com", "file:///etc/passwd", "ws://example.com", "javascript:alert(1)"]) {
      const result = await validateUpstreamUrl(bad, { rejectHttp: true });
      expect(result.ok, `should reject ${bad}`).toBe(false);
    }
  });

  it("rejects HTTP in production mode", async () => {
    const result = await validateUpstreamUrl("http://api.example.com", {
      rejectHttp: true,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects URLs with embedded credentials", async () => {
    const result = await validateUpstreamUrl("https://user:pass@api.example.com", {
      rejectHttp: true,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects localhost hostnames", async () => {
    for (const host of ["localhost", "http://localhost:3000", "https://sub.localhost/x"]) {
      const result = await validateUpstreamUrl(
        host.startsWith("http") ? host : `https://${host}`,
        { rejectHttp: true }
      );
      expect(result.ok, `should reject ${host}`).toBe(false);
    }
  });

  it("rejects loopback IPv4", async () => {
    for (const ip of ["127.0.0.1", "127.8.8.8", "127.0.0.0"]) {
      const result = await validateUpstreamUrl(`https://${ip}`, { rejectHttp: true });
      expect(result.ok, `should reject ${ip}`).toBe(false);
    }
  });

  it("rejects 0.0.0.0", async () => {
    const result = await validateUpstreamUrl("https://0.0.0.0", { rejectHttp: true });
    expect(result.ok).toBe(false);
  });

  it("rejects private IPv4 ranges", async () => {
    for (const ip of ["10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1"]) {
      const result = await validateUpstreamUrl(`https://${ip}`, { rejectHttp: true });
      expect(result.ok, `should reject ${ip}`).toBe(false);
    }
  });

  it("rejects link-local IPv4 (cloud metadata)", async () => {
    for (const ip of ["169.254.169.254", "169.254.0.1"]) {
      const result = await validateUpstreamUrl(`https://${ip}`, { rejectHttp: true });
      expect(result.ok, `should reject ${ip}`).toBe(false);
    }
  });

  it("rejects private/link-local IPv6", async () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1"]) {
      const result = await validateUpstreamUrl(`https://[${ip}]`, { rejectHttp: true });
      expect(result.ok, `should reject ${ip}`).toBe(false);
    }
  });

  it("rejects IPv4-mapped IPv6 loopback/private", async () => {
    for (const ip of ["::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:192.168.1.1"]) {
      const result = await validateUpstreamUrl(`https://[${ip}]`, { rejectHttp: true });
      expect(result.ok, `should reject ${ip}`).toBe(false);
    }
  });

  it("rejects metadata hostnames", async () => {
    const result = await validateUpstreamUrl("https://metadata.google.internal", {
      rejectHttp: true,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects .local hostnames", async () => {
    const result = await validateUpstreamUrl("https://printer.local", {
      rejectHttp: true,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects hostnames resolving to blocked IPs when DNS resolution is enabled", async () => {
    const result = await validateUpstreamUrl("https://evil.example.com", {
      rejectHttp: true,
      resolveDns: true,
      resolver: resolverFor("127.0.0.1"),
    });
    expect(result.ok).toBe(false);
  });

  it("accepts hostnames resolving to public IPs", async () => {
    const result = await validateUpstreamUrl("https://api.example.com", {
      rejectHttp: true,
      resolveDns: true,
      resolver: resolverFor("93.184.216.34", "2606:2800:220:1::1"),
    });
    expect(result.ok).toBe(true);
  });

  it("fails closed when DNS resolution fails", async () => {
    const result = await validateUpstreamUrl("https://nxdomain.example.com", {
      rejectHttp: true,
      resolveDns: true,
      resolver: async () => {
        throw new Error("ENOTFOUND");
      },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects any resolved address when mixed public/private", async () => {
    const result = await validateUpstreamUrl("https://dual.example.com", {
      rejectHttp: true,
      resolveDns: true,
      resolver: resolverFor("93.184.216.34", "10.0.0.1"),
    });
    expect(result.ok).toBe(false);
  });
});

describe("isBlockedHostname", () => {
  it("blocks localhost, metadata, and mDNS names case-insensitively", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("LocalHost")).toBe(true);
    expect(isBlockedHostname("sub.localhost")).toBe(true);
    expect(isBlockedHostname("metadata.google.internal")).toBe(true);
    expect(isBlockedHostname("router.local")).toBe(true);
    expect(isBlockedHostname("api.example.com")).toBe(false);
    expect(isBlockedHostname("localhost.attack.com")).toBe(false);
  });
});

describe("validateUpstreamUrl — full blocklist range table (M11)", () => {
  it("blocks CGNAT 100.64.0.0/10 and allows the first address outside it", async () => {
    for (const ip of ["100.64.0.1", "100.127.255.255"]) {
      const result = await validateUpstreamUrl(`https://${ip}`, { rejectHttp: true });
      expect(result.ok, `should reject ${ip}`).toBe(false);
    }
    const outside = await validateUpstreamUrl("https://100.128.0.1", { rejectHttp: true });
    expect(outside.ok).toBe(true);
  });

  it("blocks benchmarking 198.18.0.0/15 and allows the first address outside it", async () => {
    for (const ip of ["198.18.0.1", "198.19.255.255"]) {
      const result = await validateUpstreamUrl(`https://${ip}`, { rejectHttp: true });
      expect(result.ok, `should reject ${ip}`).toBe(false);
    }
    const outside = await validateUpstreamUrl("https://198.20.0.1", { rejectHttp: true });
    expect(outside.ok).toBe(true);
  });

  it("blocks multicast 224.0.0.0/4", async () => {
    for (const ip of ["224.0.0.1", "239.255.255.255"]) {
      const result = await validateUpstreamUrl(`https://${ip}`, { rejectHttp: true });
      expect(result.ok, `should reject ${ip}`).toBe(false);
    }
  });

  it("blocks reserved 240.0.0.0/4 (incl. the 255.255.255.255 broadcast)", async () => {
    for (const ip of ["240.0.0.1", "255.255.255.255"]) {
      const result = await validateUpstreamUrl(`https://${ip}`, { rejectHttp: true });
      expect(result.ok, `should reject ${ip}`).toBe(false);
    }
  });

  it("blocks IPv6 multicast ff00::/8 and documentation 2001:db8::/32", async () => {
    for (const ip of ["ff00::1", "ff01::1", "2001:db8::1"]) {
      const result = await validateUpstreamUrl(`https://[${ip}]`, { rejectHttp: true });
      expect(result.ok, `should reject ${ip}`).toBe(false);
    }
  });
});
