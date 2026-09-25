import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/lemonsqueezy";
import { applyBoost, applyDefend, applyRevive } from "@/lib/arena";
import { createSponsorship } from "@/lib/sponsorship";
import { isSponsorDuration } from "@/lib/sponsorship-constants";
import { isGetListedOrdersSchemaReady } from "@/lib/get-listed/orders";
import { logAdminAction } from "@/lib/get-listed/audit";
import { logSecurityEvent } from "@/lib/security-log";
import type { PaymentType } from "@/types/database";

interface LemonSqueezyWebhookPayload {
  meta?: {
    event_name?: string;
    custom_data?: Record<string, string>;
  };
  data?: {
    id?: string;
    attributes?: {
      status?: string;
      total?: number;
      customer_id?: number | string;
      first_order_item?: { variant_id?: number | string };
    };
  };
}

/**
 * Get Listed orders are a distinct payment type from boost/revive/defend/
 * sponsor (the `payments` table above) — they use their own `orders` table
 * and their own atomic finalize_get_listed_order() Postgres function (see
 * migration 0018) so that "mark paid" + "activate the campaign" + "redeem
 * the discount award" happen in one transaction. Reusing the `payments`
 * table's simpler single-insert idempotency guard wouldn't be enough here,
 * since a webhook confirming a Get Listed order has three things to do
 * atomically, not one.
 */
async function handleGetListedOrder(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  payload: LemonSqueezyWebhookPayload,
  custom: Record<string, string>,
) {
  const orderId = custom.order_id;
  if (!orderId) return;

  if (!(await isGetListedOrdersSchemaReady(admin))) {
    logSecurityEvent("get_listed_webhook_schema_not_ready", { orderId });
    return;
  }

  const providerOrderId = payload.data?.id;
  if (!providerOrderId) return;

  // Defense in depth: the amount actually charged should match what we
  // authorized at checkout (custom_price). We still trust our own stored
  // final_amount as the source of truth for what to activate — LemonSqueezy
  // charged exactly what our checkout call specified — but a mismatch here
  // would mean something is wrong upstream and is worth knowing about.
  const { data: orderBefore } = await admin.from("orders").select("final_amount, campaign_id").eq("id", orderId).maybeSingle();
  if (!orderBefore) {
    logSecurityEvent("get_listed_webhook_unknown_order", { orderId, providerOrderId });
    return;
  }
  const chargedTotal = payload.data?.attributes?.total;
  if (typeof chargedTotal === "number" && chargedTotal !== orderBefore.final_amount) {
    logSecurityEvent("get_listed_webhook_amount_mismatch", {
      orderId,
      providerOrderId,
      expected: orderBefore.final_amount,
      actual: chargedTotal,
    });
  }

  const { data: finalized, error } = await admin.rpc("finalize_get_listed_order", {
    p_order_id: orderId,
    p_provider_order_id: providerOrderId,
    p_provider_customer_id: payload.data?.attributes?.customer_id != null ? String(payload.data.attributes.customer_id) : null,
    p_provider_variant_id:
      payload.data?.attributes?.first_order_item?.variant_id != null
        ? String(payload.data.attributes.first_order_item.variant_id)
        : null,
  });

  if (error) {
    logSecurityEvent("get_listed_finalize_error", { orderId, providerOrderId, message: error.message });
    return;
  }
  if (!finalized) {
    // Already processed by an earlier delivery of this same webhook, or
    // the order wasn't pending for some other reason — either way, no
    // further action, exactly the idempotency guarantee the spec asks for.
    return;
  }

  logSecurityEvent("get_listed_order_paid", { orderId, providerOrderId, campaignId: finalized.campaign_id });
  // admin_identifier omitted (not "admin") — this is the real payment
  // webhook confirming payment, not a human admin action, and the
  // activity timeline should say so.
  await logAdminAction(admin, {
    campaignId: finalized.campaign_id,
    action: "payment_received",
    metadata: { provider_order_id: providerOrderId },
  });
}

async function handleGetListedRefund(admin: ReturnType<typeof createAdminSupabaseClient>, providerOrderId: string) {
  if (!(await isGetListedOrdersSchemaReady(admin))) return;

  // Only a currently-paid order can be refunded — never overwrites a
  // pending/failed/cancelled row, and a retried refund webhook for an
  // already-refunded order is a no-op here too.
  const { data: updated } = await admin
    .from("orders")
    .update({ payment_status: "refunded", updated_at: new Date().toISOString() })
    .eq("provider_order_id", providerOrderId)
    .eq("payment_status", "paid")
    .select("id, campaign_id")
    .maybeSingle();

  if (updated) {
    logSecurityEvent("get_listed_order_refunded", { orderId: updated.id, campaignId: updated.campaign_id });
  }
}

