import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
import { createCheckout, getGetListedVariantId } from "@/lib/lemonsqueezy";
import { isGetListedPackageKey } from "@/lib/get-listed/packages";
import { isGetListedOrdersSchemaReady, findOrCreatePendingOrder } from "@/lib/get-listed/orders";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/fingerprint";
import { logSecurityEvent } from "@/lib/security-log";

/**
 * The only entry point into Get Listed payments. The browser sends
 * nothing but `campaignId` — every other input (owner, package, base
 * price, discount, final price, which LemonSqueezy variant) is resolved
 * here server-side from the campaign row and never trusted from the
 * client. See lib/get-listed/pricing.ts for the actual calculation and
 * lib/get-listed/orders.ts for how the pending order is created/reused.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`get-listed-checkout:${ip}`, 10, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const supabaseAuth = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }

  if (!rateLimit(`get-listed-checkout:user:${user.id}`, 10, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { campaignId } = (body ?? {}) as Record<string, unknown>;
  if (typeof campaignId !== "string" || !campaignId) {
    return NextResponse.json({ error: "Invalid campaign." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  if (!(await isGetListedOrdersSchemaReady(admin))) {
    return NextResponse.json({ error: "Payments aren't fully set up yet. Please try again shortly." }, { status: 503 });
  }

  // Ownership enforced in the same query — a campaign that exists but
  // belongs to someone else looks identical to one that doesn't exist.
  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, owner_id, package_key, status, discount_award_id, discount_percent")
    .eq("id", campaignId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  if (!isGetListedPackageKey(campaign.package_key)) {
    return NextResponse.json({ error: "Invalid package on this campaign." }, { status: 400 });
  }
  if (campaign.status !== "awaiting_payment") {
    return NextResponse.json({ error: "This campaign isn't awaiting payment." }, { status: 409 });
  }

  // Re-verify the attached discount is still genuinely usable at the
  // moment of checkout, not just at campaign-creation time — an award
  // that expired while the campaign sat unpaid should not still discount
  // the price indefinitely.
  let discountPercent = 0;
  if (campaign.discount_award_id) {
    const { data: award } = await admin
      .from("discount_awards")
      .select("id, status, expires_at, discount_percent")
      .eq("id", campaign.discount_award_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!award || award.status !== "available" || new Date(award.expires_at).getTime() <= Date.now()) {
      logSecurityEvent("get_listed_checkout_discount_expired", { ip, userId: user.id, campaignId });
      return NextResponse.json(
        { error: "Your discount has expired. Play Discount Drop again to earn a new discount." },
        { status: 409 },
      );
    }
    discountPercent = award.discount_percent;
  }

  const order = await findOrCreatePendingOrder(admin, {
    campaignId: campaign.id,
    ownerId: user.id,
    packageKey: campaign.package_key,
    discountPercent,
  }).catch(() => null);

  if (!order) {
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }

  let variantId: string;
  try {
    variantId = getGetListedVariantId(campaign.package_key);
  } catch {
    return NextResponse.json({ error: "Get Listed payments aren't configured yet." }, { status: 503 });
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

  try {
    const url = await createCheckout({
      variantId,
      custom: {
        type: "get_listed",
        order_id: order.id,
        campaign_id: campaign.id,
      },
      redirectUrl: `${siteUrl}/get-listed/campaigns/${campaign.id}?checkout=return`,
      customPriceCents: order.final_amount,
    });
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 502 });
  }
}
