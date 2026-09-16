import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { createSponsorship, cancelSponsorship, reorderSponsorshipQueue, isSponsorshipSchemaReady } from "@/lib/sponsorship";
import { isSponsorDuration } from "@/lib/sponsorship-constants";
import { resolveFaviconUrl } from "@/lib/url-metadata";
import { normalizeUrl } from "@/lib/url";
import { normalizeXHandle } from "@/lib/x-handle";
import { CATEGORIES, type Category } from "@/types/database";

const PRODUCT_COLS = "id,name,category,url,pitch";
const NAME_MAX = 80;
const DESCRIPTION_MAX = 140;

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

/**
 * Founder grants a free sponsorship slot — the ONLY place a free
 * sponsorship can ever be created (the public checkout route always goes
 * through paid LemonSqueezy checkout). Accepts either an existing Arena
 * product (`productId`) or an arbitrary external URL (`external`), exactly
 * like the paid checkout route.
 */
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
  const record = (body ?? {}) as Record<string, unknown>;
  const days = Number(record.durationDays);
  if (!isSponsorDuration(days)) {
    return NextResponse.json({ error: "Invalid duration." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  if (!(await isSponsorshipSchemaReady(admin))) {
    return NextResponse.json({ error: "Run the pending sponsorship migrations before adding sponsors." }, { status: 503 });
  }

  let founderXHandle: string | null = null;
  if (typeof record.founderXHandle === "string" && record.founderXHandle.trim()) {
    founderXHandle = normalizeXHandle(record.founderXHandle);
    if (!founderXHandle) {
      return NextResponse.json(
        { error: "Enter a valid X handle (letters, numbers, underscore — max 15 characters)." },
        { status: 400 },
      );
    }
  }

  let founderName: string | null = null;
  if (typeof record.founderName === "string" && record.founderName.trim()) {
    const trimmed = record.founderName.trim();
    if (trimmed.length > NAME_MAX) {
      return NextResponse.json({ error: `Founder name must be ${NAME_MAX} characters or fewer.` }, { status: 400 });
    }
    founderName = trimmed;
  }

  const external = (record.external ?? null) as Record<string, unknown> | null;

  if (external) {
    const name = typeof external.name === "string" ? external.name.trim() : "";
    const category = typeof external.category === "string" ? external.category : "";
    const description = typeof external.description === "string" ? external.description.trim() : "";
    const rawUrl = typeof external.url === "string" ? external.url : "";

    if (!name || name.length > NAME_MAX) {
      return NextResponse.json({ error: `Product name is required (max ${NAME_MAX} characters).` }, { status: 400 });
    }
    if (!CATEGORIES.includes(category as Category)) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    }
    if (!description || description.length > DESCRIPTION_MAX) {
      return NextResponse.json(
        { error: `A short description is required (max ${DESCRIPTION_MAX} characters).` },
        { status: 400 },
      );
    }
    const normalizedUrl = normalizeUrl(rawUrl);
    if (!normalizedUrl) {
      return NextResponse.json({ error: "Please enter a valid URL." }, { status: 400 });
    }

    const { data: existing } = await admin
      .from("sponsorships")
      .select("id")
      .eq("external_url", normalizedUrl)
      .in("status", ["queued", "active"])
      .limit(1)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "This product is already sponsored or in the queue." }, { status: 409 });
    }

    const logoUrl = await resolveFaviconUrl(normalizedUrl);
    const sponsorship = await createSponsorship(admin, {
      external: { name, url: normalizedUrl, category, description },
      durationDays: days,
      isFree: true,
      logoUrl,
      founderXHandle,
      founderName,
    });
    if (!sponsorship) {
      return NextResponse.json({ error: "Could not create sponsorship." }, { status: 500 });
    }
    return NextResponse.json({ sponsorship }, { status: 201 });
  }

  const productId = record.productId;
  if (typeof productId !== "string") {
    return NextResponse.json({ error: "Missing product." }, { status: 400 });
  }

  const { data: product } = await admin.from("products").select("id,url").eq("id", productId).maybeSingle();
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

  const logoUrl = await resolveFaviconUrl(product.url);
  const sponsorship = await createSponsorship(admin, {
    productId,
    durationDays: days,
    isFree: true,
    logoUrl,
    founderXHandle,
    founderName,
  });
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
