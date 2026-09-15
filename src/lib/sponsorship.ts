import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Product } from "@/types/database";
import { logActivity } from "./arena";
import type { SponsorDuration } from "./sponsorship-constants";

type AdminClient = SupabaseClient<Database>;

export type SponsorshipRow = Database["public"]["Tables"]["sponsorships"]["Row"];
export type SponsorshipWithProduct = SponsorshipRow & { product: Product };

export interface SponsorshipState {
  active: SponsorshipWithProduct | null;
  queue: SponsorshipWithProduct[];
}

/**
 * Promotes the next queued sponsorship the instant the active one expires
 * (or immediately, if there simply isn't an active one yet) — same
 * "checked lazily on every state fetch, no cron needed" pattern as
 * markStaleWaitingProductsUnique in lib/arena.ts. Safe to call as often as
 * we like: it's a no-op unless something has actually changed.
 */
export async function promoteSponsorshipQueue(admin: AdminClient) {
  const nowIso = new Date().toISOString();

  const { data: active } = await admin.from("sponsorships").select("*").eq("status", "active").maybeSingle();

  if (active) {
    if (!active.ends_at || active.ends_at > nowIso) return; // still running
    await admin.from("sponsorships").update({ status: "completed" }).eq("id", active.id);
  }

  const { data: next } = await admin
    .from("sponsorships")
    .select("*")
    .eq("status", "queued")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!next) return;

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + next.duration_days * 24 * 60 * 60 * 1000);

  // Guarded by the partial unique index on (status = 'active') — if two
  // requests race to promote the same row, only one update actually lands
  // as the sole active sponsorship; harmless either way.
  const { data: promoted } = await admin
    .from("sponsorships")
    .update({ status: "active", starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() })
    .eq("id", next.id)
    .eq("status", "queued")
    .select()
    .maybeSingle();

  if (promoted) {
    const { data: product } = await admin.from("products").select("name").eq("id", promoted.product_id).maybeSingle();
    if (product) await logActivity(admin, `📣 ${product.name} is now the featured sponsor`);
  }
}

export async function getSponsorshipState(admin: AdminClient): Promise<SponsorshipState> {
  await promoteSponsorshipQueue(admin);

  const [{ data: active }, { data: queue }] = await Promise.all([
    admin
      .from("sponsorships")
      .select("*, product:products!sponsorships_product_id_fkey(*)")
      .eq("status", "active")
      .maybeSingle(),
    admin
      .from("sponsorships")
      .select("*, product:products!sponsorships_product_id_fkey(*)")
      .eq("status", "queued")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  return {
    active: (active as unknown as SponsorshipWithProduct) ?? null,
    queue: (queue ?? []) as unknown as SponsorshipWithProduct[],
  };
}

/**
 * Queues a new sponsorship for a product and immediately checks for
 * promotion, so it goes straight to 'active' when the spot is free. The
 * only thing that differs between a paid sponsorship (from the LemonSqueezy
 * webhook) and a founder-granted one (from the admin panel) is
 * `isFree`/`lemonsqueezyOrderId`/`amount` — the queue/promotion logic is
 * identical either way.
 */
export async function createSponsorship(
  admin: AdminClient,
  params: {
    productId: string;
    durationDays: SponsorDuration;
    isFree: boolean;
    lemonsqueezyOrderId?: string;
    amount?: number;
  },
): Promise<SponsorshipRow | null> {
  const { data: last } = await admin
    .from("sponsorships")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: sponsorship, error } = await admin
    .from("sponsorships")
    .insert({
      product_id: params.productId,
      status: "queued",
      duration_days: params.durationDays,
      is_free: params.isFree,
      amount: params.amount ?? null,
      lemonsqueezy_order_id: params.lemonsqueezyOrderId ?? null,
      position: (last?.position ?? 0) + 1,
    })
    .select()
    .single();

  if (error || !sponsorship) return null;

  const { data: product } = await admin.from("products").select("name").eq("id", params.productId).maybeSingle();
  if (product) {
    await logActivity(
      admin,
      params.isFree
        ? `📣 ${product.name} was added as a featured sponsor by the founder`
        : `📣 ${product.name} just booked a sponsorship`,
    );
  }

  await promoteSponsorshipQueue(admin);
  return sponsorship;
}

/** Cancels a queued or active sponsorship and promotes the next in line. */
export async function cancelSponsorship(admin: AdminClient, id: string): Promise<SponsorshipRow | null> {
  const { data: cancelled } = await admin
    .from("sponsorships")
    .update({ status: "cancelled" })
    .eq("id", id)
    .in("status", ["queued", "active"])
    .select()
    .maybeSingle();
  if (!cancelled) return null;
  await promoteSponsorshipQueue(admin);
  return cancelled;
}

/** Admin-only reordering of the queue — `orderedIds` is the full new order. */
export async function reorderSponsorshipQueue(admin: AdminClient, orderedIds: string[]) {
  await Promise.all(
    orderedIds.map((id, index) =>
      admin.from("sponsorships").update({ position: index }).eq("id", id).eq("status", "queued"),
    ),
  );
}
