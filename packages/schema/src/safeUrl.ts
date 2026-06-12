// ============================================================================
// safeUrl — is this a public http(s) URL safe to fetch / open from the client?
// ============================================================================
// Pure (no DOM, no state). The app loads project documents from untrusted
// sources (a shared .yaml a colleague sends you). Those documents can carry
// URLs that the app would otherwise fetch automatically (live data) or open in
// a new tab. An attacker-controlled document must not be able to point the
// victim's browser at internal/loopback/cloud-metadata endpoints (a client-side
// SSRF / CSRF surface). This predicate is the allowlist:
//
//   - protocol MUST be http: or https: (no javascript:, data:, file:, etc.)
//   - host MUST NOT be loopback, private, link-local, or the cloud-metadata IP
//
// Hostname-based blocking is imperfect against DNS rebinding and exotic IP
// encodings, but it is solid defense-in-depth for a static SPA and closes the
// obvious holes. It is applied at the schema boundary AND re-checked right
// before any fetch.
// ============================================================================

/** True when `raw` parses to a public http(s) URL safe to fetch / open. */
export function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  // `URL` lowercases the host; strip the brackets some runtimes keep on IPv6.
  const host = url.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (host.length === 0) return false;

  if (isBlockedHostname(host)) return false;
  if (isBlockedIpv4(host)) return false;
  if (isBlockedIpv6(host)) return false;

  return true;
}

// ----------------------------------------------------------------------------
// Internals
// ----------------------------------------------------------------------------

function isBlockedHostname(host: string): boolean {
  // localhost and any subdomain of it, plus the unspecified address.
  return host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0";
}

/**
 * Block private / loopback / link-local IPv4 — including the common
 * non-dotted encodings (decimal `2130706433`, hex `0x7f000001`) that resolve to
 * 127.0.0.1. Returns false for anything that isn't an IPv4 literal at all.
 */
function isBlockedIpv4(host: string): boolean {
  const octets = parseIpv4(host);
  if (octets === null) return false;
  const [a, b] = octets;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a >= 224) return true; // multicast + reserved
  return false;
}

/** Parse the common IPv4 encodings into four octets, or null if not IPv4. */
function parseIpv4(host: string): readonly [number, number, number, number] | null {
  // Dotted-quad: 127.0.0.1
  const dotted = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (dotted !== null) {
    const parts = dotted.slice(1).map(Number);
    if (parts.every((n) => n >= 0 && n <= 255)) {
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0];
    }
    return null;
  }

  // A bare 32-bit integer (decimal or 0x-hex) is a valid host to the browser.
  const asInt = /^0x[0-9a-f]+$/.test(host) ? Number(host) : /^\d+$/.test(host) ? Number(host) : NaN;
  if (Number.isInteger(asInt) && asInt >= 0 && asInt <= 0xffffffff) {
    return [(asInt >>> 24) & 0xff, (asInt >>> 16) & 0xff, (asInt >>> 8) & 0xff, asInt & 0xff];
  }

  return null;
}

/** Block loopback / link-local / unique-local IPv6 (host has brackets stripped). */
function isBlockedIpv6(host: string): boolean {
  if (!host.includes(":")) return false; // not an IPv6 literal
  const h = host;
  if (h === "::1") return true; // loopback
  if (h === "::") return true; // unspecified
  if (h.startsWith("fe80:")) return true; // link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique-local fc00::/7

  // IPv4-mapped (::ffff:a.b.c.d). Runtimes may render the tail as dotted quad
  // or as two hex hextets (::ffff:7f00:1) — defer both to the IPv4 check.
  const dotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h);
  if (dotted?.[1] !== undefined) return isBlockedIpv4(dotted[1]);
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
  if (hex?.[1] !== undefined && hex[2] !== undefined) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    const octets = [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
    return isBlockedIpv4(octets.join("."));
  }
  return false;
}
