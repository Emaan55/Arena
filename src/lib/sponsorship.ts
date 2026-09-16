import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Product } from "@/types/database";
import { logActivity } from "./arena";
import type { SponsorDuration } from "./sponsorship-constants";

type AdminClient = SupabaseClient<Database>;

export type SponsorshipRow = Database["public"]["Tables"]["sponsorships"]["Row"];
// `product` is null for an external sponsorship (is_external = true) — see
// resolveSponsorshipDisplay in sponsorship-constants.ts for reading either
// shape uniformly.
export type SponsorshipWithProduct = SponsorshipRow & { product: Product | null };

export interface SponsorshipState {
  active: SponsorshipWithProduct | null;
  queue: SponsorshipWithProduct[];
}

/**
 * Guards against a real charge succeeding while the sponsorship is
 * silently lost: `createSponsorship`'s insert always writes every column
 * below regardless of path (is_external/logo_url from 0008,
 * founder_x_handle from 0009, founder_name from 0010), so if any of those
 * migrations haven't been run yet the insert would fail *after*
 * LemonSqueezy has already taken payment. Both checkout routes call this
 * first and refuse with a clean 503 instead. Keep this list in sync with
 * whatever createSponsorship's insert actually writes.
 */
export async function isSponsorshipSchemaReady(admin: AdminClient): Promise<boolean> {
  const { error } = await admin
    .from("sponsorships")
    .select("is_external, logo_url, founder_x_handle, founder_name")
    .limit(1);
  return !error;
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
    const name = await resolveDisplayName(admin, promoted);
    if (name) await logActivity(admin, `📣 ${name} is now the featured sponsor`);
  }
}

/** Arena-product name lookup, or the stored external name — used only for
 * activity-log copy, where resolveSponsorshipDisplay's fuller shape isn't needed. */
async function resolveDisplayName(
  admin: AdminClient,
  s: Pick<SponsorshipRow, "is_external" | "external_name" | "product_id">,
): Promise<string | null> {
  if (s.is_external) return s.external_name;
  if (!s.product_id) return null;
  const { data: product } = await admin.from("products").select("name").eq("id", s.product_id).maybeSingle();
  return product?.name ?? null;
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

export interface ExternalSponsorInput {
  name: string;
  url: string;
  category: string;
  description: string;
}

/**
 * Queues a new sponsorship — either for an existing Arena product
 * (`productId`) or an arbitrary external URL (`external`, never added to
 * the Arena) — and immediately checks for promotion, so it goes straight
 * to 'active' when the spot is free. The only things that differ between a
 * paid sponsorship (from the LemonSqueezy webhook) and a founder-granted
 * one (from the admin panel) are `isFree`/`lemonsqueezyOrderId`/`amount` —
 * the queue/promotion logic is identical either way.
 */
export async function createSponsorship(
  admin: AdminClient,
  params: {
    productId?: string;
    external?: ExternalSponsorInput;
    durationDays: SponsorDuration;
    isFree: boolean;
    lemonsqueezyOrderId?: string;
    amount?: number;
    /** Resolved once by the caller (checkout route / admin route) via
     * lib/url-metadata.ts — never re-fetched here. */
    logoUrl?: string | null;
    /** Optional, already normalized by the caller via lib/x-handle.ts. */
    founderXHandle?: string | null;
    /** Optional plain display name — admin-only "Add External Product" flow. */
    founderName?: string | null;
  },
): Promise<SponsorshipRow | null> {
  if (!params.productId && !params.external) return null;

  const { data: last } = await admin
    .from("sponsorships")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: sponsorship, error } = await admin
    .from("sponsorships")
    .insert({
      product_id: params.productId ?? null,
      is_external: !!params.external,
      external_name: params.external?.name ?? null,
      external_url: params.external?.url ?? null,
      external_category: params.external?.category ?? null,
      external_description: params.external?.description ?? null,
      logo_url: params.logoUrl ?? null,
      founder_x_handle: params.founderXHandle ?? null,
      founder_name: params.founderName ?? null,
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

  const name = await resolveDisplayName(admin, sponsorship);
  if (name) {
    await logActivity(
      admin,
      params.isFree
        ? `📣 ${name} was added as a featured sponsor by the founder`
        : `📣 ${name} just booked a sponsorship`,
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
