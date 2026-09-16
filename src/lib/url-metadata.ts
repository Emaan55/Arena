import "server-only";
import { safeFetch } from "./safe-fetch";
import { discoverFavicon } from "./favicon-service";

const MAX_HTML_BYTES = 200_000; // enough to reach </head> without downloading whole pages

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

/**
 * Live preview only (used while a sponsor is still filling out the "Add
 * External Product" form) — returns the *source* favicon URL discovered by
 * the real multi-strategy pipeline (see favicon-service.ts), not a stored
 * copy. The actual checkout/admin-creation routes re-run discovery and
 * persist a stable copy to our own storage at the point a sponsorship is
 * actually created, so an abandoned form fill never uploads anything.
 */
export async function fetchUrlMetadata(pageUrl: string): Promise<UrlMetadata> {
  const [name, outcome] = await Promise.all([fetchPageTitle(pageUrl), discoverFavicon(pageUrl)]);
  return { name, logoUrl: outcome.favicon?.sourceUrl ?? null };
}
