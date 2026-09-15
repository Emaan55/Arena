import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createCheckout, getSponsorVariantId } from "@/lib/lemonsqueezy";
import { hashEditToken } from "@/lib/edit-token";
import { isSponsorDuration } from "@/lib/sponsorship-constants";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/fingerprint";

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

  const { productId, editToken, durationDays } = (body ?? {}) as Record<string, unknown>;

  if (typeof productId !== "string") {
    return NextResponse.json({ error: "Invalid product." }, { status: 400 });
  }
  if (typeof editToken !== "string" || !editToken) {
    return NextResponse.json({ error: "Missing edit token." }, { status: 400 });
  }
  const days = Number(durationDays);
  if (!isSponsorDuration(days)) {
    return NextResponse.json({ error: "Invalid sponsorship duration." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
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

  const { data: existing } = await admin
    .from("sponsorships")
    .select("id")
    .eq("product_id", productId)
    .in("status", ["queued", "active"])
    .limit(1)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "This product is already sponsored or in the queue." }, { status: 409 });
  }

  let variantId: string;
  try {
    variantId = getSponsorVariantId(days);
  } catch {
    return NextResponse.json({ error: "Sponsorship payments aren't configured yet." }, { status: 503 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  try {
    const url = await createCheckout({
      variantId,
      custom: { type: "sponsor", product_id: productId, duration_days: String(days) },
      redirectUrl: `${siteUrl}/?paid=sponsor`,
    });
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 502 });
  }
}
