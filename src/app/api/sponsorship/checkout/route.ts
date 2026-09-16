import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createCheckout, getSponsorVariantId } from "@/lib/lemonsqueezy";
import { hashEditToken } from "@/lib/edit-token";
import { isSponsorDuration } from "@/lib/sponsorship-constants";
import { isSponsorshipSchemaReady } from "@/lib/sponsorship";
import { resolveFaviconUrl } from "@/lib/url-metadata";
import { normalizeUrl } from "@/lib/url";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/fingerprint";
import { CATEGORIES, type Category } from "@/types/database";

const NAME_MAX = 80;
const DESCRIPTION_MAX = 140;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`sponsor-checkout:${ip}`, 10, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const record = (body ?? {}) as Record<string, unknown>;
  const durationDays = Number(record.durationDays);
  if (!isSponsorDuration(durationDays)) {
    return NextResponse.json({ error: "Invalid sponsorship duration." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  if (!(await isSponsorshipSchemaReady(admin))) {
    return NextResponse.json({ error: "Sponsorships aren't fully set up yet. Please try again shortly." }, { status: 503 });
  }

  const isExternal = record.isExternal === "1" || record.isExternal === true;

  // custom_data values must all be strings — LemonSqueezy echoes them back
  // verbatim on the webhook, which is how a confirmed payment gets tied
  // back to what it paid for (see src/lib/lemonsqueezy.ts / the webhook
  // handler).
  let custom: Record<string, string>;
  let dedupeFilter: { column: "product_id" | "external_url"; value: string };

  if (isExternal) {
    const name = typeof record.externalName === "string" ? record.externalName.trim() : "";
    const category = typeof record.externalCategory === "string" ? record.externalCategory : "";
    const description = typeof record.externalDescription === "string" ? record.externalDescription.trim() : "";
    const rawUrl = typeof record.externalUrl === "string" ? record.externalUrl : "";

    if (!name || name.length > NAME_MAX) {
      return NextResponse.json({ error: `Product name is required (max ${NAME_MAX} characters).` }, { status: 400 });
    }
    if (!CATEGORIES.includes(category as Category)) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    }
    if (!description || description.length > DESCRIPTION_MAX) {
      return NextResponse.json(
        { error: `A short description is required (max ${DESCRIPTION_MAX} characters).` },
        { status: 400 },
      );
    }
    const normalizedUrl = normalizeUrl(rawUrl);
    if (!normalizedUrl) {
      return NextResponse.json({ error: "Please enter a valid URL." }, { status: 400 });
    }

    // Resolved server-side (never trusting a client-supplied logo URL) and
    // stored once the sponsorship is created — see lib/url-metadata.ts.
    const logoUrl = await resolveFaviconUrl(normalizedUrl);

    custom = {
      type: "sponsor",
      duration_days: String(durationDays),
      is_external: "1",
      external_name: name,
      external_url: normalizedUrl,
      external_category: category,
      external_description: description,
      logo_url: logoUrl ?? "",
    };
    dedupeFilter = { column: "external_url", value: normalizedUrl };
  } else {
    const productId = record.productId;
    const editToken = record.editToken;
    if (typeof productId !== "string") {
      return NextResponse.json({ error: "Invalid product." }, { status: 400 });
    }
    if (typeof editToken !== "string" || !editToken) {
      return NextResponse.json({ error: "Missing edit token." }, { status: 400 });
    }

    const { data: product } = await admin.from("products").select("*").eq("id", productId).maybeSingle();
    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }
    // Ownership only, via the same edit-token hash used to gate PATCH
    // /api/products/[id] — deliberately NOT gated by the 24h edit window,
    // since that window exists to stop Battle Pitch rewrites mid-duel, an
    // unrelated concern to who's allowed to sponsor this product.
    if (!product.edit_token_hash || product.edit_token_hash !== hashEditToken(editToken)) {
      return NextResponse.json({ error: "Could not verify you own this product." }, { status: 403 });
    }

    const logoUrl = await resolveFaviconUrl(product.url);

    custom = {
      type: "sponsor",
      duration_days: String(durationDays),
      product_id: productId,
      logo_url: logoUrl ?? "",
    };
    dedupeFilter = { column: "product_id", value: productId };
  }

  const { data: existing } = await admin
    .from("sponsorships")
    .select("id")
    .eq(dedupeFilter.column, dedupeFilter.value)
    .in("status", ["queued", "active"])
    .limit(1)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "This product is already sponsored or in the queue." }, { status: 409 });
  }

  let variantId: string;
  try {
    variantId = getSponsorVariantId(durationDays);
  } catch {
    return NextResponse.json({ error: "Sponsorship payments aren't configured yet." }, { status: 503 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  try {
    const url = await createCheckout({
      variantId,
      custom,
      redirectUrl: `${siteUrl}/?paid=sponsor`,
    });
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 502 });
  }
}
