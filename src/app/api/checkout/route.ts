import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createCheckout, getVariantId } from "@/lib/lemonsqueezy";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/fingerprint";
import type { PaymentType } from "@/types/database";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`checkout:${ip}`, 10, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { type, productId, matchId } = (body ?? {}) as Record<string, unknown>;

  if (type !== "boost" && type !== "revive" && type !== "defend") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }
  if (typeof productId !== "string") {
    return NextResponse.json({ error: "Invalid product." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data: product } = await admin.from("products").select("*").eq("id", productId).maybeSingle();
  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  // Validate the action is currently legal for this product's state. The
  // webhook re-validates match membership at payment time too — this is
  // just an early, friendlier check before sending the user to checkout.
  if (type === "boost") {
    if (typeof matchId !== "string") {
      return NextResponse.json({ error: "Missing duel to boost." }, { status: 400 });
    }
    const { data: match } = await admin
      .from("matches")
      .select("id, product_a_id, product_b_id")
      .eq("id", matchId)
      .eq("status", "active")
      .maybeSingle();
    if (!match || (match.product_a_id !== productId && match.product_b_id !== productId)) {
      return NextResponse.json({ error: "This duel is no longer active." }, { status: 400 });
    }
  } else if (type === "revive") {
    if (product.status !== "eliminated") {
      return NextResponse.json({ error: "This product isn't eliminated." }, { status: 400 });
    }
  } else if (type === "defend") {
    if (product.status !== "champion" || product.is_defending) {
      return NextResponse.json({ error: "This product can't defend the throne right now." }, { status: 400 });
    }
  }

  let variantId: string;
  try {
    variantId = getVariantId(type as Exclude<PaymentType, "sponsor">);
  } catch {
    return NextResponse.json({ error: "Payments aren't configured yet." }, { status: 503 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const custom: Record<string, string> = { type, product_id: productId };
  if (typeof matchId === "string") custom.match_id = matchId;

  try {
    const url = await createCheckout({
      variantId,
      custom,
      redirectUrl: `${siteUrl}/?paid=${type}`,
    });
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 502 });
  }
}
