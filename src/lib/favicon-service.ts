import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, LogoStatus } from "@/types/database";
import { safeFetch, type RedirectCounter } from "./safe-fetch";

type AdminClient = SupabaseClient<Database>;

const MAX_IMAGE_BYTES = 1_500_000; // 1.5MB — generous for a favicon, still bounded
const MAX_DISCOVERY_HTML_BYTES = 300_000;
const MAX_MANIFEST_BYTES = 200_000;
const MIN_ICON_DIMENSION = 8; // below this, treat as broken/placeholder rather than a real icon
const FAVICON_BUCKET = "favicons";

/**
 * The single reusable favicon engine for the whole platform — every
 * surface that shows a product icon (duel cards, leaderboard, search,
 * sponsors, activity feed, and anything future) goes through
 * ProductAvatar, which reads whatever URL landed in `products.logo_url` /
 * `sponsorships.logo_url`; this module is the only thing that ever
 * *produces* that URL. See resolveAndStoreProductFavicon /
 * resolveAndStoreExternalFavicon below.
 */

interface AttemptRecord {
  strategy: string;
  url: string;
  status: number | null;
  contentType: string | null;
  redirects: number;
  reason: string;
  /** Worth retrying soon (network blip, rate limit, 5xx) vs. a clean "no"
   * (404, wrong content, too small) that's still retried, just not urgently. */
  retryable: boolean;
}

