import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { createSponsorship, cancelSponsorship, reorderSponsorshipQueue } from "@/lib/sponsorship";
import { isSponsorDuration } from "@/lib/sponsorship-constants";

const PRODUCT_COLS = "id,name,category";

/** Founder-only view of the sponsorship pipeline — active, queued (in
 * order), and recent history. Gated by ADMIN_SECRET (see lib/admin-auth.ts),
 * not RLS: the public `sponsorships` read policy only exposes rows through
 * getSponsorshipState's own narrower select. */
export async function GET(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  const [{ data: active }, { data: queue }, { data: history }] = await Promise.all([
    admin
      .from("sponsorships")
      .select(`*, product:products!sponsorships_product_id_fkey(${PRODUCT_COLS})`)
      .eq("status", "active")
      .maybeSingle(),
    admin
      .from("sponsorships")
      .select(`*, product:products!sponsorships_product_id_fkey(${PRODUCT_COLS})`)
      .eq("status", "queued")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    admin
      .from("sponsorships")
      .select(`*, product:products!sponsorships_product_id_fkey(${PRODUCT_COLS})`)
      .in("status", ["completed", "cancelled"])
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({ active: active ?? null, queue: queue ?? [], history: history ?? [] });
}

/** Founder grants a free sponsorship slot to any existing product. */
export async function POST(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { productId, durationDays } = (body ?? {}) as Record<string, unknown>;

  if (typeof productId !== "string") {
    return NextResponse.json({ error: "Missing product." }, { status: 400 });
  }
  const days = Number(durationDays);
  if (!isSponsorDuration(days)) {
    return NextResponse.json({ error: "Invalid duration." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data: product } = await admin.from("products").select("id").eq("id", productId).maybeSingle();
  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
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

  const sponsorship = await createSponsorship(admin, { productId, durationDays: days, isFree: true });
  if (!sponsorship) {
    return NextResponse.json({ error: "Could not create sponsorship." }, { status: 500 });
  }
  return NextResponse.json({ sponsorship }, { status: 201 });
}

/** Founder reorders the queue — body is the full new order of queued ids. */
export async function PATCH(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { orderedIds } = (body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(orderedIds) || !orderedIds.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "Invalid order." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  await reorderSponsorshipQueue(admin, orderedIds as string[]);
  return NextResponse.json({ ok: true });
}

/** Founder cancels a queued or active sponsorship (?id=). */
export async function DELETE(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const cancelled = await cancelSponsorship(admin, id);
  if (!cancelled) {
    return NextResponse.json({ error: "Sponsorship not found or already resolved." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
