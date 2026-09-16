/** Best-effort, client-side-only favicon guess for a product-picker list
 * (e.g. "Select an Arena product") — a plain `{origin}/favicon.ico`, with
 * no server round-trip and no guarantee it resolves (most modern sites
 * don't even serve one at that path). Only ever a stopgap for a product
 * that hasn't been through real discovery yet — see
 * lib/favicon-service.ts's discoverFavicon for the real, server-side,
 * multi-strategy resolution that's actually stored. */
export function guessFaviconUrl(pageUrl: string): string | null {
  try {
    const url = new URL(pageUrl);
    return `${url.protocol}//${url.host}/favicon.ico`;
  } catch {
    return null;
  }
}

// Shared by product submission (POST /api/products) and external
// sponsorship (POST /api/sponsorship/checkout) so both validate/normalize
// URLs the same way.
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) return null;
    u.protocol = "https:"; // normalize scheme so http/https variants dedupe as the same URL
    return u.toString();
  } catch {
    return null;
  }
}
