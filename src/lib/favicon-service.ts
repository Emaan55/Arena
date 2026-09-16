import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { safeFetch } from "./safe-fetch";

type AdminClient = SupabaseClient<Database>;

const MAX_IMAGE_BYTES = 1_500_000; // 1.5MB — generous for a favicon, still bounded
const MAX_DISCOVERY_HTML_BYTES = 300_000;
const MAX_MANIFEST_BYTES = 200_000;
const FAVICON_BUCKET = "favicons";

/**
 * The single reusable favicon engine for the whole platform — every
 * surface that shows a product icon (duel cards, leaderboard, search,
 * sponsors, and anything future) goes through ProductAvatar, which reads
 * whatever URL landed in `products.logo_url` / `sponsorships.logo_url`;
 * this module is the only thing that ever *produces* that URL. See
 * resolveAndStoreProductFavicon / resolveAndStoreExternalFavicon below.
 */

function logFavicon(
  domain: string,
  strategy: string,
  url: string | null,
  status: number | null,
  contentType: string | null,
  reason: string,
) {
  // Plain console output (this app has no logging library) in a
  // consistent key=value shape so failed attempts are greppable in
  // server/platform logs: domain, strategy, candidate URL, HTTP status,
  // content type, and the reason — exactly what's needed to diagnose why
  // a given domain's favicon didn't resolve.
  const line = `[favicon] domain=${domain} strategy=${strategy} url=${url ?? "-"} status=${status ?? "-"} content_type=${contentType ?? "-"} reason=${reason}`;
  if (reason === "success") console.info(line);
  else console.warn(line);
}

function hostnameOf(pageUrl: string): string {
  try {
    return new URL(pageUrl).hostname;
  } catch {
    return pageUrl;
  }
}

async function readCappedBytes(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (received < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
  }
  await reader.cancel().catch(() => {});

  const total = Math.min(received, maxBytes);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    const remaining = total - offset;
    if (remaining <= 0) break;
    const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
    out.set(slice, offset);
    offset += slice.length;
  }
  return out;
}

function resolveHref(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

// Minimal, dependency-free attribute parser for a single `<link ...>` tag
// — good enough for the handful of attributes (rel/href/sizes) favicon
// discovery needs, without pulling in a full HTML parser.
function parseTagAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(tag))) {
    attrs[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? "";
  }
  return attrs;
}

interface IconLink {
  rel: string;
  href: string;
  sizes?: string;
}

function headScope(html: string): string {
  const headEnd = html.toLowerCase().indexOf("</head>");
  return headEnd > -1 ? html.slice(0, headEnd) : html;
}

/** Every `<link rel="...icon...">` in <head> — matches "icon", "shortcut
 * icon", "apple-touch-icon", "apple-touch-icon-precomposed", "mask-icon". */
function extractIconLinks(html: string): IconLink[] {
  const scope = headScope(html);
  const links: IconLink[] = [];
  const linkTagRe = /<link\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkTagRe.exec(scope))) {
    const attrs = parseTagAttrs(m[0]);
    const rel = (attrs.rel ?? "").toLowerCase();
    if (!attrs.href || !rel.includes("icon")) continue;
    links.push({ rel, href: attrs.href, sizes: attrs.sizes });
  }
  return links;
}

