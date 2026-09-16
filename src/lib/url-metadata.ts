import "server-only";
import dns from "node:dns/promises";
import net from "node:net";

const FETCH_TIMEOUT_MS = 4000;
const MAX_HTML_BYTES = 200_000; // enough to reach </head> without downloading whole pages
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
 * denylist wouldn't catch that. Sponsors control the URL here, so this is
 * the one place in the app that fetches an arbitrary user-supplied URL
 * server-side.
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

async function safeFetch(rawUrl: string, init: RequestInit, redirectsLeft = MAX_REDIRECTS): Promise<Response> {
  const url = await assertSafeUrl(rawUrl);
  const res = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

  // Re-validate every redirect hop through assertSafeUrl too — otherwise a
  // public URL that 302s to an internal address would slip past the check
  // above.
  if (res.status >= 300 && res.status < 400 && redirectsLeft > 0) {
    const location = res.headers.get("location");
    if (location) {
      await res.body?.cancel().catch(() => {});
      return safeFetch(new URL(location, url).toString(), init, redirectsLeft - 1);
    }
  }
  return res;
}

/** Tries the site's own /favicon.ico first, then a public favicon service
 * (works for almost any domain, never 404s) as a reliable fallback. */
export async function resolveFaviconUrl(pageUrl: string): Promise<string | null> {
  try {
    const url = new URL(pageUrl);
    const direct = `${url.protocol}//${url.host}/favicon.ico`;
    const res = await safeFetch(direct, { method: "GET" });
    const contentType = res.headers.get("content-type") ?? "";
    await res.body?.cancel().catch(() => {});
    if (res.ok && contentType.startsWith("image")) {
      return direct;
    }
  } catch {
    // fall through to the fallback service below
  }

  try {
    const hostname = new URL(pageUrl).hostname;
    return `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(hostname)}`;
  } catch {
    return null;
  }
}

/** Best-effort <title> extraction, capped to a small byte budget and never
 * throwing — the sponsor can always type a name by hand if this fails. */
export async function fetchPageTitle(pageUrl: string): Promise<string | null> {
  try {
    const res = await safeFetch(pageUrl, { headers: { Accept: "text/html" } });
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.includes("text/html") || !res.body) {
      await res.body?.cancel().catch(() => {});
      return null;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let received = 0;
    while (received < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    await reader.cancel().catch(() => {});

    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!match) return null;
    const decoded = match[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    return decoded ? decoded.slice(0, 80) : null;
  } catch {
    return null;
  }
}

export interface UrlMetadata {
  name: string | null;
  logoUrl: string | null;
}

export async function fetchUrlMetadata(pageUrl: string): Promise<UrlMetadata> {
  const [name, logoUrl] = await Promise.all([fetchPageTitle(pageUrl), resolveFaviconUrl(pageUrl)]);
  return { name, logoUrl };
}
