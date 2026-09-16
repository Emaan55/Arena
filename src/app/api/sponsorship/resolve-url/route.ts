import { NextRequest, NextResponse } from "next/server";
import { fetchUrlMetadata } from "@/lib/url-metadata";
import { normalizeUrl } from "@/lib/url";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/fingerprint";

/**
 * Best-effort auto-detect for the "Add External Product" sponsor flow:
 * given a URL, returns a guessed product name (page <title>) and favicon.
 * Never required — the sponsor can always type the name by hand — so
 * failures degrade to nulls rather than errors.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`resolve-url:${ip}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
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

  const meta = await fetchUrlMetadata(normalized);
  return NextResponse.json({ url: normalized, name: meta.name, logoUrl: meta.logoUrl });
}
