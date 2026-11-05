import "server-only";
import dns from "node:dns/promises";
import net from "node:net";
import http from "node:http";
import https from "node:https";

// Shared by url-metadata.ts (page title) and favicon-service.ts (favicon
// discovery) — the one place in the app that fetches an arbitrary
// user/sponsor-supplied URL server-side, so the SSRF guard lives here once
// instead of being reimplemented per caller.

const FETCH_TIMEOUT_MS = 4000;
const MAX_REDIRECTS = 3;

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    if (lower.startsWith("fe80")) return true; // link-local
    return false;
  }
  return true; // couldn't parse — treat as unsafe
}

/**
 * Resolves the hostname's *actual* IP (not just the literal string) before
 * allowing a fetch, so a public-looking hostname that DNS-rebinds to an
 * internal/cloud-metadata address is still blocked — a plain hostname
 * denylist wouldn't catch that.
 */
async function assertSafeUrl(rawUrl: string): Promise<URL> {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are allowed.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (hostname === "localhost") throw new Error("URL not allowed.");

  const records = await dns.lookup(hostname, { all: true });
  if (records.length === 0 || records.some((r) => isPrivateIp(r.address))) {
    throw new Error("URL not allowed.");
  }
  return url;
}

/** Mutable out-param some callers use to learn how many redirect hops were
 * actually followed (for diagnostics) — optional, defaults to a throwaway
 * counter so existing call sites that don't care can ignore it entirely. */
export interface RedirectCounter {
  count: number;
}

export async function safeFetch(
  rawUrl: string,
  init: RequestInit,
  redirectsLeft = MAX_REDIRECTS,
  counter: RedirectCounter = { count: 0 },
): Promise<Response> {
  const url = await assertSafeUrl(rawUrl);
  const res = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

  // Re-validate every redirect hop through assertSafeUrl too — otherwise a
  // public URL that 302s to an internal address would slip past the check
  // above. Also how bare-domain-to-www redirects (and http->https) get
  // followed transparently for favicon/page discovery.
  if (res.status >= 300 && res.status < 400 && redirectsLeft > 0) {
    const location = res.headers.get("location");
    if (location) {
      await res.body?.cancel().catch(() => {});
      counter.count += 1;
      return safeFetch(new URL(location, url).toString(), init, redirectsLeft - 1, counter);
    }
  }
  return res;
}

/** Stricter public-page policy for authenticated autofill. Existing favicon callers are unchanged. */
export function isPublicWebsiteIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b, c] = ip.split(".").map(Number);
    return !isPrivateIp(ip) && a < 224 && !(a === 100 && b >= 64 && b <= 127)
      && !(a === 192 && (b === 0 || (b === 88 && c === 99))) && !(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      && !(a === 203 && b === 0 && c === 113);
  }
  // Global unicast only. Reject IPv4-mapped/NAT64, local, multicast and transition ranges.
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    const first = parseInt(lower.split(":")[0], 16);
    const second = parseInt(lower.split(":")[1] || "0", 16);
    return first >= 0x2000 && first <= 0x3ffd && first !== 0x2002
      && !(first === 0x2001 && (second < 0x200 || second === 0xdb8));
  }
  return false;
}

export function parsePublicWebsiteUrl(raw: unknown): URL {
  if (typeof raw !== "string" || raw.length > 2048 || /[\u0000-\u0020\\]/.test(raw.trim())) throw new Error("Enter a valid public website URL.");
  const value = raw.trim();
  if (!value || (value.includes("://") && !/^https?:\/\//i.test(value))) throw new Error("Only http/https websites are supported.");
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port || url.search || url.hash
    || hostname.endsWith(".") || (!net.isIP(hostname) && (!hostname.includes(".") || /\.(localhost|local|internal|lan|home|test|invalid)$/.test(hostname)))
    || (net.isIP(hostname) && !isPublicWebsiteIp(hostname))) throw new Error("Use a public website URL without credentials, query parameters or custom ports.");
  return url;
}

const PAGE_LIMIT = 300_000;
/** Pinned connections prevent DNS rebinding between validation and the HTTP request. */
export async function fetchPublicWebsite(raw: string): Promise<{ html: string; url: string }> {
  const signal = AbortSignal.timeout(10000);
  let url = parsePublicWebsiteUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    signal.throwIfAborted();
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const records = net.isIP(hostname) ? [{ address: hostname, family: net.isIP(hostname) }] : await new Promise<Array<{ address: string; family: number }>>((resolve, reject) => {
      const abort = () => reject(new Error("Website lookup timed out."));
      signal.addEventListener("abort", abort, { once: true });
      dns.lookup(hostname, { all: true }).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
    signal.throwIfAborted();
    if (!Array.isArray(records) || !records.length || records.some((record) => !isPublicWebsiteIp(record.address))) throw new Error("Website address is not public.");
    const address = records[0].address;
    const page = await new Promise<{ html: string; location?: string }>((resolve, reject) => {
      const request = (url.protocol === "https:" ? https : http).request({
        hostname: address, port: url.protocol === "https:" ? 443 : 80, method: "GET", path: url.pathname,
        servername: net.isIP(hostname) ? undefined : hostname, signal, agent: false,
        headers: { Host: url.host, Accept: "text/html,application/xhtml+xml", "Accept-Encoding": "identity", "User-Agent": "TheArena-Metadata/1.0" },
      }, (response) => {
        const status = response.statusCode ?? 500;
        if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
          response.destroy(); resolve({ html: "", location: response.headers.location }); return;
        }
        if (status < 200 || status >= 300 || !/^(text\/html|application\/xhtml\+xml)(;|$)/i.test(response.headers["content-type"] ?? "")
          || (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity")) {
          response.destroy(); reject(new Error("This website could not be read. Enter your details manually.")); return;
        }
        const chunks: Buffer[] = []; let size = 0;
        response.on("data", (chunk: Buffer) => {
          const remaining = PAGE_LIMIT - size;
          if (remaining > 0) { const bounded = chunk.subarray(0, remaining); chunks.push(bounded); size += bounded.length; }
          // Metadata is near the beginning. Large pages can still be read safely without downloading them in full.
          if (size >= PAGE_LIMIT) { resolve({ html: Buffer.concat(chunks).toString("utf8") }); response.destroy(); }
        });
        response.on("error", reject);
        response.on("aborted", () => reject(new Error("Website request was interrupted.")));
        response.on("end", () => resolve({ html: Buffer.concat(chunks).toString("utf8") }));
      });
      request.on("error", reject); request.end();
    });
    if (!page.location) return { html: page.html, url: url.toString() };
    if (hop === MAX_REDIRECTS) throw new Error("Too many website redirects.");
    const destination = new URL(page.location, url);
    if (url.protocol === "https:" && destination.protocol !== "https:") throw new Error("Unsafe website redirect.");
    // Marketing query strings on redirects are discarded; no private URL parameters are fetched or cached.
    destination.search = ""; destination.hash = "";
    url = parsePublicWebsiteUrl(destination.toString());
  }
  throw new Error("Website could not be read.");
}