function logAttempt(domain: string, a: AttemptRecord) {
  const line =
    `[favicon] domain=${domain} strategy=${a.strategy} url=${a.url} status=${a.status ?? "-"} ` +
    `content_type=${a.contentType ?? "-"} redirects=${a.redirects} reason=${a.reason} time=${new Date().toISOString()}`;
  if (a.reason === "success") console.info(line);
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

/** Resolves relative/absolute/protocol-relative hrefs against the page's
 * (or manifest's) own URL, and filters out anything that was never going
 * to be a fetchable candidate in the first place — `data:` URIs are a
 * deliberate "no favicon" convention some minimal sites use (example.com
 * among them), `javascript:`/`blob:`/etc. can't be fetched server-side at
 * all. Skipping these up front means they're never attempted, logged, or
 * misclassified as a failure — they just aren't candidates. */
function resolveHref(href: string, base: string): string | null {
  try {
    const resolved = new URL(href, base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    return resolved.toString();
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

/** Every `<link rel="...icon...">` in <head> — matches "icon", "Icon",
 * "shortcut icon", "shortcut Icon", "apple-touch-icon",
 * "apple-touch-icon-precomposed", "mask-icon", and non-standard-but-real
 * variants like GitHub's "fluid-icon", since all of them contain "icon"
 * case-insensitively. */
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
  return 3; // "icon" / "shortcut icon" (and lookalikes) — the most broadly-representative choice
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

interface ManifestIcon {
  src: string;
  sizes?: string;
  purpose?: string;
}

async function fetchManifestIconUrls(manifestUrl: string): Promise<string[]> {
  try {
    const res = await safeFetch(manifestUrl, { headers: { Accept: "application/json,text/plain,*/*" } });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return [];
    }
    const bytes = await readCappedBytes(res, MAX_MANIFEST_BYTES);
    const json = JSON.parse(Buffer.from(bytes).toString("utf8")) as { icons?: ManifestIcon[] };
    const icons = Array.isArray(json.icons) ? json.icons : [];
    return icons
      .filter((i): i is ManifestIcon => typeof i.src === "string" && i.src.length > 0)
      // "maskable"-only purpose icons are meant to be padded/cropped by the
      // OS, not shown as-is — deprioritize them behind any/monochrome/none.
      .sort((a, b) => {
        const purposeDiff = (a.purpose === "maskable" ? 1 : 0) - (b.purpose === "maskable" ? 1 : 0);
        if (purposeDiff !== 0) return purposeDiff;
        return sizeScore(b.sizes) - sizeScore(a.sizes);
      })
      .map((i) => resolveHref(i.src, manifestUrl))
      .filter((u): u is string => !!u);
  } catch {
    return [];
  }
}

async function fetchPageHtml(pageUrl: string, counter: RedirectCounter): Promise<{ html: string | null; attempt: AttemptRecord }> {
  try {
    const res = await safeFetch(pageUrl, { headers: { Accept: "text/html" } }, undefined, counter);
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.includes("html")) {
      await res.body?.cancel().catch(() => {});
      return {
        html: null,
        attempt: {
          strategy: "page-fetch",
          url: pageUrl,
          status: res.status,
          contentType,
          redirects: counter.count,
          reason: res.ok ? "page response is not HTML" : "non-2xx response fetching page",
          retryable: !res.ok && isRetryableStatus(res.status),
        },
      };
    }
    const bytes = await readCappedBytes(res, MAX_DISCOVERY_HTML_BYTES);
    return {
      html: Buffer.from(bytes).toString("utf8"),
      attempt: { strategy: "page-fetch", url: pageUrl, status: res.status, contentType, redirects: counter.count, reason: "success", retryable: false },
    };
  } catch (err) {
    return {
      html: null,
      attempt: {
        strategy: "page-fetch",
        url: pageUrl,
        status: null,
        contentType: null,
        redirects: counter.count,
        reason: describeError(err),
        retryable: !isPermanentRejection(err),
      },
    };
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 403 || status === 408 || status === 429 || status >= 500;
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return "request timed out";
    return err.message;
  }
  return "fetch failed";
}

// assertSafeUrl (lib/safe-fetch.ts) throws these exact messages for a URL
// that will *never* become fetchable — wrong scheme, localhost, or a
// private/link-local IP. That's a permanent "no" for this candidate, not
// a transient network problem, and must not count toward classifying the
// overall result as "temporary_failure" (which is supposed to mean "worth
// retrying soon").
function isPermanentRejection(err: unknown): boolean {
  return err instanceof Error && (err.message === "Only http/https URLs are allowed." || err.message === "URL not allowed.");
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
  // actually contains an <svg> element (checked over a larger window than
  // other formats, since a DOCTYPE/XML prolog can push it back a bit), or
  // the server declared it explicitly and the body isn't an HTML page.
  const head = Buffer.from(bytes.subarray(0, 512)).toString("utf8").trimStart().toLowerCase();
  if (head.includes("<svg")) return "image/svg+xml";
  const declared = declaredContentType.split(";")[0].trim().toLowerCase();
  if (declared === "image/svg+xml" && !head.startsWith("<!doctype html") && !head.startsWith("<html")) {
    return "image/svg+xml";
  }
  return null;
}

/**
 * Best-effort pixel dimensions from the file's own header — no image
 * library needed for the formats favicons actually come in. Returns null
 * when we can't determine it (e.g. an unusual WebP chunk layout); callers
 * treat "unknown" as acceptable rather than rejecting it, since this is a
 * quality gate on top of format validation, not a replacement for it.
 */
function readImageDimensions(bytes: Uint8Array, contentType: string): { width: number; height: number } | null {
  try {
    if (contentType === "image/png" && bytes.length >= 24) {
      return { width: readU32BE(bytes, 16), height: readU32BE(bytes, 20) };
    }
    if (contentType === "image/gif" && bytes.length >= 10) {
      return { width: readU16LE(bytes, 6), height: readU16LE(bytes, 8) };
    }
    if (contentType === "image/x-icon" && bytes.length >= 22) {
      // ICO directory: 6-byte header, then 16-byte entries; width/height
      // are single bytes at offsets 6/7 of the first entry, 0 means 256.
      const w = bytes[6] || 256;
      const h = bytes[7] || 256;
      return { width: w, height: h };
    }
    if (contentType === "image/jpeg") {
      return readJpegDimensions(bytes);
    }
    if (contentType === "image/svg+xml") {
      const text = Buffer.from(bytes.subarray(0, 1024)).toString("utf8");
      const viewBox = text.match(/viewBox=["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/i);
      if (viewBox) return { width: parseFloat(viewBox[1]), height: parseFloat(viewBox[2]) };
      const w = text.match(/\bwidth=["']?(\d+(?:\.\d+)?)/i);
      const h = text.match(/\bheight=["']?(\d+(?:\.\d+)?)/i);
      if (w && h) return { width: parseFloat(w[1]), height: parseFloat(h[1]) };
      return null; // scalable with no declared size — treat as acceptable, not rejected
    }
  } catch {
    return null;
  }
  return null; // WebP and anything else: no cheap dimension read, treat as acceptable
}

function readU32BE(b: Uint8Array, offset: number): number {
  return (b[offset] << 24) | (b[offset + 1] << 16) | (b[offset + 2] << 8) | b[offset + 3];
}
function readU16LE(b: Uint8Array, offset: number): number {
  return b[offset] | (b[offset + 1] << 8);
}
function readU16BE(b: Uint8Array, offset: number): number {
  return (b[offset] << 8) | b[offset + 1];
}

function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2; // skip SOI marker (0xFFD8)
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    // SOF0-SOF15 markers (excluding DHT/JPG/DAC) carry the frame dimensions.
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    const segmentLength = readU16BE(bytes, offset + 2);
    if (isSof) {
      return { height: readU16BE(bytes, offset + 5), width: readU16BE(bytes, offset + 7) };
    }
    offset += 2 + segmentLength;
  }
  return null;
}

/** Rejects an image that's tiny or absurdly non-square — likely a broken
 * placeholder or a mis-tagged banner rather than a real icon. Unknown
 * dimensions are never rejected on this basis alone. */
function isAcceptableIcon(dims: { width: number; height: number } | null): boolean {
  if (!dims) return true;
  if (dims.width < MIN_ICON_DIMENSION || dims.height < MIN_ICON_DIMENSION) return false;
  const ratio = dims.width / dims.height;
  return ratio >= 0.4 && ratio <= 2.5;
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

export interface FaviconOutcome {
  favicon: DiscoveredFavicon | null;
  status: LogoStatus;
  /** Full step-by-step trace — every candidate tried and why it did or
   * didn't work. Used by the admin favicon-diagnostic tool; also what
   * backs the [favicon] log lines. */
  attempts: AttemptRecord[];
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
 * Every candidate is fetched server-side through the same SSRF-guarded
 * fetch used elsewhere, following redirects and transparently handling
 * bare-domain/www and http/https variations (the redirect just gets
 * followed). Response bytes are sniffed to confirm they're a real,
 * supported image (ICO/PNG/JPEG/GIF/WebP/SVG) and checked for sane
 * dimensions — a mislabeled Content-Type, an HTML error page, or a
 * 1x1 placeholder never gets accepted.
 *
 * Never throws. The result always has a `status`: "success" with a
 * favicon, "temporary_failure" if any attempt hit a retryable error
 * (network/DNS/timeout, 429/403/5xx) and nothing else validated, or
 * "not_found" if every attempt was a clean negative (404, wrong content).
 * Both failure statuses are meant to be retried later — see
 * backfillMissingProductFavicons in lib/arena.ts — never cached as
 * permanent.
 */
export async function discoverFavicon(pageUrl: string): Promise<FaviconOutcome> {
  const domain = hostnameOf(pageUrl);
  const attempts: AttemptRecord[] = [];
  const candidates: FaviconCandidate[] = [];

  const pageCounter: RedirectCounter = { count: 0 };
  const { html, attempt: pageAttempt } = await fetchPageHtml(pageUrl, pageCounter);
  attempts.push(pageAttempt);
  logAttempt(domain, pageAttempt);

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
  }

  const faviconIco = resolveHref("/favicon.ico", pageUrl);
  if (faviconIco) candidates.push({ url: faviconIco, strategy: "favicon.ico" });

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);

    const counter: RedirectCounter = { count: 0 };
    try {
      const res = await safeFetch(candidate.url, { headers: { Accept: "image/*,*/*" } }, undefined, counter);
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        const record: AttemptRecord = {
          strategy: candidate.strategy,
          url: candidate.url,
          status: res.status,
          contentType,
          redirects: counter.count,
          reason: "non-2xx response",
          retryable: isRetryableStatus(res.status),
        };
        attempts.push(record);
        logAttempt(domain, record);
        await res.body?.cancel().catch(() => {});
        continue;
      }

      const bytes = await readCappedBytes(res, MAX_IMAGE_BYTES);
      const sniffed = sniffImageType(bytes, contentType);
      if (!sniffed) {
        const record: AttemptRecord = {
          strategy: candidate.strategy,
          url: candidate.url,
          status: res.status,
          contentType,
          redirects: counter.count,
          reason: "response body is not a recognized image format",
          retryable: false,
        };
        attempts.push(record);
        logAttempt(domain, record);
        continue;
      }

      const dims = readImageDimensions(bytes, sniffed);
      if (!isAcceptableIcon(dims)) {
        const record: AttemptRecord = {
          strategy: candidate.strategy,
          url: candidate.url,
          status: res.status,
          contentType,
          redirects: counter.count,
          reason: `image too small or wrong aspect ratio${dims ? ` (${dims.width}x${dims.height})` : ""}`,
          retryable: false,
        };
        attempts.push(record);
        logAttempt(domain, record);
        continue;
      }

      const record: AttemptRecord = {
        strategy: candidate.strategy,
        url: candidate.url,
        status: res.status,
        contentType,
        redirects: counter.count,
        reason: "success",
        retryable: false,
      };
      attempts.push(record);
      logAttempt(domain, record);
      return {
        favicon: { bytes, contentType: sniffed, sourceUrl: candidate.url, strategy: candidate.strategy },
        status: "success",
        attempts,
      };
    } catch (err) {
      const record: AttemptRecord = {
        strategy: candidate.strategy,
        url: candidate.url,
        status: null,
        contentType: null,
        redirects: counter.count,
        reason: describeError(err),
        retryable: !isPermanentRejection(err),
      };
      attempts.push(record);
      logAttempt(domain, record);
    }
  }

  const summary: AttemptRecord = {
    strategy: "all",
    url: pageUrl,
    status: null,
    contentType: null,
    redirects: 0,
    reason: candidates.length === 0 ? "no candidates found on the page" : "every discovery strategy failed",
    retryable: false,
  };
  logAttempt(domain, summary);

  const anyRetryable = attempts.some((a) => a.retryable);
  return { favicon: null, status: anyRetryable ? "temporary_failure" : "not_found", attempts: [...attempts, summary] };
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

export interface ProductFaviconResult {
  status: LogoStatus;
  logoUrl: string | null;
  source: string | null;
  attempts: AttemptRecord[];
}

/** Full pipeline for an Arena product: discover, validate, store our own
 * copy keyed by product id. Always returns a status — see
 * backfillMissingProductFavicons for how callers persist and schedule the
 * next retry from it. */
export async function resolveAndStoreProductFavicon(admin: AdminClient, productId: string, pageUrl: string): Promise<ProductFaviconResult> {
  const outcome = await discoverFavicon(pageUrl);
  if (!outcome.favicon) {
    return { status: outcome.status, logoUrl: null, source: null, attempts: outcome.attempts };
  }
  const logoUrl = await storeFaviconBytes(admin, `products/${productId}`, outcome.favicon.bytes, outcome.favicon.contentType);
  if (!logoUrl) {
    return { status: "temporary_failure", logoUrl: null, source: null, attempts: outcome.attempts };
  }
  return { status: "success", logoUrl, source: outcome.favicon.strategy, attempts: outcome.attempts };
}

/** Same discovery pipeline for an external (non-Arena) sponsorship, keyed
 * by a stable hash of the URL so sponsoring the same external product
 * twice reuses one stored file instead of uploading a duplicate.
 * Sponsorships are short-lived and resolved once at creation time, so
 * (unlike products) they don't carry the fuller pending/retry lifecycle —
 * a null return here just means "no favicon for this sponsorship," same
 * as before. */
export async function resolveAndStoreExternalFavicon(admin: AdminClient, pageUrl: string): Promise<string | null> {
  const outcome = await discoverFavicon(pageUrl);
  if (!outcome.favicon) return null;
  const key = crypto.createHash("sha256").update(pageUrl).digest("hex").slice(0, 24);
  return storeFaviconBytes(admin, `external/${key}`, outcome.favicon.bytes, outcome.favicon.contentType);
}