/**
 * The single source of truth for granting a paid action: we only ever
 * apply a boost/revive/defend/sponsor here, after verifying LemonSqueezy's
 * signature on the raw body and confirming the order is paid. The
 * `payments` table's unique constraint on `lemonsqueezy_order_id` makes
 * this idempotent against webhook retries.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: LemonSqueezyWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const eventName = payload.meta?.event_name;
  const orderId = payload.data?.id;
  const custom = payload.meta?.custom_data;

  const admin = createAdminSupabaseClient();

  if (eventName === "order_refunded" && orderId) {
    await handleGetListedRefund(admin, orderId);
    return NextResponse.json({ received: true });
  }

  const status = payload.data?.attributes?.status;

  // Only act on a confirmed, paid order carrying the custom data our
  // checkout attached. Anything else (test pings, other event types,
  // unpaid orders) is acknowledged with 200 but ignored.
  if (eventName !== "order_created" || status !== "paid" || !orderId || !custom) {
    return NextResponse.json({ received: true });
  }

  if (custom.type === "get_listed") {
    await handleGetListedOrder(admin, payload, custom);
    return NextResponse.json({ received: true });
  }

  const type = custom.type as PaymentType | undefined;
  const isKnownType = type === "boost" || type === "revive" || type === "defend" || type === "sponsor";
  if (!type || !isKnownType) {
    return NextResponse.json({ received: true });
  }

  const matchId = custom.match_id;
  const durationDays = custom.duration_days ? Number(custom.duration_days) : undefined;
  // An external sponsorship has no product_id at all — it's never added to
  // the Arena. Every other type (boost/revive/defend, and an Arena-product
  // sponsorship) requires one.
  const isExternalSponsor = type === "sponsor" && custom.is_external === "1";
  const productId = custom.product_id;

  if (!isExternalSponsor && !productId) {
    return NextResponse.json({ received: true });
  }
  if (type === "sponsor") {
    if (durationDays === undefined || !isSponsorDuration(durationDays)) {
      return NextResponse.json({ received: true });
    }
    if (isExternalSponsor && (!custom.external_name || !custom.external_url)) {
      return NextResponse.json({ received: true });
    }
  }

  const { error: insertError } = await admin.from("payments").insert({
    lemonsqueezy_order_id: orderId,
    product_id: productId ?? null,
    match_id: matchId ?? null,
    type,
    amount: payload.data?.attributes?.total ?? null,
    status: "completed",
  });

  if (insertError) {
    // 23505 = unique_violation on lemonsqueezy_order_id: this order was
    // already processed by an earlier delivery of the same webhook event.
    // Any other insert error we surface as a failure so LemonSqueezy retries.
    if (insertError.code === "23505") {
      return NextResponse.json({ received: true, alreadyProcessed: true });
    }
    return NextResponse.json({ error: "Could not record payment." }, { status: 500 });
  }

  if (type === "boost" || type === "revive" || type === "defend") {
    const { data: product } = await admin.from("products").select("*").eq("id", productId!).maybeSingle();
    if (!product) return NextResponse.json({ received: true });

    if (type === "boost" && matchId) {
      await applyBoost(admin, matchId, productId!);
    } else if (type === "revive") {
      await applyRevive(admin, product);
    } else if (type === "defend") {
      await applyDefend(admin, product);
    }
  } else if (type === "sponsor" && durationDays !== undefined && isSponsorDuration(durationDays)) {
    await createSponsorship(admin, {
      productId: isExternalSponsor ? undefined : productId,
      external: isExternalSponsor
        ? {
            name: custom.external_name!,
            url: custom.external_url!,
            category: custom.external_category ?? "Other",
            description: custom.external_description ?? "",
          }
        : undefined,
      durationDays,
      isFree: false,
      lemonsqueezyOrderId: orderId,
      amount: payload.data?.attributes?.total ?? undefined,
      founderXHandle: custom.founder_x_handle || null,
      logoUrl: custom.logo_url || null,
    });
  }

  return NextResponse.json({ received: true });
}
