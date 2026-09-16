import "server-only";
import dns from "node:dns/promises";
import net from "node:net";

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
