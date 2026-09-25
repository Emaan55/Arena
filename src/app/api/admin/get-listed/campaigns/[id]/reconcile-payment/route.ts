import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { isGetListedPackageKey } from "@/lib/get-listed/packages";
import { computeGetListedPricing } from "@/lib/get-listed/pricing";
import { isGetListedOrdersSchemaReady } from "@/lib/get-listed/orders";
import { logAdminAction } from "@/lib/get-listed/audit";

const REASON_MAX = 500;
const REFERENCE_MAX = 200;
const ADMIN_NAME_MAX = 80;

/**
 * The manual escape hatch for "payment succeeded externally, but the
 * LemonSqueezy webhook was missed or delayed" — never exposed to
 * customers, and never a way to activate a campaign that hasn't actually
 * been paid for. It reuses the exact same atomic finalize_get_listed_order()
 * function the webhook calls (see migration 0018), so activation and
 * discount redemption follow the identical, idempotent path either way —
 * this is not a second, looser way to flip a campaign to "active".
 *
 * If a pending order already exists for this campaign, it's finalized in
 * place. If none exists at all (payment happened with no checkout ever
 * started through this app), one is created first from the campaign's
 * current package/discount, then immediately finalized.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id: campaignId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const record = (body ?? {}) as Record<string, unknown>;

  const paymentReference = typeof record.paymentReference === "string" ? record.paymentReference.trim() : "";
  const reason = typeof record.reason === "string" ? record.reason.trim() : "";
  const adminName = typeof record.adminName === "string" ? record.adminName.trim() : "";

  if (!paymentReference || paymentReference.length > REFERENCE_MAX) {
    return NextResponse.json({ error: `A payment reference is required (max ${REFERENCE_MAX} characters).` }, { status: 400 });
  }
  if (!reason || reason.length > REASON_MAX) {
    return NextResponse.json({ error: `A reason is required (max ${REASON_MAX} characters).` }, { status: 400 });
  }
  if (adminName.length > ADMIN_NAME_MAX) {
    return NextResponse.json({ error: "Admin name is too long." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  if (!(await isGetListedOrdersSchemaReady(admin))) {
    return NextResponse.json({ error: "Payments aren't fully set up yet." }, { status: 503 });
  }

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, owner_id, package_key, status, discount_percent")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  if (!isGetListedPackageKey(campaign.package_key)) {
    return NextResponse.json({ error: "Invalid package on this campaign." }, { status: 400 });
  }

  let { data: order } = await admin
    .from("orders")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("payment_status", "pending")
    .maybeSingle();

  if (!order) {
    if (campaign.status !== "awaiting_payment") {
      return NextResponse.json(
        { error: "This campaign has no pending order and isn't awaiting payment." },
        { status: 409 },
      );
    }
    const pricing = computeGetListedPricing(campaign.package_key, campaign.discount_percent ?? 0);
    const { data: created, error: createError } = await admin
      .from("orders")
      .insert({
        campaign_id: campaign.id,
        owner_id: campaign.owner_id,
        provider: "lemonsqueezy",
        package_key: campaign.package_key,
        base_amount: pricing.baseAmountCents,
        discount_percent: pricing.discountPercent,
        discount_amount: pricing.discountAmountCents,
        final_amount: pricing.finalAmountCents,
        currency: "USD",
        payment_status: "pending",
      })
      .select("*")
      .single();
    if (createError || !created) {
      return NextResponse.json({ error: "Could not create an order to reconcile." }, { status: 500 });
    }
    order = created;
  }

  const { data: finalized, error: finalizeError } = await admin.rpc("finalize_get_listed_order", {
    p_order_id: order.id,
    p_provider_order_id: paymentReference,
  });

  if (finalizeError) {
    return NextResponse.json({ error: "Could not finalize payment." }, { status: 500 });
  }
  if (!finalized) {
    return NextResponse.json({ error: "This order was already paid, nothing to reconcile." }, { status: 409 });
  }

  await admin.from("payment_reconciliations").insert({
    order_id: order.id,
    campaign_id: campaign.id,
    admin_identifier: adminName || "admin",
    reason,
    payment_reference: paymentReference,
  });
  await logAdminAction(admin, {
    campaignId: campaign.id,
    action: "payment_reconciled",
    adminIdentifier: adminName || "admin",
    metadata: { reason, payment_reference: paymentReference },
  });

  const { data: updatedCampaign } = await admin.from("campaigns").select("*").eq("id", campaignId).single();

  return NextResponse.json({ campaign: updatedCampaign, order: finalized });
}