function extractManifestHref(html: string): string | null {
  const scope = headScope(html);
  const m = scope.match(/<link\b[^>]*rel=["']?manifest["']?[^>]*>/i);
  if (!m) return null;
  return parseTagAttrs(m[0]).href || null;
}

function sizeScore(sizes: string | undefined): number {
  if (!sizes) return 48 * 48; // unknown — assume a modest, usable size
  if (sizes.toLowerCase() === "any") return Number.MAX_SAFE_INTEGER; // scalable (SVG)
  const m = sizes.match(/(\d+)x(\d+)/i);
  if (!m) return 48 * 48;
  return parseInt(m[1], 10) * parseInt(m[2], 10);
}

function relRank(rel: string): number {
  if (rel.includes("apple-touch-icon-precomposed")) return 1;
  if (rel.includes("apple-touch-icon")) return 2;
  if (rel.includes("mask-icon")) return 0; // usually a monochrome outline, last resort among links
  return 3; // "icon" / "shortcut icon" — the most broadly-representative choice
}

/** Regular icon/shortcut-icon links first (largest declared size within
 * that group), then apple-touch-icon, mask-icon last. */
function rankIconLinks(links: IconLink[]): IconLink[] {
  return [...links].sort((a, b) => {
    const relDiff = relRank(b.rel) - relRank(a.rel);
    if (relDiff !== 0) return relDiff;
    return sizeScore(b.sizes) - sizeScore(a.sizes);
  });
}

async function fetchManifestIconUrls(manifestUrl: string): Promise<string[]> {
  try {
    const res = await safeFetch(manifestUrl, { headers: { Accept: "application/json,text/plain,*/*" } });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return [];
    }
    const bytes = await readCappedBytes(res, MAX_MANIFEST_BYTES);
    const json = JSON.parse(Buffer.from(bytes).toString("utf8")) as { icons?: { src?: string; sizes?: string }[] };
    const icons = Array.isArray(json.icons) ? json.icons : [];
    return icons
      .filter((i): i is { src: string; sizes?: string } => typeof i.src === "string" && i.src.length > 0)
      .sort((a, b) => sizeScore(b.sizes) - sizeScore(a.sizes))
      .map((i) => resolveHref(i.src, manifestUrl))
      .filter((u): u is string => !!u);
  } catch {
    return [];
  }
}

async function fetchPageHtml(pageUrl: string): Promise<string | null> {
  try {
    const res = await safeFetch(pageUrl, { headers: { Accept: "text/html" } });
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.includes("html")) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    const bytes = await readCappedBytes(res, MAX_DISCOVERY_HTML_BYTES);
    return Buffer.from(bytes).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Sniffs the actual file format from its first bytes rather than trusting
 * a declared Content-Type — servers misreport this often enough (or serve
 * an HTML error page with a 200 status) that skipping the check would let
 * garbage through as a "successful" favicon. Returns the *normalized*
 * content type to store, or null if the bytes aren't a supported image.
 */
function sniffImageType(bytes: Uint8Array, declaredContentType: string): string | null {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x00 && (bytes[2] === 0x01 || bytes[2] === 0x02) && bytes[3] === 0x00) {
    return "image/x-icon";
  }
  // SVG is text, not a magic-byte format — only trust it if the body
  // actually contains an <svg> element, regardless of what Content-Type
  // (or lack thereof) the server declared — but a longer XML prolog/DOCTYPE
  // before the actual <svg> element could push it past a short byte
  // window, so also trust an explicit `image/svg+xml` declaration as long
  // as the body isn't obviously an HTML error page.
  const head = Buffer.from(bytes.subarray(0, 512)).toString("utf8").trimStart().toLowerCase();
  if (head.includes("<svg")) return "image/svg+xml";
  const declared = declaredContentType.split(";")[0].trim().toLowerCase();
  if (declared === "image/svg+xml" && !head.startsWith("<!doctype html") && !head.startsWith("<html")) {
    return "image/svg+xml";
  }
  return null;
}

function extensionFor(contentType: string): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    case "image/x-icon":
      return "ico";
    default:
      return "bin";
  }
}

interface FaviconCandidate {
  url: string;
  strategy: string;
}

export interface DiscoveredFavicon {
  bytes: Uint8Array;
  contentType: string;
  sourceUrl: string;
  strategy: string;
}

/**
 * Multi-strategy favicon discovery, tried in priority order until one
 * validates:
 *   1. <link rel="icon"> / "shortcut icon" (largest declared size first)
 *   2. <link rel="apple-touch-icon"[-precomposed]>
 *   3. Web app manifest `icons[]` (via <link rel="manifest">)
 *   4. /favicon.ico (last resort — many modern sites, including this app's
 *      own thearena.lol, don't serve one at all)
 *
 * Every candidate is fetched server-side (never the browser) through the
 * same SSRF-guarded fetch used elsewhere, following redirects and
 * transparently handling bare-domain/www and http/https variations (the
 * redirect just gets followed). Response bytes are sniffed to confirm
 * they're a real, supported image (ICO/PNG/JPEG/GIF/WebP/SVG) — a
 * mislabeled Content-Type or an HTML error page never gets accepted.
 *
 * Returns null if every strategy genuinely fails. Callers must treat that
 * as "not resolved yet," never a permanent failure to cache — see
 * backfillMissingProductFavicons in lib/arena.ts, which retries any
 * product still missing a logo_url on every poll.
 */
