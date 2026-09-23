import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Order } from "@/types/database";
import { computeGetListedPricing } from "./pricing";
import type { GetListedPackageKey } from "./packages";

type AdminClient = SupabaseClient<Database>;

export async function isGetListedOrdersSchemaReady(admin: AdminClient): Promise<boolean> {
  const { error } = await admin.from("orders").select("id").limit(1);
  return !error;
}

/**
 * Reuses an existing pending order for this campaign instead of creating a
 * new row on every retried checkout click — the DB's partial unique index
 * (orders_one_pending_per_campaign_idx) backstops this even under a race,
 * but this lookup avoids hitting that constraint in the first place.
 * Pricing is always recomputed from the current package/discount rather
 * than trusted from an old row, in case the campaign's discount changed
 * between attempts (it can't today, but this keeps the order row honest
 * regardless).
 */
export async function findOrCreatePendingOrder(
  admin: AdminClient,
  params: {
    campaignId: string;
    ownerId: string;
    packageKey: GetListedPackageKey;
    discountPercent: number;
  },
): Promise<Order> {
  const pricing = computeGetListedPricing(params.packageKey, params.discountPercent);

  const { data: existing } = await admin
    .from("orders")
    .select("*")
    .eq("campaign_id", params.campaignId)
    .eq("payment_status", "pending")
    .maybeSingle();

  if (existing) {
    if (
      existing.package_key === params.packageKey &&
      existing.discount_percent === pricing.discountPercent &&
      existing.final_amount === pricing.finalAmountCents
    ) {
      return existing;
    }
    // Pricing inputs changed since the order was created — refresh it in
    // place rather than leaving a stale price a checkout could still honor.
    const { data: updated, error } = await admin
      .from("orders")
      .update({
        package_key: params.packageKey,
        base_amount: pricing.baseAmountCents,
        discount_percent: pricing.discountPercent,
        discount_amount: pricing.discountAmountCents,
        final_amount: pricing.finalAmountCents,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("payment_status", "pending")
      .select("*")
      .single();
    if (!error && updated) return updated;
    return existing;
  }

  const { data: created, error } = await admin
    .from("orders")
    .insert({
      campaign_id: params.campaignId,
      owner_id: params.ownerId,
      provider: "lemonsqueezy",
      package_key: params.packageKey,
      base_amount: pricing.baseAmountCents,
      discount_percent: pricing.discountPercent,
      discount_amount: pricing.discountAmountCents,
      final_amount: pricing.finalAmountCents,
      currency: "USD",
      payment_status: "pending",
    })
    .select("*")
    .single();

  if (error || !created) {
    // Most likely the partial unique index caught a concurrent request
    // that created the pending order first — re-fetch and use that one.
    const { data: raceWinner } = await admin
      .from("orders")
      .select("*")
      .eq("campaign_id", params.campaignId)
      .eq("payment_status", "pending")
      .maybeSingle();
    if (raceWinner) return raceWinner;
    throw new Error("Could not create order.");
  }

  return created;
}
