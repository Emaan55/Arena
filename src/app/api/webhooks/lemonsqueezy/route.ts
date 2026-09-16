import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/lemonsqueezy";
import { applyBoost, applyDefend, applyRevive } from "@/lib/arena";
import { createSponsorship } from "@/lib/sponsorship";
import { isSponsorDuration } from "@/lib/sponsorship-constants";
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
    };
  };
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
  const status = payload.data?.attributes?.status;
  const orderId = payload.data?.id;
  const custom = payload.meta?.custom_data;

  // Only act on a confirmed, paid order carrying the custom data our
  // checkout attached. Anything else (test pings, other event types,
  // unpaid orders) is acknowledged with 200 but ignored.
  if (eventName !== "order_created" || status !== "paid" || !orderId || !custom) {
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

  const admin = createAdminSupabaseClient();

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