export async function discoverFavicon(pageUrl: string): Promise<DiscoveredFavicon | null> {
  const domain = hostnameOf(pageUrl);
  const candidates: FaviconCandidate[] = [];
  const html = await fetchPageHtml(pageUrl);

  if (html) {
    for (const link of rankIconLinks(extractIconLinks(html))) {
      const abs = resolveHref(link.href, pageUrl);
      if (abs) candidates.push({ url: abs, strategy: `link[rel=${link.rel}]` });
    }
    const manifestHref = extractManifestHref(html);
    if (manifestHref) {
      const manifestUrl = resolveHref(manifestHref, pageUrl);
      if (manifestUrl) {
        for (const iconUrl of await fetchManifestIconUrls(manifestUrl)) {
          candidates.push({ url: iconUrl, strategy: "manifest" });
        }
      }
    }
  } else {
    logFavicon(domain, "page-fetch", pageUrl, null, null, "could not fetch or parse page HTML");
  }

  const faviconIco = resolveHref("/favicon.ico", pageUrl);
  if (faviconIco) candidates.push({ url: faviconIco, strategy: "favicon.ico" });

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);

    try {
      const res = await safeFetch(candidate.url, { headers: { Accept: "image/*,*/*" } });
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        logFavicon(domain, candidate.strategy, candidate.url, res.status, contentType, "non-2xx response");
        await res.body?.cancel().catch(() => {});
        continue;
      }
      const bytes = await readCappedBytes(res, MAX_IMAGE_BYTES);
      const sniffed = sniffImageType(bytes, contentType);
      if (!sniffed) {
        logFavicon(domain, candidate.strategy, candidate.url, res.status, contentType, "response body is not a recognized image format");
        continue;
      }
      logFavicon(domain, candidate.strategy, candidate.url, res.status, contentType, "success");
      return { bytes, contentType: sniffed, sourceUrl: candidate.url, strategy: candidate.strategy };
    } catch (err) {
      logFavicon(domain, candidate.strategy, candidate.url, null, null, err instanceof Error ? err.message : "fetch failed");
    }
  }

  logFavicon(domain, "all", null, null, null, "every discovery strategy failed");
  return null;
}

let faviconBucketEnsured = false;

/** Self-provisions the storage bucket on first use — no manual dashboard
 * step required. Cheap to call repeatedly; only actually hits the API
 * until the first success (or "already exists") per warm server instance. */
async function ensureFaviconBucket(admin: AdminClient): Promise<void> {
  if (faviconBucketEnsured) return;
  const { error } = await admin.storage.createBucket(FAVICON_BUCKET, {
    public: true,
    fileSizeLimit: MAX_IMAGE_BYTES,
  });
  if (!error || /already exists/i.test(error.message)) {
    faviconBucketEnsured = true;
  } else {
    console.warn(`[favicon] could not ensure storage bucket: ${error.message}`);
  }
}

/**
 * Uploads already-discovered/validated favicon bytes to our own storage
 * and returns its public URL — a stable copy we control, decoupled from
 * the source site's uptime, CORS policy, or hotlink protection, and never
 * re-fetched once stored. `key` has no extension; one is appended from the
 * actual sniffed content type.
 */
export async function storeFaviconBytes(
  admin: AdminClient,
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string | null> {
  await ensureFaviconBucket(admin);
  const path = `${key}.${extensionFor(contentType)}`;
  const { error } = await admin.storage.from(FAVICON_BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
    cacheControl: "86400",
  });
  if (error) {
    console.warn(`[favicon] storage upload failed path=${path} reason=${error.message}`);
    return null;
  }
  const { data } = admin.storage.from(FAVICON_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Full pipeline for an Arena product: discover, validate, store our own
 * copy keyed by product id. Returns null on genuine failure — never a
 * sentinel value, so the caller leaves `logo_url` unset and it's retried
 * later rather than permanently treated as "no favicon." */
export async function resolveAndStoreProductFavicon(
  admin: AdminClient,
  productId: string,
  pageUrl: string,
): Promise<string | null> {
  const found = await discoverFavicon(pageUrl);
  if (!found) return null;
  return storeFaviconBytes(admin, `products/${productId}`, found.bytes, found.contentType);
}

/** Same pipeline for an external (non-Arena) sponsorship, keyed by a
 * stable hash of the URL so sponsoring the same external product twice
 * reuses one stored file instead of uploading a duplicate. */
export async function resolveAndStoreExternalFavicon(admin: AdminClient, pageUrl: string): Promise<string | null> {
  const found = await discoverFavicon(pageUrl);
  if (!found) return null;
  const key = crypto.createHash("sha256").update(pageUrl).digest("hex").slice(0, 24);
  return storeFaviconBytes(admin, `external/${key}`, found.bytes, found.contentType);
}
