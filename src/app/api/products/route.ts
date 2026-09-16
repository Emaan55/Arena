import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getArenaState } from "@/lib/arena-state";
import {
  pairUnmatchedProducts,
  logActivity,
  markStaleWaitingProductsUnique,
  isProductFaviconColumnReady,
} from "@/lib/arena";
import { getClientIp } from "@/lib/fingerprint";
import { rateLimit } from "@/lib/rate-limit";
import { generateEditToken, hashEditToken } from "@/lib/edit-token";
import { parseBattleFields } from "@/lib/product-fields";
import { CATEGORIES, type Category } from "@/types/database";
import { normalizeUrl } from "@/lib/url";
import { toSearchPattern } from "@/lib/search";
import { resolveAndStoreProductFavicon } from "@/lib/favicon-service";

const MIN_FILL_TIME_MS = 1200;
const LIST_LIMIT = 100;
const LIST_QUERY_MAX = 80;

/**
 * Browsable list of Arena products for the sponsorship picker ("Select an
 * Arena product") — anyone can sponsor any listed product, so this needs
 * the whole catalog, not just what a submitter's browser happens to hold
 * an edit token for. Optional `?q=` narrows it client-side-search-style.
 */
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`products-list:${ip}`, 60, 60 * 1000)) {
    return NextResponse.json({ error: "Slow down and try again shortly." }, { status: 429 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, LIST_QUERY_MAX);
  const admin = createAdminSupabaseClient();

  // An explicit column list (unlike select("*")) fails outright if a named
  // column doesn't exist yet — guard so this picker still works before
  // migration 0011 has been run.
  const faviconReady = await isProductFaviconColumnReady(admin);
  const columns = `id,name,category,url,pitch${faviconReady ? ",logo_url" : ""}`;

  let query = admin.from("products").select(columns).order("name", { ascending: true }).limit(LIST_LIMIT);
  if (q) {
    query = query.ilike("name", toSearchPattern(q));
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Could not load products." }, { status: 500 });
  }

  const products = (data ?? []).map((row) => {
    const r = row as unknown as Record<string, unknown>;
    return { ...r, logo_url: faviconReady ? ((r.logo_url as string | null | undefined) ?? null) : null };
  });

  return NextResponse.json({ products });
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`submit:${ip}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many submissions. Try again in a few minutes." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const record = (body ?? {}) as Record<string, unknown>;
  const { name, url, category, pitch, website, renderedAt } = record;

  // Honeypot: a real user never sees or fills this field.
  if (typeof website === "string" && website.trim() !== "") {
    return NextResponse.json({ error: "Could not submit product. Please try again." }, { status: 400 });
  }
  // A form submitted faster than a human could plausibly fill it out.
  if (typeof renderedAt !== "number" || Date.now() - renderedAt < MIN_FILL_TIME_MS) {
    return NextResponse.json({ error: "Could not submit product. Please try again." }, { status: 400 });
  }

  if (typeof name !== "string" || !name.trim() || name.trim().length > 80) {
    return NextResponse.json({ error: "Product name is required (max 80 characters)." }, { status: 400 });
  }
  if (typeof pitch !== "string" || !pitch.trim() || pitch.trim().length > 140) {
    return NextResponse.json(
      { error: "One-line pitch is required (max 140 characters)." },
      { status: 400 },
    );
  }
  if (typeof category !== "string" || !CATEGORIES.includes(category as Category)) {
    return NextResponse.json({ error: "Invalid category." }, { status: 400 });
  }
  if (typeof url !== "string") {
    return NextResponse.json({ error: "URL is required." }, { status: 400 });
  }
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    return NextResponse.json({ error: "Please enter a valid URL." }, { status: 400 });
  }

  const battleFields = parseBattleFields(record);
  if (!battleFields.ok) {
    return NextResponse.json({ error: battleFields.error }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  const { data: existing } = await admin
    .from("products")
    .select("id")
    .ilike("url", normalizedUrl)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "This product has already been submitted to the arena." },
      { status: 409 },
    );
  }

  const editToken = generateEditToken();

  const { data: product, error } = await admin
    .from("products")
    .insert({
      name: name.trim(),
      url: normalizedUrl,
      pitch: pitch.trim(),
      category: category as Category,
      status: "active",
      wins: 0,
      is_defending: false,
      ...battleFields.fields,
      edit_token_hash: hashEditToken(editToken),
    })
    .select()
    .single();

  if (error || !product) {
    return NextResponse.json({ error: "Could not submit product. Please try again." }, { status: 500 });
  }

  // Auto favicon discovery — reuses the same multi-strategy pipeline every
  // other favicon call site uses (lib/favicon-service.ts), storing our own
  // copy keyed by this product's id (hence running after the insert, once
  // an id actually exists). Never a manual upload. Guarded so a submission
  // still succeeds normally if migration 0011 hasn't been run yet, and a
  // genuine discovery failure just leaves logo_url null to be retried by
  // backfillMissingProductFavicons rather than failing the submission.
  if (await isProductFaviconColumnReady(admin)) {
    const logoUrl = await resolveAndStoreProductFavicon(admin, product.id, normalizedUrl);
    if (logoUrl) {
      await admin.from("products").update({ logo_url: logoUrl }).eq("id", product.id);
      product.logo_url = logoUrl;
    }
  }

  await logActivity(admin, `🆕 ${product.name} just entered the arena in ${category}`);
  await pairUnmatchedProducts(admin, category as Category);
  await markStaleWaitingProductsUnique(admin);

  const state = await getArenaState(admin);
  // editToken is returned exactly once, in plaintext, to the submitter's
  // browser — the DB only ever stores its hash. It's the sole credential
  // for editing this product later (see PATCH /api/products/[id]); losing
  // it means losing edit access, same trade-off as an API key.
  return NextResponse.json({ product, state, editToken }, { status: 201 });
}
