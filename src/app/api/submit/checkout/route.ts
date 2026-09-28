import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createCheckout, getVariantId } from "@/lib/lemonsqueezy";
import { validateProductSubmission } from "@/lib/product-submission";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/fingerprint";

const SUBMIT_PRICE_CENTS = 100;

/**
 * Starts a $1 checkout for the "pay instead of earning it" submission
 * path. The product is never created here — the raw submission fields are
 * validated up front (so a bad submission never even reaches checkout)
 * and then carried through LemonSqueezy's own custom_data, and the actual
 * createArenaProduct() call happens from the webhook once payment is
 * confirmed (see /api/webhooks/lemonsqueezy), the same "pay first, create
 * after webhook confirms" shape Get Listed and sponsorship checkouts
 * already use.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`submit-checkout:${ip}`, 10, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const record = (body ?? {}) as Record<string, unknown>;

  // No honeypot/fill-time check here — paying $1 is itself a much stronger
  // anti-spam gate than either of those.
  const validation = validateProductSubmission(record);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }
  const f = validation.fields;

  const admin = createAdminSupabaseClient();
  const { data: existing } = await admin.from("products").select("id").ilike("url", f.url).limit(1).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "This product has already been submitted to the arena." }, { status: 409 });
  }

  let variantId: string;
  try {
    variantId = getVariantId("submit");
  } catch {
    return NextResponse.json({ error: "Payments aren't configured yet." }, { status: 503 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const custom: Record<string, string> = {
    type: "submit",
    name: f.name,
    url: f.url,
    category: f.category,
    pitch: f.pitch,
    battle_pitch: f.battle_pitch ?? "",
    why_us: f.why_us ?? "",
    differentiators: JSON.stringify(f.differentiators),
    x_handle: f.x_handle ?? "",
  };

  try {
    const url = await createCheckout({
      variantId,
      custom,
      redirectUrl: `${siteUrl}/?paid=submit`,
      customPriceCents: SUBMIT_PRICE_CENTS,
    });
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 502 });
  }
}
