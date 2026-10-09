import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
import { getArenaState } from "@/lib/arena-state";
import { isProductFaviconColumnReady } from "@/lib/arena";
import { getClientIp } from "@/lib/fingerprint";
import { rateLimit } from "@/lib/rate-limit";
import { validateProductSubmission, createArenaProduct } from "@/lib/product-submission";
import { isFreeSubmissionSchemaReady } from "@/lib/free-submission";
import { toSearchPattern } from "@/lib/search";

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

/**
 * The free-earned submission path: requires 5 distinct valid votes and 2
 * valid reviews (see lib/free-submission.ts), enforced entirely
 * server-side via the claim_free_submission() Postgres function — the
 * client never sends progress, only ever finds out whether it's eligible
 * by trying. Paying $1 instead goes through /api/submit/checkout, and
 * admin submissions go through /api/admin/products; all three end up at
 * the same createArenaProduct().
 */
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

  const validation = validateProductSubmission(record, { checkHoneypot: true });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const supabaseAuth = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to earn and use a free submission." }, { status: 401 });
  }

  if (!rateLimit(`submit:user:${user.id}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many submissions. Try again in a few minutes." },
      { status: 429 },
    );
  }

  const admin = createAdminSupabaseClient();
  if (!(await isFreeSubmissionSchemaReady(admin))) {
    return NextResponse.json({ error: "Free submissions aren't set up yet. Try paying $1 to submit instead." }, { status: 503 });
  }

  // Atomic, server-authoritative: recomputes vote/review counts and
  // reserves one claim in the same transaction (see migration 0022), so
  // the client's displayed progress is never trusted for the actual
  // decision, and two simultaneous requests can never both consume the
  // same single earned submission.
  const { data: claimId, error: claimError } = await admin.rpc("claim_free_submission", { p_user_id: user.id });
  if (claimError) {
    return NextResponse.json({ error: "Could not check your free submission eligibility. Please try again." }, { status: 500 });
  }
  if (!claimId) {
    return NextResponse.json(
      { error: "You haven't earned a free submission yet. Vote on 5 duels and leave 2 reviews, or pay $1 to submit now." },
      { status: 403 },
    );
  }

  const result = await createArenaProduct(admin, validation.fields, user.id);
  if (!result.ok) {
    // A validation/duplicate-URL failure at this point shouldn't burn an
    // earned free submission — refund the claim.
    await admin.from("free_submission_claims").delete().eq("id", claimId);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await admin.from("free_submission_claims").update({ product_id: result.product.id }).eq("id", claimId);

  const state = await getArenaState(admin);
  // editToken is returned exactly once, in plaintext, to the submitter's
  // browser — the DB only ever stores its hash. It's the sole credential
  // for editing this product later (see PATCH /api/products/[id]); losing
  // it means losing edit access, same trade-off as an API key.
  return NextResponse.json({ product: { ...result.product, owner_id: null, edit_token_hash: null }, state, editToken: result.editToken }, { status: 201 });
}
