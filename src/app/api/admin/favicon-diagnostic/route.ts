import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { discoverFavicon } from "@/lib/favicon-service";
import { normalizeUrl } from "@/lib/url";

/**
 * Founder-only diagnostic for a single domain's favicon discovery — the
 * same discoverFavicon() pipeline every product/sponsorship uses, just
 * returning the full step-by-step trace instead of only the final result,
 * so a problematic domain can be diagnosed in seconds instead of guessed
 * at. Never exposes server internals beyond what's already public about
 * the target site (its own HTTP responses).
 */
export async function POST(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { url } = (body ?? {}) as Record<string, unknown>;
  if (typeof url !== "string") {
    return NextResponse.json({ error: "Missing URL." }, { status: 400 });
  }
  const normalized = normalizeUrl(url);
  if (!normalized) {
    return NextResponse.json({ error: "Please enter a valid URL." }, { status: 400 });
  }

  const outcome = await discoverFavicon(normalized);
  return NextResponse.json({
    url: normalized,
    status: outcome.status,
    favicon: outcome.favicon
      ? { sourceUrl: outcome.favicon.sourceUrl, strategy: outcome.favicon.strategy, contentType: outcome.favicon.contentType, bytes: outcome.favicon.bytes.length }
      : null,
    attempts: outcome.attempts,
  });
}
